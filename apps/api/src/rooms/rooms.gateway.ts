import type { IncomingMessage } from 'node:http';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { WebSocket } from 'ws';
import { TICK_MS as BT_TICK_MS } from '@rmc/bomb-tag-engine';
import { summarizeGameForPlayer } from '@rmc/game-engine';
import {
  RECONNECT_TOKEN_PARAM,
  type BombTagServerMessage,
  type BombTagSettings,
  type DrawGuessServerMessage,
  type DrawGuessSettings,
  type DrawGuessStroke,
  type PlayerId,
  type ServerMessage,
  type VoteChoice,
} from '@rmc/shared-types';
import { AccountsService } from '../accounts/accounts.service';
import { BombTagService, RoomError as BtRoomError } from '../bomb-tag/bomb-tag.service';
import { DrawGuessService, RoomError as DgRoomError } from '../draw-guess/draw-guess.service';
import { FriendsService } from '../friends/friends.service';
import { MatchmakingService } from './matchmaking.service';
import { RateLimiter } from './rate-limiter';
import { RoomError, RoomsService, type FinishedGame, type VoteResolution } from './rooms.service';
import { SessionsService } from './sessions.service';

/** Disconnect ke baad player ko wapas aane ke liye itna time milta hai. */
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 60_000);
/** Grace ke baad baaki players ke paas vote ke liye itna time. */
const VOTE_DURATION_MS = Number(process.env.VOTE_DURATION_MS ?? 30_000);

/**
 * Spam se bachav: ek socket ek second me itne messages se zyada bheje to connection band.
 * Voice chat (WebRTC) shuru hote waqt kai ICE candidates thodi der me aa sakte hain,
 * isliye normal gameplay se zyada rakha hai.
 */
const MAX_MESSAGES_PER_SECOND = Number(process.env.MAX_MESSAGES_PER_SECOND ?? 40);
/** Ek message ka max size (bytes). SDP (voice signaling) 4KB se bada ho sakta hai. */
const MAX_PAYLOAD_BYTES = Number(process.env.MAX_PAYLOAD_BYTES ?? 16_384);
/** Bot Mantri ka guess itni der (ms) me aata hai — insaan jaisa lagne ke liye thoda ruk kar. */
const BOT_GUESS_DELAY_MS = Number(process.env.BOT_GUESS_DELAY_MS ?? 1800);
/** Bomb Tag: round khatam hone ke result-screen ke baad itni der me agla round shuru. */
const BT_ROUND_RESULT_MS = Number(process.env.BT_ROUND_RESULT_MS ?? 5_000);

/** Har socket ek guest player hai. Reconnect: ?token=<secret> se purana player wapas milta hai. */
@WebSocketGateway({ path: '/ws', maxPayload: MAX_PAYLOAD_BYTES })
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private readonly sockets = new Map<PlayerId, WebSocket>();
  private readonly playerOfSocket = new WeakMap<WebSocket, PlayerId>();
  private readonly graceTimers = new Map<PlayerId, NodeJS.Timeout>();
  private readonly voteTimers = new Map<string, NodeJS.Timeout>();
  private readonly botGuessTimers = new Map<string, NodeJS.Timeout>();
  /** Tests me fixed/chhota delay dene ke liye. */
  botGuessDelayMs = BOT_GUESS_DELAY_MS;
  private readonly limiter = new RateLimiter(MAX_MESSAGES_PER_SECOND, 1000);
  /** Ek player 2 second me ek hi invite bhej sakta hai. */
  private readonly inviteLimiter = new RateLimiter(1, 2000);
  /** Draw & Guess: chat/guess spam se bachav (drawing strokes global limiter se hi cover hote hain). */
  private readonly dgChatLimiter = new RateLimiter(5, 3000);
  /** Draw & Guess: ek hi timer per room (jo bhi phase abhi chal raha hai uska deadline). */
  private readonly dgTimers = new Map<string, NodeJS.Timeout>();
  /** Draw & Guess: is room ke chat log me se abhi tak kitni entries broadcast ho chuki hain. */
  private readonly dgChatSent = new Map<string, number>();
  /** Draw & Guess: disconnected player ke wapas aane ka intezaar (RMCS jaisa hi grace time). */
  private readonly dgGraceTimers = new Map<PlayerId, NodeJS.Timeout>();
  /** Bomb Tag: ek hi global tick-loop (continuous movement/bomb simulation), har active room ke liye. */
  private btTickTimer: NodeJS.Timeout | null = null;
  private btLastTickAt: number | null = null;
  /** Bomb Tag: round-result/next-round ke liye per-room timer (RMCS/DG jaisa hi pattern). */
  private readonly btTimers = new Map<string, NodeJS.Timeout>();
  private nextSocketId = 0;
  private readonly socketIds = new WeakMap<WebSocket, string>();

  constructor(
    private readonly rooms: RoomsService,
    private readonly sessions: SessionsService,
    private readonly matchmaking: MatchmakingService,
    private readonly accounts: AccountsService,
    private readonly friends: FriendsService,
    private readonly drawGuess: DrawGuessService,
    private readonly bombTag: BombTagService,
  ) {
    this.rooms.onGameFinished = (game) => void this.rewardPlayers(game);
    this.rooms.onRoundStarted = (code) => this.maybeScheduleBotGuess(code);
    this.accounts.onCharacterChanged = (accountId, characterId) => {
      for (const playerId of this.sessions.playersOf(accountId)) {
        this.rooms.setCharacter(playerId, characterId);
        const code = this.rooms.getRoomCodeOf(playerId);
        if (code) this.broadcastRoom(code);
      }
    };
    this.friends.isOnline = (accountId) => this.isAccountOnline(accountId);
    this.friends.onChange = (accountIds) => accountIds.forEach((id) => this.notifyAccount(id));

    // Draw & Guess: ek hi generic scheduler — jo bhi phase abhi hai, uska turnEndsAt padh kar
    // agla timer set karta hai; fire hone par phase dobara check karke sahi transition chalata hai.
    const rescheduleDg = (code: string) => this.scheduleDgTimer(code);
    this.drawGuess.onGameStarted = rescheduleDg;
    this.drawGuess.onChoosingWord = rescheduleDg;
    this.drawGuess.onTurnStarted = rescheduleDg;
    this.drawGuess.onTurnEnded = rescheduleDg;
    this.drawGuess.onGameFinished = (code) => this.clearDgTimer(code);

    // Bomb Tag: round khatam ho (ya match khatam ho) to result screen ke liye ek chhota pause,
    // phir agla round apne aap (match khatam ho chuka ho to nahi).
    this.bombTag.onRoundOver = (code) => this.armBtRoundTransition(code);
    this.bombTag.onGameOver = (code) => this.clearBtTimer(code);
  }

  onModuleInit(): void {
    // Bomb Tag: ek hi global ticker — jitne bhi rooms abhi PLAYING/COUNTDOWN me hain, sabko step
    // karta hai. Per-room setInterval banane se zyada efficient (10 rooms ho ya 1, ek hi timer).
    this.btLastTickAt = Date.now();
    this.btTickTimer = setInterval(() => this.tickBombTagRooms(), BT_TICK_MS);
  }

  private tickBombTagRooms(): void {
    const now = Date.now();
    const dtMs = this.btLastTickAt !== null ? now - this.btLastTickAt : BT_TICK_MS;
    this.btLastTickAt = now;
    for (const code of this.bombTag.getTickableRoomCodes()) {
      const events = this.bombTag.tickRoom(code, dtMs);
      this.broadcastBtGameView(code);
      // Score sirf round-over/game-over par badalta hai — tabhi roster (BT_ROOM_STATE) bhi bhejo.
      if (events.some((e) => e.type === 'ROUND_OVER' || e.type === 'GAME_OVER')) this.broadcastBtRoom(code);
    }
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
    for (const timer of [
      ...this.graceTimers.values(),
      ...this.voteTimers.values(),
      ...this.botGuessTimers.values(),
      ...this.dgTimers.values(),
      ...this.btTimers.values(),
    ]) {
      clearTimeout(timer);
    }
    this.graceTimers.clear();
    this.voteTimers.clear();
    this.botGuessTimers.clear();
    this.dgTimers.clear();
    this.dgChatSent.clear();
    for (const timer of this.dgGraceTimers.values()) clearTimeout(timer);
    this.dgGraceTimers.clear();
    this.btTimers.clear();
    if (this.btTickTimer) clearInterval(this.btTickTimer);
    this.btTickTimer = null;
  }

  handleConnection(socket: WebSocket, request?: IncomingMessage): void {
    this.watchFlooding(socket);
    const token = this.readToken(request);
    const known = token ? this.sessions.resolve(token) : null;

    if (
      known &&
      (this.rooms.getRoomCodeOf(known) ||
        this.drawGuess.getRoomCodeOf(known) ||
        this.bombTag.getRoomCodeOf(known))
    ) {
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

    const dgCode = this.drawGuess.getRoomCodeOf(playerId);
    if (dgCode) {
      this.drawGuess.handleDrawerDisconnect(dgCode, playerId); // drawer gaya to turn turant khatam, atakna nahi chahiye
      this.drawGuess.setConnected(playerId, false); // host ho to yahi andar turant naya host bhi bana deta hai
      this.broadcastDgRoom(dgCode);
      // RMCS jaisa vote nahi hai (casual game, turn-rotation khud hi kaafi hai) — bas itna:
      // grace time ke andar wapas na aaye to seat khali kar do, room hamesha khelne-layak rahe.
      this.armDgGrace(playerId);
    }

    // Bomb Tag: koi grace time nahi (fast-paced game, bomb ka timer khud ~15s ka hai) — turant
    // forfeit + naya host agar zaroorat ho, service ke andar hi ho jaata hai.
    const btCode = this.bombTag.getRoomCodeOf(playerId);
    if (btCode) {
      this.bombTag.setConnected(playerId, false);
      this.broadcastBtRoom(btCode);
    }

    const code = this.rooms.getRoomCodeOf(playerId);
    if (!code) {
      if (!dgCode && !btCode) this.dropSession(playerId);
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

  /**
   * Voice chat signaling (SDP offer/answer, ICE candidates). Server sirf relay karta hai —
   * `signal` ke andar kya hai kabhi nahi dekhta, bas ye check karta hai ki dono ek hi room me hain.
   * Bots ke paas socket hi nahi hota, isliye unhe kabhi kuch nahi milega (safe).
   */
  @SubscribeMessage('VOICE_SIGNAL')
  voiceSignal(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { toPlayerId?: string; signal?: unknown },
  ): void {
    const playerId = this.playerOfSocket.get(socket);
    const to = body?.toPlayerId;
    if (!playerId || typeof to !== 'string') return;
    const code = this.rooms.getRoomCodeOf(playerId);
    if (!code || code !== this.rooms.getRoomCodeOf(to)) return; // dono same room me hone chahiye
    this.send(to, { event: 'VOICE_SIGNAL', data: { fromPlayerId: playerId, signal: body.signal } });
  }

  /** Apna mute/unmute room ke baaki (bots ke alawa) sabko batao. */
  @SubscribeMessage('VOICE_MUTE')
  voiceMute(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { muted?: boolean }): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    const code = this.rooms.getRoomCodeOf(playerId);
    if (!code) return;
    const muted = Boolean(body?.muted);
    for (const id of this.rooms.getPlayerIds(code)) {
      if (id !== playerId) this.send(id, { event: 'VOICE_MUTE', data: { playerId, muted } });
    }
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

  /** Akela (ya kam) player: room bana kar baaki seats bots se turant bhar kar game shuru. */
  @SubscribeMessage('PLAY_WITH_BOTS')
  playWithBots(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { name?: string }): void {
    this.handle(socket, (id) => {
      const code = this.rooms.playWithBots(id, body?.name as string);
      this.dropFromQueue(id);
      return code;
    });
  }

  @SubscribeMessage('ADD_BOT')
  addBot(@ConnectedSocket() socket: WebSocket): void {
    this.handle(socket, (id) => this.rooms.addBot(id).code);
  }

  @SubscribeMessage('REMOVE_BOT')
  removeBot(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { botId?: string }): void {
    this.handle(socket, (id) => this.rooms.removeBot(id, body?.botId as string));
  }

  // ---------------------------------------------------------------------------
  // Draw & Guess — poori tarah alag game mode, apna room map (DrawGuessService), same socket.
  // ---------------------------------------------------------------------------

  @SubscribeMessage('DG_CREATE_ROOM')
  dgCreateRoom(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { name?: string; settings?: Partial<DrawGuessSettings> },
  ): void {
    this.dgHandle(socket, (id) => this.drawGuess.createRoom(id, body?.name as string, body?.settings));
  }

  @SubscribeMessage('DG_JOIN_ROOM')
  dgJoinRoom(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { code?: string; name?: string },
  ): void {
    this.dgHandle(socket, (id) => this.drawGuess.joinRoom(id, body?.code as string, body?.name as string));
  }

  @SubscribeMessage('DG_LEAVE_ROOM')
  dgLeaveRoom(@ConnectedSocket() socket: WebSocket): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    const oldCode = this.drawGuess.getRoomCodeOf(playerId);
    const code = this.drawGuess.leaveRoom(playerId);
    this.send(playerId, { event: 'DG_ROOM_STATE', data: null });
    this.send(playerId, { event: 'DG_GAME_VIEW', data: null });
    if (code) this.broadcastDgRoom(code);
    else if (oldCode) this.dgChatSent.delete(oldCode); // room khatam ho gaya, ab tracking ki zaroorat nahi
  }

  @SubscribeMessage('DG_READY')
  dgReady(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { ready?: boolean }): void {
    this.dgHandle(socket, (id) => this.drawGuess.setReady(id, Boolean(body?.ready)));
  }

  @SubscribeMessage('DG_UPDATE_SETTINGS')
  dgUpdateSettings(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { settings?: Partial<DrawGuessSettings> },
  ): void {
    this.dgHandle(socket, (id) => this.drawGuess.updateSettings(id, body?.settings ?? {}));
  }

  @SubscribeMessage('DG_KICK_PLAYER')
  dgKickPlayer(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { playerId?: string }): void {
    this.dgGuard(socket, (id) => {
      const { code, kickedId } = this.drawGuess.kickPlayer(id, body?.playerId as string);
      this.send(kickedId, { event: 'DG_ROOM_STATE', data: null });
      this.send(kickedId, { event: 'DG_GAME_VIEW', data: null });
      this.broadcastDgRoom(code);
    });
  }

  @SubscribeMessage('DG_START_GAME')
  dgStartGame(@ConnectedSocket() socket: WebSocket): void {
    this.dgHandle(socket, (id) => this.drawGuess.startGame(id));
  }

  @SubscribeMessage('DG_SELECT_WORD')
  dgSelectWord(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { word?: string }): void {
    this.dgHandle(socket, (id) => this.drawGuess.selectWord(id, body?.word as string));
  }

  /** Ek hi text box guess + chat dono karta hai — service decide karta hai kaunsa hua. */
  @SubscribeMessage('DG_CHAT')
  dgChat(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { text?: string }): void {
    this.dgGuard(socket, (id) => {
      if (!this.dgChatLimiter.allow(id)) throw new DgRoomError('RATE_LIMITED', 'Thoda ruko.');
      const code = this.drawGuess.getRoomCodeOf(id);
      this.drawGuess.chat(id, body?.text as string);
      // broadcastDgRoom naye chat entries (chahe ek call se ek ho ya do — jaise sab guess kar
      // chuke to turn turant khatam hokar CORRECT_GUESS + "word was..." dono ban jaate hain)
      // khud dhoond kar bhej deta hai, yahan alag se track karne ki zaroorat nahi.
      if (code) this.broadcastDgRoom(code);
    });
  }

  /** Sirf drawer draw kar sakta hai — server yahi check karta hai, client ke kehne par bharosa nahi. */
  @SubscribeMessage('DG_STROKE')
  dgStroke(@ConnectedSocket() socket: WebSocket, @MessageBody() body: DrawGuessStroke): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId || !this.drawGuess.isDrawer(playerId)) return;
    const code = this.drawGuess.getRoomCodeOf(playerId);
    if (!code) return;
    for (const id of this.drawGuess.getPlayerIds(code)) {
      if (id !== playerId) this.send(id, { event: 'DG_STROKE', data: { playerId, stroke: body } });
    }
  }

  @SubscribeMessage('DG_END_GAME')
  dgEndGame(@ConnectedSocket() socket: WebSocket): void {
    this.dgHandle(socket, (id) => this.drawGuess.forceEndGame(id));
  }

  @SubscribeMessage('DG_RETURN_TO_LOBBY')
  dgReturnToLobby(@ConnectedSocket() socket: WebSocket): void {
    this.dgHandle(socket, (id) => this.drawGuess.returnToLobby(id));
  }

  /** Jo bhi phase abhi chal raha hai uska deadline padh kar agla timer schedule karta hai. */
  private scheduleDgTimer(code: string): void {
    const endsAt = this.drawGuess.getTurnEndsAt(code);
    this.clearDgTimer(code);
    if (endsAt === null) return;
    const delay = Math.max(0, endsAt - this.drawGuess.now());
    this.dgTimers.set(
      code,
      setTimeout(() => this.fireDgTimer(code), delay),
    );
  }

  private clearDgTimer(code: string): void {
    const timer = this.dgTimers.get(code);
    if (timer) clearTimeout(timer);
    this.dgTimers.delete(code);
  }

  /** Timer fire hua: abhi ka phase dobara check karke sahi transition chalata hai (state badal chuki ho sakti hai). */
  private fireDgTimer(code: string): void {
    this.dgTimers.delete(code);
    const phase = this.drawGuess.getPhase(code);
    if (phase === 'COUNTDOWN' || phase === 'ROUND_RESULTS') this.drawGuess.beginNextTurn(code);
    else if (phase === 'CHOOSING_WORD') this.drawGuess.autoSelectWord(code);
    else if (phase === 'DRAWING') this.drawGuess.endTurn(code);
    else return;
    this.broadcastDgRoom(code);
  }

  private dgHandle(socket: WebSocket, action: (playerId: PlayerId) => string): void {
    this.dgGuard(socket, (playerId) => this.broadcastDgRoom(action(playerId)));
  }

  private dgGuard(socket: WebSocket, action: (playerId: PlayerId) => void): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    try {
      action(playerId);
    } catch (e) {
      this.reportDgError(playerId, e);
    }
  }

  private reportDgError(playerId: PlayerId, e: unknown): void {
    if (e instanceof DgRoomError) {
      this.send(playerId, { event: 'DG_ERROR', data: { code: e.code, message: e.message } });
    } else {
      console.error('Unexpected error in draw-guess action', e);
      this.send(playerId, { event: 'DG_ERROR', data: { code: 'BAD_MESSAGE', message: 'Kuch galat ho gaya.' } });
    }
  }

  /** Player ke wapas aane ka intezaar shuru (purana timer ho to badal deta hai). */
  private armDgGrace(playerId: PlayerId): void {
    const old = this.dgGraceTimers.get(playerId);
    if (old) clearTimeout(old);
    this.dgGraceTimers.set(
      playerId,
      setTimeout(() => this.expireDgGrace(playerId), RECONNECT_GRACE_MS),
    );
  }

  private clearDgGrace(playerId: PlayerId): void {
    const timer = this.dgGraceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.dgGraceTimers.delete(playerId);
  }

  /** Grace time khatam, player wapas nahi aaya: seat khali karo (room hamesha khelne-layak rahe). */
  private expireDgGrace(playerId: PlayerId): void {
    this.dgGraceTimers.delete(playerId);
    const code = this.drawGuess.leaveRoom(playerId);
    this.dropSession(playerId);
    if (code) this.broadcastDgRoom(code);
  }

  /**
   * Room ke har player ko DG room state + uska apna safe game view bhejo. Naye chat/system
   * entries (join/leave/start/turn-transitions waghera kai jagah se `pushSystem` karte hain) bhi
   * yahin se broadcast hote hain — isliye har DG action ke baad sirf ye ek function call karna
   * kaafi hai, alag se kahin "chat bhi bhejo" yaad nahi rakhna padta.
   */
  private broadcastDgRoom(code: string): void {
    const roomView = this.drawGuess.getRoomView(code);
    const chat = this.drawGuess.getChatOf(code);
    const alreadySent = this.dgChatSent.get(code) ?? 0;
    const newEntries = chat.slice(alreadySent);
    this.dgChatSent.set(code, chat.length);

    for (const playerId of this.drawGuess.getPlayerIds(code)) {
      this.send(playerId, { event: 'DG_ROOM_STATE', data: roomView });
      this.send(playerId, { event: 'DG_GAME_VIEW', data: this.drawGuess.getGameViewFor(playerId) });
      for (const entry of newEntries) this.send(playerId, { event: 'DG_CHAT_MESSAGE', data: entry });
    }
  }

  /** ROUND_ACTIVE ka Mantri bot ho to uska guess thodi der baad khud kar do. */
  private maybeScheduleBotGuess(code: string): void {
    const old = this.botGuessTimers.get(code);
    if (old) clearTimeout(old);
    this.botGuessTimers.set(
      code,
      setTimeout(() => {
        this.botGuessTimers.delete(code);
        const task = this.rooms.getBotMantriTask(code); // dobara check: tab tak state badal gayi ho sakti hai
        if (!task || task.options.length === 0) return;
        const guess = task.options[Math.floor(Math.random() * task.options.length)] as string;
        try {
          this.broadcastRoom(this.rooms.submitGuess(task.mantriId, guess));
        } catch (e) {
          this.reportError(task.mantriId, e);
        }
      }, this.botGuessDelayMs),
    );
  }

  /** Queue se hatao aur (agar tha to) is player ko + baaki wait karne walon ko batao. */
  private dropFromQueue(playerId: PlayerId): void {
    if (!this.matchmaking.leave(playerId)) return;
    this.send(playerId, { event: 'QUEUE_STATE', data: null });
    this.notifyQueue();
  }

  private notifyQueue(): void {
    const waiting = this.matchmaking.waiting();
    const names = this.matchmaking.waitingNames();
    for (const id of waiting) this.send(id, { event: 'QUEUE_STATE', data: { size: waiting.length, names } });
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

    this.send(playerId, { event: 'CONNECTED', data: { playerId, token } });
    const accountId = this.sessions.accountOf(playerId);
    if (accountId) this.presenceChanged(accountId); // wapas online

    const dgCode = this.drawGuess.getRoomCodeOf(playerId);
    if (dgCode) {
      this.clearDgGrace(playerId);
      this.drawGuess.setConnected(playerId, true);
      this.broadcastDgRoom(dgCode);
    }
    const btCode = this.bombTag.getRoomCodeOf(playerId);
    if (btCode) {
      this.bombTag.setConnected(playerId, true);
      this.broadcastBtRoom(btCode);
    }

    const code = this.rooms.getRoomCodeOf(playerId);
    if (code) {
      this.rooms.setConnected(playerId, true);
      this.broadcastRoom(code);
    }
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

  // ---------------------------------------------------------------------------
  // Bomb Tag — real-time arena game, apna room map (BombTagService), same socket.
  // Tick loop `onModuleInit`/`tickBombTagRooms` me hai (upar constructor ke paas).
  // ---------------------------------------------------------------------------

  @SubscribeMessage('BT_CREATE_ROOM')
  btCreateRoom(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { name?: string; settings?: Partial<BombTagSettings> },
  ): void {
    this.btHandle(socket, (id) => this.bombTag.createRoom(id, body?.name as string, body?.settings));
  }

  @SubscribeMessage('BT_JOIN_ROOM')
  btJoinRoom(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { code?: string; name?: string },
  ): void {
    this.btHandle(socket, (id) => this.bombTag.joinRoom(id, body?.code as string, body?.name as string));
  }

  @SubscribeMessage('BT_LEAVE_ROOM')
  btLeaveRoom(@ConnectedSocket() socket: WebSocket): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    const code = this.bombTag.leaveRoom(playerId);
    this.send(playerId, { event: 'BT_ROOM_STATE', data: null });
    this.send(playerId, { event: 'BT_GAME_VIEW', data: null });
    if (code) this.broadcastBtRoom(code);
  }

  @SubscribeMessage('BT_READY')
  btReady(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { ready?: boolean }): void {
    this.btHandle(socket, (id) => this.bombTag.setReady(id, Boolean(body?.ready)));
  }

  @SubscribeMessage('BT_UPDATE_SETTINGS')
  btUpdateSettings(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() body: { settings?: Partial<BombTagSettings> },
  ): void {
    this.btHandle(socket, (id) => this.bombTag.updateSettings(id, body?.settings ?? {}));
  }

  @SubscribeMessage('BT_KICK_PLAYER')
  btKickPlayer(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { playerId?: string }): void {
    this.btGuard(socket, (id) => {
      const { code, kickedId } = this.bombTag.kickPlayer(id, body?.playerId as string);
      this.send(kickedId, { event: 'BT_ROOM_STATE', data: null });
      this.send(kickedId, { event: 'BT_GAME_VIEW', data: null });
      this.broadcastBtRoom(code);
    });
  }

  @SubscribeMessage('BT_START_GAME')
  btStartGame(@ConnectedSocket() socket: WebSocket): void {
    this.btHandle(socket, (id) => this.bombTag.startGame(id));
  }

  /** Movement input — har frame client se aa sakta hai, isliye koi error-reporting overhead nahi (chup-chaap ignore/clamp). */
  @SubscribeMessage('BT_INPUT')
  btInput(@ConnectedSocket() socket: WebSocket, @MessageBody() body: { x?: number; y?: number }): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    this.bombTag.setInput(playerId, Number(body?.x), Number(body?.y));
  }

  @SubscribeMessage('BT_END_GAME')
  btEndGame(@ConnectedSocket() socket: WebSocket): void {
    this.btGuard(socket, (id) => {
      const code = this.bombTag.forceEndGame(id);
      this.clearBtTimer(code); // pending round-transition ho to usse cancel karo
      this.broadcastBtRoom(code);
    });
  }

  @SubscribeMessage('BT_RETURN_TO_LOBBY')
  btReturnToLobby(@ConnectedSocket() socket: WebSocket): void {
    this.btHandle(socket, (id) => this.bombTag.returnToLobby(id));
  }

  /** Round result screen ke baad agla round apne aap (match khatam ho chuka ho to `onRoundOver` fire hi nahi hota). */
  private armBtRoundTransition(code: string): void {
    this.clearBtTimer(code);
    this.btTimers.set(
      code,
      setTimeout(() => {
        this.btTimers.delete(code);
        this.bombTag.startNextRound(code);
        this.broadcastBtRoom(code);
      }, BT_ROUND_RESULT_MS),
    );
  }

  private clearBtTimer(code: string): void {
    const timer = this.btTimers.get(code);
    if (timer) clearTimeout(timer);
    this.btTimers.delete(code);
  }

  private btHandle(socket: WebSocket, action: (playerId: PlayerId) => string): void {
    this.btGuard(socket, (playerId) => this.broadcastBtRoom(action(playerId)));
  }

  private btGuard(socket: WebSocket, action: (playerId: PlayerId) => void): void {
    const playerId = this.playerOfSocket.get(socket);
    if (!playerId) return;
    try {
      action(playerId);
    } catch (e) {
      this.reportBtError(playerId, e);
    }
  }

  private reportBtError(playerId: PlayerId, e: unknown): void {
    if (e instanceof BtRoomError) {
      this.send(playerId, { event: 'BT_ERROR', data: { code: e.code, message: e.message } });
    } else {
      console.error('Unexpected error in bomb-tag action', e);
      this.send(playerId, { event: 'BT_ERROR', data: { code: 'BAD_MESSAGE', message: 'Kuch galat ho gaya.' } });
    }
  }

  /** Roster (lobby list/scores/status) badla — har player ko room state + game view dono bhejo. */
  private broadcastBtRoom(code: string): void {
    const roomView = this.bombTag.getRoomView(code);
    for (const id of this.bombTag.getPlayerIds(code)) {
      this.send(id, { event: 'BT_ROOM_STATE', data: roomView });
      this.send(id, { event: 'BT_GAME_VIEW', data: this.bombTag.getGameView(code) });
    }
  }

  /** Tick rate par sirf lean game-view bhejo — roster har frame nahi badalta, isliye alag se bhejne ki zaroorat nahi. */
  private broadcastBtGameView(code: string): void {
    const gameView = this.bombTag.getGameView(code);
    if (!gameView) return;
    for (const id of this.bombTag.getPlayerIds(code)) {
      this.send(id, { event: 'BT_GAME_VIEW', data: gameView });
    }
  }

  private send(
    playerId: PlayerId,
    message: ServerMessage | DrawGuessServerMessage | BombTagServerMessage,
  ): void {
    const socket = this.sockets.get(playerId);
    if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }
}
