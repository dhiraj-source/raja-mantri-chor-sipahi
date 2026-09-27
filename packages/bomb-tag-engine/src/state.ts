import {
  BOMB_TAG_PHASES,
  type BombTagGameView,
  type BombTagPhase,
  type BombTagPlayerTick,
  type PlayerId,
  type PlayerInfo,
} from '@rmc/shared-types';
import { findTagTarget } from './collision';
import { DEFAULT_BOMB_TAG_CONFIG, type BombTagConfig } from './config';
import { BombTagError } from './errors';
import { generateSpawnPoints, type Vec2 } from './geometry';
import { stepPosition } from './movement';
import { pickIndex, shuffle, type RandomSource } from './random';

export { BOMB_TAG_PHASES, type BombTagPhase };

export interface BombTagPlayerState {
  id: PlayerId;
  name: string;
  pos: Vec2;
  /** Player ka aakhri bheja hua input (clamp hokar store hota hai). PLAYING ke bahar ignore hota hai. */
  direction: Vec2;
  alive: boolean;
  score: number;
  /** Kab se bomb inke paas hai — transfer-cooldown isi se nikalta hai. */
  bombHolderSince: number | null;
}

export interface BombTagState {
  phase: BombTagPhase;
  config: BombTagConfig;
  /** Fixed roster — poore match bhar wahi players (naye add/remove match ke beech nahi hote). */
  playerOrder: PlayerId[];
  players: Record<PlayerId, BombTagPlayerState>;
  round: number;
  bombHolderId: PlayerId | null;
  bombEndsAt: number | null;
  countdownEndsAt: number | null;
  roundWinnerId: PlayerId | null;
  matchWinnerId: PlayerId | null;
}

export type BombTagEvent =
  | { type: 'PLAYING_STARTED' }
  | { type: 'BOMB_TRANSFERRED'; from: PlayerId; to: PlayerId }
  | { type: 'EXPLODED'; playerId: PlayerId }
  | { type: 'ROUND_OVER'; winnerId: PlayerId | null }
  | { type: 'GAME_OVER'; winnerId: PlayerId };

export interface TickResult {
  state: BombTagState;
  events: BombTagEvent[];
}

export interface CreateGameOptions {
  config?: BombTagConfig;
}

function touchDistance(config: BombTagConfig): number {
  return config.playerRadius * 2;
}

/** Round ke liye taaza positions + random bomb-holder — spawn points assign karta hai. */
function setupRound(state: BombTagState, now: number, random: RandomSource): BombTagState {
  const config = state.config;
  const alive = state.playerOrder; // naya round: sab wapas alive
  const spawns = shuffle(generateSpawnPoints(alive.length, config.arenaWidth, config.arenaHeight, config.playerRadius), random);
  const players: Record<PlayerId, BombTagPlayerState> = {};
  alive.forEach((id, i) => {
    const prev = state.players[id];
    players[id] = {
      id,
      name: prev?.name ?? id,
      pos: spawns[i] as Vec2,
      direction: { x: 0, y: 0 },
      alive: true,
      score: prev?.score ?? 0,
      bombHolderSince: null,
    };
  });
  const bombHolderId = alive[pickIndex(alive.length, random)] as PlayerId;
  return {
    ...state,
    players,
    phase: 'COUNTDOWN',
    bombHolderId,
    bombEndsAt: null,
    countdownEndsAt: now + config.countdownMs,
    roundWinnerId: null,
  };
}

/** Room-level player list se ek nayi match state banata hai — pehla round turant COUNTDOWN me shuru hota hai. */
export function createGame(playersInfo: readonly PlayerInfo[], now: number, random: RandomSource, options?: CreateGameOptions): BombTagState {
  const config = options?.config ?? DEFAULT_BOMB_TAG_CONFIG;
  const ids = playersInfo.map((p) => p.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new BombTagError('INVALID_PLAYERS', 'Duplicate player ids.');
  if (ids.length < config.minPlayers || ids.length > config.maxPlayers) {
    throw new BombTagError('INVALID_PLAYERS', `Players must be between ${config.minPlayers} and ${config.maxPlayers}.`);
  }
  const players: Record<PlayerId, BombTagPlayerState> = {};
  for (const p of playersInfo) {
    players[p.id] = { id: p.id, name: p.name, pos: { x: 0, y: 0 }, direction: { x: 0, y: 0 }, alive: true, score: 0, bombHolderSince: null };
  }
  const base: BombTagState = {
    phase: 'COUNTDOWN',
    config,
    playerOrder: ids,
    players,
    round: 1,
    bombHolderId: null,
    bombEndsAt: null,
    countdownEndsAt: null,
    roundWinnerId: null,
    matchWinnerId: null,
  };
  return setupRound(base, now, random);
}

/** Player ka movement input — kabhi bhi bheja ja sakta hai; PLAYING ke alawa `tick` use hi nahi karta. */
export function setInput(state: BombTagState, playerId: PlayerId, direction: Vec2): BombTagState {
  const player = state.players[playerId];
  if (!player) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, direction } } };
}

function aliveIds(state: BombTagState): PlayerId[] {
  return state.playerOrder.filter((id) => state.players[id]?.alive);
}

/** Round khatam ho chuka (0 ya 1 hi alive bache) to state update karke event deta hai, warna null. */
function checkRoundOver(state: BombTagState): { state: BombTagState; event: BombTagEvent | null } {
  const alive = aliveIds(state);
  if (alive.length > 1) return { state, event: null };

  const winnerId = alive[0] ?? null;
  let players = state.players;
  if (winnerId) {
    const winner = players[winnerId] as BombTagPlayerState;
    players = { ...players, [winnerId]: { ...winner, score: winner.score + 1 } };
  }
  const matchWon = winnerId !== null && (players[winnerId] as BombTagPlayerState).score >= state.config.roundsToWin;
  const next: BombTagState = {
    ...state,
    players,
    phase: matchWon ? 'GAME_OVER' : 'ROUND_OVER',
    bombHolderId: null,
    bombEndsAt: null,
    roundWinnerId: winnerId,
    matchWinnerId: matchWon ? winnerId : null,
  };
  return {
    state: next,
    event: matchWon ? { type: 'GAME_OVER', winnerId: winnerId as PlayerId } : { type: 'ROUND_OVER', winnerId },
  };
}

/**
 * Server ka har tick isi function se guzarta hai: movement, bomb-transfer, explosion — sab yahin.
 * `dtMs` = pichle tick se kitna waqt guzra. COUNTDOWN me sirf timer check hota hai (movement
 * nahi), PLAYING ke alawa kuch nahi hota.
 */
export function tick(state: BombTagState, now: number, dtMs: number): TickResult {
  const events: BombTagEvent[] = [];

  if (state.phase === 'COUNTDOWN') {
    if (state.countdownEndsAt !== null && now >= state.countdownEndsAt) {
      const holderId = state.bombHolderId as PlayerId;
      const holder = state.players[holderId] as BombTagPlayerState;
      const playing: BombTagState = {
        ...state,
        phase: 'PLAYING',
        bombEndsAt: now + state.config.bombDurationMs,
        players: { ...state.players, [holderId]: { ...holder, bombHolderSince: now } },
      };
      events.push({ type: 'PLAYING_STARTED' });
      return { state: playing, events };
    }
    return { state, events };
  }

  if (state.phase !== 'PLAYING') return { state, events };

  const config = state.config;
  let players = state.players;

  // 1) Movement — sab alive players apne input ke hisaab se aage badhte hain.
  for (const id of state.playerOrder) {
    const p = players[id];
    if (!p?.alive) continue;
    const pos = stepPosition(p.pos, p.direction, config.playerSpeed, dtMs, config.playerRadius, config.arenaWidth, config.arenaHeight);
    if (pos.x !== p.pos.x || pos.y !== p.pos.y) players = { ...players, [id]: { ...p, pos } };
  }

  let bombHolderId = state.bombHolderId;
  let bombEndsAt = state.bombEndsAt;

  // 2) Bomb transfer — cooldown khatam ho chuka ho tabhi.
  if (bombHolderId) {
    const holder = players[bombHolderId] as BombTagPlayerState;
    const cooledDown = holder.bombHolderSince === null || now - holder.bombHolderSince >= config.transferCooldownMs;
    if (cooledDown) {
      const others = state.playerOrder
        .filter((id) => id !== bombHolderId && players[id]?.alive)
        .map((id) => ({ id, pos: (players[id] as BombTagPlayerState).pos }));
      const targetId = findTagTarget({ id: bombHolderId, pos: holder.pos }, others, touchDistance(config));
      if (targetId) {
        const target = players[targetId] as BombTagPlayerState;
        players = { ...players, [targetId]: { ...target, bombHolderSince: now } };
        bombHolderId = targetId;
        bombEndsAt = now + config.bombDurationMs;
        events.push({ type: 'BOMB_TRANSFERRED', from: holder.id, to: targetId });
      }
    }
  }

  // 3) Explosion — timer khatam.
  let next: BombTagState = { ...state, players, bombHolderId, bombEndsAt };
  if (bombHolderId && bombEndsAt !== null && now >= bombEndsAt) {
    const holder = players[bombHolderId] as BombTagPlayerState;
    players = { ...players, [bombHolderId]: { ...holder, alive: false, bombHolderSince: null } };
    events.push({ type: 'EXPLODED', playerId: bombHolderId });
    next = { ...next, players, bombHolderId: null, bombEndsAt: null };
  }

  // 4) Round-over check.
  const { state: afterRound, event } = checkRoundOver(next);
  if (event) events.push(event);
  return { state: afterRound, events };
}

/** ROUND_OVER se agla round shuru karta hai (GAME_OVER ho chuka ho to caller ise call hi na kare). */
export function startNextRound(state: BombTagState, now: number, random: RandomSource): BombTagState {
  if (state.phase !== 'ROUND_OVER') {
    throw new BombTagError('INVALID_PHASE', `Cannot start next round from ${state.phase}.`);
  }
  return setupRound({ ...state, round: state.round + 1 }, now, random);
}

/**
 * Player disconnect ho gaya (round ke beech me) — turant "eliminate" (spectator ban jaata hai),
 * bomb unke paas thi to kisi doosre alive player ko turant mil jaati hai. RMCS/DG jaisa grace-
 * time yahan jaan-boojh kar nahi hai — bomb ka timer already chhota (~15s) hai, lamba grace
 * period is fast-paced game ke liye theek nahi baithta.
 */
export function forfeit(state: BombTagState, playerId: PlayerId, now: number, random: RandomSource): TickResult {
  const player = state.players[playerId];
  if (!player || !player.alive) return { state, events: [] };
  const events: BombTagEvent[] = [];

  let players = { ...state.players, [playerId]: { ...player, alive: false, bombHolderSince: null } };
  let bombHolderId = state.bombHolderId;
  let bombEndsAt = state.bombEndsAt;

  if (bombHolderId === playerId) {
    const candidates = state.playerOrder.filter((id) => id !== playerId && players[id]?.alive);
    const newHolderId = candidates.length > 0 ? (candidates[pickIndex(candidates.length, random)] as PlayerId) : null;
    if (newHolderId) {
      const newHolder = players[newHolderId] as BombTagPlayerState;
      players = { ...players, [newHolderId]: { ...newHolder, bombHolderSince: now } };
      bombHolderId = newHolderId;
      bombEndsAt = now + state.config.bombDurationMs;
      events.push({ type: 'BOMB_TRANSFERRED', from: playerId, to: newHolderId });
    } else {
      bombHolderId = null;
      bombEndsAt = null;
    }
  }

  const next: BombTagState = { ...state, players, bombHolderId, bombEndsAt };
  const { state: afterRound, event } =
    state.phase === 'PLAYING' || state.phase === 'COUNTDOWN' ? checkRoundOver(next) : { state: next, event: null };
  if (event) events.push(event);
  return { state: afterRound, events };
}

/**
 * Client-facing snapshot — koi chhupi jaankari nahi (RMCS/DG ke ulat, sabko ek jaisa milta hai,
 * isliye `viewerId`/`now` yahan nahi chahiye — bombEndsAt/countdownEndsAt khud absolute server
 * timestamps hain, client apna display-timer khud nikaal leta hai).
 */
export function getGameView(state: BombTagState): BombTagGameView {
  const players: BombTagPlayerTick[] = state.playerOrder
    .map((id) => state.players[id])
    .filter((p): p is BombTagPlayerState => p !== undefined)
    .map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y, alive: p.alive }));
  return {
    phase: state.phase,
    round: state.round,
    roundsToWin: state.config.roundsToWin,
    arenaWidth: state.config.arenaWidth,
    arenaHeight: state.config.arenaHeight,
    playerRadius: state.config.playerRadius,
    players,
    bombHolderId: state.bombHolderId,
    bombEndsAt: state.bombEndsAt,
    countdownEndsAt: state.countdownEndsAt,
    roundWinnerId: state.roundWinnerId,
    matchWinnerId: state.matchWinnerId,
  };
}

/** Match me sabke scores (round-result/scoreboard UI ke liye) — id -> score. */
export function getScores(state: BombTagState): Record<PlayerId, number> {
  const scores: Record<PlayerId, number> = {};
  for (const id of state.playerOrder) scores[id] = state.players[id]?.score ?? 0;
  return scores;
}
