import type { IncomingMessage } from 'node:http';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { OnModuleDestroy } from '@nestjs/common';
import type { WebSocket } from 'ws';
import { summarizeGameForPlayer } from '@rmc/game-engine';
import {
  RECONNECT_TOKEN_PARAM,
  type PlayerId,
  type ServerMessage,
  type VoteChoice,
} from '@rmc/shared-types';
import { AccountsService } from '../accounts/accounts.service';
import { FriendsService } from '../friends/friends.service';
import { MatchmakingService } from './matchmaking.service';
import { RateLimiter } from './rate-limiter';
import { RoomError, RoomsService, type FinishedGame, type VoteResolution } from './rooms.service';
import { SessionsService } from './sessions.service';

/** Disconnect ke baad player ko wapas aane ke liye itna time milta hai. */
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 60_000);
/** Grace ke baad baaki players ke paas vote ke liye itna time. */
const VOTE_DURATION_MS = Number(process.env.VOTE_DURATION_MS ?? 30_000);

/** Spam se bachav: ek socket ek second me itne messages se zyada bheje to connection band. */
const MAX_MESSAGES_PER_SECOND = Number(process.env.MAX_MESSAGES_PER_SECOND ?? 20);
/** Ek message ka max size (bytes). Isse bada frame aaye to ws connection band kar deta hai. */
const MAX_PAYLOAD_BYTES = 4096;

/** Har socket ek guest player hai. Reconnect: ?token=<secret> se purana player wapas milta hai. */
@WebSocketGateway({ path: '/ws', maxPayload: MAX_PAYLOAD_BYTES })
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly sockets = new Map<PlayerId, WebSocket>();
  private readonly playerOfSocket = new WeakMap<WebSocket, PlayerId>();
  private readonly graceTimers = new Map<PlayerId, NodeJS.Timeout>();
  private readonly voteTimers = new Map<string, NodeJS.Timeout>();
  private readonly limiter = new RateLimiter(MAX_MESSAGES_PER_SECOND, 1000);
  /** Ek player 2 second me ek hi invite bhej sakta hai. */
  private readonly inviteLimiter = new RateLimiter(1, 2000);
  private nextSocketId = 0;
  private readonly socketIds = new WeakMap<WebSocket, string>();

  constructor(
    private readonly rooms: RoomsService,
    private readonly sessions: SessionsService,
    private readonly matchmaking: MatchmakingService,
    private readonly accounts: AccountsService,
    private readonly friends: FriendsService,
  ) {
    this.rooms.onGameFinished = (game) => void this.rewardPlayers(game);
    this.accounts.onCharacterChanged = (accountId, characterId) => {
      for (const playerId of this.sessions.playersOf(accountId)) {
        this.rooms.setCharacter(playerId, characterId);
        const code = this.rooms.getRoomCodeOf(playerId);
        if (code) this.broadcastRoom(code);
      }
    };
    this.friends.isOnline = (accountId) => this.isAccountOnline(accountId);
    this.friends.onChange = (accountIds) => accountIds.forEach((id) => this.notifyAccount(id));
  }

  // ---- Presence (kaun online hai) aur friends ki live khabar ----

  /** Account online = uska kam se kam ek socket abhi connected hai. */
  private isAccountOnline(accountId: string): boolean {
    return this.sessions.playersOf(accountId).some((playerId) => this.sockets.has(playerId));
  }

  /** Is account ke saare connected tabs ko bolo: friends list dobara le lo. */
  private notifyAccount(accountId: string): void {
    for (const playerId of this.sessions.playersOf(accountId)) {
      this.send(playerId, { event: 'FRIENDS_CHANGED' });
    }
  }

  /** Account online/offline hua: uske dosto ko batao. */
  private presenceChanged(accountId: string): void {
    this.friends
      .friendIdsOf(accountId)
      .then((ids) => ids.forEach((id) => this.notifyAccount(id)))
      .catch((e) => console.error('Failed to notify friends', e));
  }

  /** Dost ko room me bulao. Sirf login, lobby, aur online dost ke liye. */
  @SubscribeMessage('INVITE_FRIEND')
  async inviteFriend(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { accountId?: string },
  ): Promise<void> {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    try {
      const me = this.sessions.accountOf(playerId);
      if (!me) throw new RoomError('NOT_LOGGED_IN', 'Invite ke liye login chahiye.');
      const code = this.rooms.getRoomCodeOf(playerId);
      if (!code) throw new RoomError('NOT_IN_ROOM', 'Pehle room banao.');
      if (this.rooms.getRoomView(code)?.status !== 'LOBBY') {
        throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
      }
      if (!this.inviteLimiter.allow(playerId)) throw new RoomError('RATE_LIMITED', 'Thoda ruko.');

      const target = typeof body?.accountId === 'string' ? body.accountId : '';
      if (!(await this.friends.areFriends(me, target))) {
        throw new RoomError('NOT_FRIENDS', 'Ye aapka dost nahi hai.');
      }
      const online = this.sessions.playersOf(target).filter((id) => this.sockets.has(id));
      if (online.length === 0) throw new RoomError('FRIEND_OFFLINE', 'Dost abhi online nahi hai.');
      const free = online.filter((id) => !this.rooms.getRoomCodeOf(id));
      if (free.length === 0) throw new RoomError('FRIEND_BUSY', 'Dost abhi kisi room me hai.');

      const fromName = (await this.friends.displayNameOf(me)) ?? '?';
      for (const id of free) this.send(id, { event: 'INVITE', data: { fromName, roomCode: code } });
    } catch (e) {
      this.reportError(playerId, e);
    }
  }

  /**
   * Game khatam: logged-in players ko XP/coins/achievements. Summary server ki history se banti hai;
   * browser se kuch nahi aata. Ek account ko ek game me ek hi baar reward (multi-tab farming se bachav).
   */
  private async rewardPlayers(game: FinishedGame): Promise<void> {
    const rewarded = new Set<string>();
    for (const player of game.players) {
      const accountId = this.sessions.accountOf(player.id);
      if (!accountId || rewarded.has(accountId)) continue;
      rewarded.add(accountId);
      try {
        const summary = summarizeGameForPlayer(
          game.history,
          player.id,
          game.winnerIds,
          game.totals[player.id] ?? 0,
        );
        const reward = await this.accounts.recordGame(accountId, { roomCode: game.roomCode, summary });
        if (reward) this.send(player.id, { event: 'GAME_REWARD', data: reward });
      } catch (e) {
        console.error('Failed to record game for account', e);
      }
    }
  }

  @SubscribeMessage('AUTHENTICATE')
  async authenticate(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { authToken?: string | null },
  ): Promise<void> {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    const before = this.sessions.accountOf(playerId);
    const accountId = body?.authToken ? this.accounts.authenticate(body.authToken) : null;
    this.sessions.bindAccount(playerId, accountId);
    if (before && before !== accountId) this.presenceChanged(before); // logout / account badla
    if (!accountId) {
      this.rooms.setCharacter(playerId, null);
      this.send(playerId, { event: 'AUTH_STATE', data: null });
      this.refreshRoomOf(playerId);
      return;
    }
    try {
      const profile = await this.accounts.getProfile(accountId);
      this.rooms.setCharacter(playerId, profile.equippedCharacter);
      this.send(playerId, { event: 'AUTH_STATE', data: { displayName: profile.displayName } });
      this.presenceChanged(accountId);
      this.refreshRoomOf(playerId);
    } catch {
      this.sessions.bindAccount(playerId, null);
      this.rooms.setCharacter(playerId, null);
      this.send(playerId, { event: 'AUTH_STATE', data: null });
    }
  }

  /** Session hatao (aur uska avatar bhi, warna memory me padha rehta). */
  private dropSession(playerId: PlayerId): void {
    this.sessions.remove(playerId);
    this.rooms.setCharacter(playerId, null);
  }

  /** Player room me ho to sabko naya (avatar wagairah ke saath) room state bhejo. */
  private refreshRoomOf(playerId: PlayerId): void {
    const code = this.rooms.getRoomCodeOf(playerId);
    if (code) this.broadcastRoom(code);
  }

  onModuleDestroy(): void {
    for (const timer of [...this.graceTimers.values(), ...this.voteTimers.values()]) clearTimeout(timer);
    this.graceTimers.clear();
    this.voteTimers.clear();
  }

  handleConnection(socket: WebSocket, request?: IncomingMessage): void {
    this.watchFlooding(socket);
    const token = this.readToken(request);
    const known = token ? this.sessions.resolve(token) : null;

    if (known && this.rooms.getRoomCodeOf(known)) {
      this.restore(socket, known, token as string);
      return;
    }
    // Purana/invalid token: naya guest player.
    if (known) this.dropSession(known);
    const { playerId, token: newToken } = this.sessions.create();
    this.bind(socket, playerId);
    this.send(playerId, { event: 'CONNECTED', data: { playerId, token: newToken } });
  }

  /** Flood karne wale socket ko turant kaat do (terminate). Normal disconnect flow phir chalta hai. */
  private watchFlooding(socket: WebSocket): void {
    const id = `s${this.nextSocketId++}`;
    this.socketIds.set(socket, id);
    socket.on('message', () => {
      if (!this.limiter.allow(id)) socket.terminate();
    });
  }

  handleDisconnect(socket: WebSocket): void {
    const socketId = this.socketIds.get(socket);
    if (socketId) this.limiter.forget(socketId);
    const playerId = this.playerOfSocket.get(socket);
    // Agar is player ka naya socket aa chuka hai (reconnect/replace), to ye purana socket ignore.
    if (!playerId || this.sockets.get(playerId) !== socket) return;
    this.sockets.delete(playerId);
    const accountId = this.sessions.accountOf(playerId);
    if (accountId) this.presenceChanged(accountId); // ab offline
    // Queue me wait karne wale ke liye reconnect grace nahi: seedha hatao.
    if (this.matchmaking.leave(playerId)) this.notifyQueue();

    const code = this.rooms.getRoomCodeOf(playerId);
    if (!code) {
      this.dropSession(playerId);
      return;
    }
    this.rooms.setConnected(playerId, false);
    this.broadcastRoom(code);
    this.armGrace(playerId);
  }

  @SubscribeMessage('CREATE_ROOM')
  createRoom(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { name?: string }): void {
    this.handle(socket, (id) => {
      const code = this.rooms.createRoom(id, body?.name as string);
      this.dropFromQueue(id);
      return code;
    });
  }

  @SubscribeMessage('JOIN_ROOM')
  joinRoom(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { code?: string; name?: string },
  ): void {
    this.handle(socket, (id) => {
      const code = this.rooms.joinRoom(id, body?.code as string, body?.name as string);
      this.dropFromQueue(id);
      return code;
    });
  }

  @SubscribeMessage('QUICK_MATCH')
  quickMatch(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { name?: string }): void {
    this.guard(socket, (playerId) => {
      const { code } = this.matchmaking.join(playerId, body?.name as string);
      if (!code) {
        this.notifyQueue();
        return;
      }
      // Match ban gaya: in sabko queue se nikalo aur room + game ka state bhejo.
      for (const id of this.rooms.getPlayerIds(code)) this.send(id, { event: 'QUEUE_STATE', data: null });
      this.broadcastRoom(code);
    });
  }

  @SubscribeMessage('CANCEL_QUICK_MATCH')
  cancelQuickMatch(@ConnectedSocket() socket: WebSocket): void {
    const playerId = this.playerOfSocket.get(socket);
    if (playerId) this.dropFromQueue(playerId);
  }

  @SubscribeMessage('REACTION')
  reaction(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { emoji?: string }): void {
    this.guard(socket, (playerId) => {
      const { code, emoji } = this.rooms.reaction(playerId, body?.emoji);
      for (const id of this.rooms.getPlayerIds(code)) {
        this.send(id, { event: 'REACTION', data: { playerId, emoji } });
      }
    });
  }

  @SubscribeMessage('LEAVE_ROOM')
  leaveRoom(@ConnectedSocket() socket: WebSocket): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    const code = this.rooms.leaveRoom(playerId);
    this.send(playerId, { event: 'ROOM_STATE', data: null });
    this.send(playerId, { event: 'GAME_VIEW', data: null });
    if (code) this.broadcastRoom(code);
  }

  @SubscribeMessage('START_GAME')
  startGame(@ConnectedSocket() socket: WebSocket): void {
    this.handle(socket, (id) => this.rooms.startGame(id));
  }

  @SubscribeMessage('SUBMIT_GUESS')
  submitGuess(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { guessedChorId?: string },
  ): void {
    this.handle(socket, (id) => this.rooms.submitGuess(id, body?.guessedChorId as string));
  }

  @SubscribeMessage('NEXT_ROUND')
  nextRound(@ConnectedSocket() socket: WebSocket): void {
    this.handle(socket, (id) => this.rooms.nextRound(id));
  }

  @SubscribeMessage('REMATCH')
  rematch(@ConnectedSocket() socket: WebSocket): void {
    this.handle(socket, (id) => this.rooms.rematch(id));
  }

  @SubscribeMessage('VOTE')
  vote(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { choice?: VoteChoice }): void {
    this.guard(socket, (playerId) => {
      const { code, resolution } = this.rooms.castVote(playerId, body?.choice as VoteChoice);
      if (resolution) this.applyResolution(code, resolution);
      else this.broadcastRoom(code);
    });
  }

  /** Queue se hatao aur (agar tha to) is player ko + baaki wait karne walon ko batao. */
  private dropFromQueue(playerId: PlayerId): void {
    if (!this.matchmaking.leave(playerId)) return;
    this.send(playerId, { event: 'QUEUE_STATE', data: null });
    this.notifyQueue();
  }

  private notifyQueue(): void {
    const waiting = this.matchmaking.waiting();
    for (const id of waiting) this.send(id, { event: 'QUEUE_STATE', data: { size: waiting.length } });
  }

  private bind(socket: WebSocket, playerId: PlayerId): void {
    this.sockets.set(playerId, socket);
    this.playerOfSocket.set(socket, playerId);
  }

  /** Purana player wapas: naya socket bind, grace timer band, sabko update. */
  private restore(socket: WebSocket, playerId: PlayerId, token: string): void {
    const timer = this.graceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(playerId);

    const old = this.sockets.get(playerId);
    this.bind(socket, playerId); // pehle bind, taaki purane socket ka close ignore ho
    if (old && old !== socket) old.close(4000, 'replaced by a new connection');

    this.rooms.setConnected(playerId, true);
    this.send(playerId, { event: 'CONNECTED', data: { playerId, token } });
    const accountId = this.sessions.accountOf(playerId);
    if (accountId) this.presenceChanged(accountId); // wapas online
    this.broadcastRoom(this.rooms.getRoomCodeOf(playerId) as string);
  }

  /** Player ke wapas aane ka intezaar shuru (purana timer ho to badal deta hai). */
  private armGrace(playerId: PlayerId): void {
    const old = this.graceTimers.get(playerId);
    if (old) clearTimeout(old);
    this.graceTimers.set(
      playerId,
      setTimeout(() => this.expire(playerId), RECONNECT_GRACE_MS),
    );
  }

  /**
   * Grace time khatam. Game chal raha ho aur koi aur connected ho => baaki players vote karte hain
   * (wait / cancel). Warna (lobby me, ya sab gayab) => player seedha room se hata do.
   */
  private expire(playerId: PlayerId): void {
    this.graceTimers.delete(playerId);
    const code = this.rooms.getRoomCodeOf(playerId);
    if (code && (this.rooms.hasVote(code) || this.rooms.canOpenVote(code))) {
      if (this.rooms.hasVote(code)) this.armGrace(playerId); // vote chal raha hai, baad me dekhenge
      else this.openVote(code);
      return;
    }
    const left = this.rooms.leaveRoom(playerId);
    this.dropSession(playerId);
    if (left) this.broadcastRoom(left);
  }

  private openVote(code: string): void {
    if (!this.rooms.openVote(code, VOTE_DURATION_MS)) return;
    this.voteTimers.set(
      code,
      setTimeout(() => this.onVoteTimeout(code), VOTE_DURATION_MS),
    );
    this.broadcastRoom(code);
  }

  /** Time khatam aur majority nahi bani => WAIT (intezaar). */
  private onVoteTimeout(code: string): void {
    this.voteTimers.delete(code);
    const resolution = this.rooms.resolveVote(code, 'WAIT');
    if (resolution) this.applyResolution(code, resolution);
  }

  /** Vote ka nateeja lagu: CANCEL me gayab players hat chuke hain; WAIT me unka grace phir shuru. */
  private applyResolution(code: string, resolution: VoteResolution): void {
    const timer = this.voteTimers.get(code);
    if (timer) clearTimeout(timer);
    this.voteTimers.delete(code);

    if (resolution.choice === 'CANCEL') {
      for (const id of resolution.removed) {
        const grace = this.graceTimers.get(id);
        if (grace) clearTimeout(grace);
        this.graceTimers.delete(id);
        this.dropSession(id);
      }
    } else {
      for (const id of this.rooms.getDisconnectedIds(code)) this.armGrace(id);
    }
    if (this.rooms.getRoomView(code)) this.broadcastRoom(code);
  }

  private readToken(request?: IncomingMessage): string | null {
    if (!request?.url) return null;
    try {
      return new URL(request.url, 'http://localhost').searchParams.get(RECONNECT_TOKEN_PARAM);
    } catch {
      return null;
    }
  }

  /** Action chalao; success par room ke sabhi players ko naya state bhejo, fail par sirf is player ko error. */
  private handle(socket: WebSocket, action: (playerId: PlayerId) => string): void {
    this.guard(socket, (playerId) => this.broadcastRoom(action(playerId)));
  }

  /** Errors sirf bhejne wale player ko jate hain; server crash nahi hota. */
  private guard(socket: WebSocket, action: (playerId: PlayerId) => void): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    try {
      action(playerId);
    } catch (e) {
      this.reportError(playerId, e);
    }
  }

  /** RoomError player ko seedha; koi anjaan error log hota hai aur player ko generic message. */
  private reportError(playerId: PlayerId, e: unknown): void {
    if (e instanceof RoomError) {
      this.send(playerId, { event: 'ERROR', data: { code: e.code, message: e.message } });
    } else {
      console.error('Unexpected error in room action', e);
      this.send(playerId, { event: 'ERROR', data: { code: 'BAD_MESSAGE', message: 'Kuch galat ho gaya.' } });
    }
  }

  /** Room ke har player ko room state + uska apna safe game view bhejo. */
  private broadcastRoom(code: string): void {
    // Vote khatam ho chuka (jaise gayab player wapas aa gaya) to uska timer band.
    const voteTimer = this.voteTimers.get(code);
    if (voteTimer && !this.rooms.hasVote(code)) {
      clearTimeout(voteTimer);
      this.voteTimers.delete(code);
    }
    const roomView = this.rooms.getRoomView(code);
    for (const playerId of this.rooms.getPlayerIds(code)) {
      this.send(playerId, { event: 'ROOM_STATE', data: roomView });
      this.send(playerId, { event: 'GAME_VIEW', data: this.rooms.getGameViewFor(playerId) });
    }
  }

  private send(playerId: PlayerId, message: ServerMessage): void {
    const socket = this.sockets.get(playerId);
    if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }
}
