import {
  generateSpawnPoints,
  pickIndex,
  shuffle,
  stepPosition,
  type RandomSource,
  type Vec2,
} from '@rmc/arena-kit';
import {
  FREEZE_TAG_PHASES,
  type FreezeTagGameView,
  type FreezeTagPhase,
  type FreezeTagPlayerStats,
  type FreezeTagPlayerTick,
  type FreezeTagStatus,
  type FreezeTagWinner,
  type PlayerId,
  type PlayerInfo,
} from '@rmc/shared-types';
import { DEFAULT_FREEZE_TAG_CONFIG, type FreezeTagConfig } from './config';
import { FreezeTagError } from './errors';
import { withinRadius } from './proximity';

export { FREEZE_TAG_PHASES, type FreezeTagPhase };

export interface FreezeTagPlayerState {
  id: PlayerId;
  name: string;
  pos: Vec2;
  /** Aakhri bheja hua input (clamp hokar store hota hai). FROZEN player ka kabhi use nahi hota. */
  direction: Vec2;
  status: FreezeTagStatus;
  // ---- Round stats ----
  freezes: number;
  unfreezes: number;
  timesFrozen: number;
  // ---- Timing guards ----
  /** Kab thaw hua — utne der IT dobara freeze nahi kar sakta (`thawImmunityMs`). */
  thawedAt: number | null;
  /** Is player ne aakhri unfreeze kab kiya — spam rokne ke liye (`unfreezeCooldownMs`). */
  lastUnfreezeAt: number | null;
}

export interface FreezeTagState {
  phase: FreezeTagPhase;
  config: FreezeTagConfig;
  /**
   * Abhi round me kaun-kaun hai. Bomb Tag ke "fixed roster" ke ulat, yahan `removePlayer` sach me
   * player ko nikaal deta hai — Bomb Tag me fixed roster ki wajah se chala gaya player agle round
   * me "bhoot" ban kar wapas aa jaata tha (RMC-0031), wo galti yahan dobara nahi ho sakti.
   */
  playerOrder: PlayerId[];
  players: Record<PlayerId, FreezeTagPlayerState>;
  itId: PlayerId | null;
  roundEndsAt: number | null;
  countdownEndsAt: number | null;
  winner: FreezeTagWinner | null;
}

export type FreezeTagEvent =
  | { type: 'PLAYING_STARTED'; itId: PlayerId }
  | { type: 'PLAYER_FROZEN'; playerId: PlayerId; byId: PlayerId }
  | { type: 'PLAYER_UNFROZEN'; playerId: PlayerId; byId: PlayerId }
  | { type: 'IT_CHANGED'; from: PlayerId | null; to: PlayerId }
  | { type: 'ROUND_OVER'; winner: FreezeTagWinner };

export interface TickResult {
  state: FreezeTagState;
  events: FreezeTagEvent[];
}

export interface CreateGameOptions {
  config?: FreezeTagConfig;
}

function isMovable(p: FreezeTagPlayerState): boolean {
  return p.status !== 'FROZEN';
}

/** Round ke liye taaza positions + random IT. */
function setupRound(
  ids: readonly PlayerId[],
  names: Record<PlayerId, string>,
  config: FreezeTagConfig,
  now: number,
  random: RandomSource,
): FreezeTagState {
  const spawns = shuffle(
    generateSpawnPoints(ids.length, config.arenaWidth, config.arenaHeight, config.playerRadius),
    random,
  );
  const itId = ids[pickIndex(ids.length, random)] as PlayerId;
  const players: Record<PlayerId, FreezeTagPlayerState> = {};
  ids.forEach((id, i) => {
    players[id] = {
      id,
      name: names[id] ?? id,
      pos: spawns[i] as Vec2,
      direction: { x: 0, y: 0 },
      status: id === itId ? 'IT' : 'ACTIVE',
      freezes: 0,
      unfreezes: 0,
      timesFrozen: 0,
      thawedAt: null,
      lastUnfreezeAt: null,
    };
  });
  return {
    phase: 'COUNTDOWN',
    config,
    playerOrder: [...ids],
    players,
    itId,
    roundEndsAt: null,
    countdownEndsAt: now + config.countdownMs,
    winner: null,
  };
}

/** Room ke player list se naya round banata hai — IT server hi chunta hai, client kabhi nahi. */
export function createGame(
  playersInfo: readonly PlayerInfo[],
  now: number,
  random: RandomSource,
  options?: CreateGameOptions,
): FreezeTagState {
  const config = options?.config ?? DEFAULT_FREEZE_TAG_CONFIG;
  const ids = playersInfo.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    throw new FreezeTagError('INVALID_PLAYERS', 'Duplicate player ids.');
  }
  if (ids.length < config.minPlayers || ids.length > config.maxPlayers) {
    throw new FreezeTagError(
      'INVALID_PLAYERS',
      `Players must be between ${config.minPlayers} and ${config.maxPlayers}.`,
    );
  }
  const names: Record<PlayerId, string> = {};
  for (const p of playersInfo) names[p.id] = p.name;
  return setupRound(ids, names, config, now, random);
}

/** Movement input — kabhi bhi aa sakta hai; FROZEN player ka input `tick` use hi nahi karta. */
export function setInput(state: FreezeTagState, playerId: PlayerId, direction: Vec2): FreezeTagState {
  const player = state.players[playerId];
  if (!player) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, direction } } };
}

function activeNonItIds(state: FreezeTagState): PlayerId[] {
  return state.playerOrder.filter((id) => state.players[id]?.status === 'ACTIVE');
}

function nonItIds(state: FreezeTagState): PlayerId[] {
  return state.playerOrder.filter((id) => id !== state.itId);
}

/**
 * Round khatam hona chahiye ya nahi. Order jaan-boojh kar fix hai (spec ka race-condition sawaal):
 * pehle "IT jeeta" (kyunki us tick ke freezes already lag chuke hain), phir timer. Yaani agar
 * aakhri player usi tick me freeze hua jis tick timer khatam hua, to IT jeeta — freeze pehle hua.
 *
 * IT ki jeet ke liye kam se kam ek non-IT player ka **maujood** hona zaroori hai aur sab frozen
 * hon. Agar saare opponents khel chhod kar chale gaye, to IT ne kuch "jeeta" nahi — us soorat me
 * round bas khatam ho jaata hai (survivors ki jeet), warna opponent ke quit karne par IT ko muft
 * jeet mil jaati.
 */
function checkRoundOver(state: FreezeTagState, now: number): { state: FreezeTagState; event: FreezeTagEvent | null } {
  if (state.phase !== 'PLAYING') return { state, event: null };

  const others = nonItIds(state);
  let winner: FreezeTagWinner | null = null;
  if (state.itId !== null && others.length > 0 && activeNonItIds(state).length === 0) winner = 'IT';
  // Itne kam log bach gaye ki khel hi nahi sakte — bache hue survivors ki jeet maan lete hain.
  else if (state.playerOrder.length < state.config.minPlayers || others.length === 0) winner = 'PLAYERS';
  else if (state.roundEndsAt !== null && now >= state.roundEndsAt) winner = 'PLAYERS';

  if (winner === null) return { state, event: null };
  return {
    state: { ...state, phase: 'ROUND_OVER', winner },
    event: { type: 'ROUND_OVER', winner },
  };
}

/**
 * Server ka har tick isi se guzarta hai. Tick ke andar order fix hai, isliye do cheezein kabhi
 * "ek saath" nahi hoti (spec ka race-condition sawaal ka asli jawab):
 *
 *   1. movement (frozen players hil hi nahi sakte)
 *   2. unfreeze — sirf un players ka jo is tick ki shuruaat me frozen the
 *   3. freeze   — IT ka tag (abhi-abhi thaw hue player ko immunity milti hai)
 *   4. win check
 *
 * Unfreeze pehle isliye hai taaki ek hi tick me "freeze phir turant unfreeze" wala thrash na ho
 * aur IT ke tag ka matlab bana rahe.
 */
export function tick(state: FreezeTagState, now: number, dtMs: number): TickResult {
  const events: FreezeTagEvent[] = [];

  if (state.phase === 'COUNTDOWN') {
    if (state.countdownEndsAt !== null && now >= state.countdownEndsAt) {
      const playing: FreezeTagState = {
        ...state,
        phase: 'PLAYING',
        roundEndsAt: now + state.config.roundDurationMs,
      };
      events.push({ type: 'PLAYING_STARTED', itId: state.itId as PlayerId });
      return { state: playing, events };
    }
    return { state, events };
  }
  if (state.phase !== 'PLAYING') return { state, events };

  const config = state.config;
  let players = state.players;

  // 1) Movement — frozen player ka input server par hi ignore hota hai.
  for (const id of state.playerOrder) {
    const p = players[id];
    if (!p || !isMovable(p)) continue;
    const pos = stepPosition(
      p.pos,
      p.direction,
      config.playerSpeed,
      dtMs,
      config.playerRadius,
      config.arenaWidth,
      config.arenaHeight,
    );
    if (pos.x !== p.pos.x || pos.y !== p.pos.y) players = { ...players, [id]: { ...p, pos } };
  }

  // 2) Unfreeze — sirf wahi players jo is tick ki shuruaat me frozen the.
  const frozenAtStart = state.playerOrder.filter((id) => players[id]?.status === 'FROZEN');
  if (frozenAtStart.length > 0) {
    for (const rescuerId of state.playerOrder) {
      const rescuer = players[rescuerId];
      // IT kisi ko unfreeze nahi kar sakta; frozen khud bhi nahi kar sakta.
      if (!rescuer || rescuer.status !== 'ACTIVE') continue;
      const cooledDown =
        rescuer.lastUnfreezeAt === null || now - rescuer.lastUnfreezeAt >= config.unfreezeCooldownMs;
      if (!cooledDown) continue;

      const targets = frozenAtStart
        .filter((id) => players[id]?.status === 'FROZEN') // koi aur pehle hi thaw kar chuka ho to chhod do
        .map((id) => ({ id, pos: (players[id] as FreezeTagPlayerState).pos }));
      const [targetId] = withinRadius({ id: rescuerId, pos: rescuer.pos }, targets, config.unfreezeRadius);
      if (!targetId) continue;

      const target = players[targetId] as FreezeTagPlayerState;
      players = {
        ...players,
        [targetId]: { ...target, status: 'ACTIVE', thawedAt: now, timesFrozen: target.timesFrozen },
        [rescuerId]: { ...rescuer, unfreezes: rescuer.unfreezes + 1, lastUnfreezeAt: now },
      };
      events.push({ type: 'PLAYER_UNFROZEN', playerId: targetId, byId: rescuerId });
    }
  }

  // 3) Freeze — IT ka tag.
  const itId = state.itId;
  if (itId && players[itId]) {
    const it = players[itId] as FreezeTagPlayerState;
    const targets = state.playerOrder
      .filter((id) => {
        const p = players[id];
        if (!p || id === itId || p.status !== 'ACTIVE') return false;
        // Abhi-abhi thaw hua hai to thodi der ke liye safe hai.
        return p.thawedAt === null || now - p.thawedAt >= config.thawImmunityMs;
      })
      .map((id) => ({ id, pos: (players[id] as FreezeTagPlayerState).pos }));

    const caught = withinRadius({ id: itId, pos: it.pos }, targets, config.tagRadius);
    if (caught.length > 0) {
      let freezes = it.freezes;
      for (const victimId of caught) {
        const victim = players[victimId] as FreezeTagPlayerState;
        players = {
          ...players,
          [victimId]: { ...victim, status: 'FROZEN', timesFrozen: victim.timesFrozen + 1, direction: { x: 0, y: 0 } },
        };
        freezes += 1;
        events.push({ type: 'PLAYER_FROZEN', playerId: victimId, byId: itId });
      }
      players = { ...players, [itId]: { ...(players[itId] as FreezeTagPlayerState), freezes } };
    }
  }

  // 4) Win check.
  const { state: afterRound, event } = checkRoundOver({ ...state, players }, now);
  if (event) events.push(event);
  return { state: afterRound, events };
}

/**
 * Player round se bilkul nikal gaya (disconnect ya leave). Bomb Tag ki galti se seekh kar yahan
 * player sach me `playerOrder` se hat jaata hai — koi "bhoot" nahi bachta. IT chala gaya to naya
 * IT turant chuna jaata hai (server hi chunta hai).
 */
export function removePlayer(
  state: FreezeTagState,
  playerId: PlayerId,
  now: number,
  random: RandomSource,
): TickResult {
  if (!state.players[playerId]) return { state, events: [] };
  const events: FreezeTagEvent[] = [];

  const players = { ...state.players };
  delete players[playerId];
  const playerOrder = state.playerOrder.filter((id) => id !== playerId);

  let itId = state.itId;
  if (itId === playerId) {
    // Naya IT: pehle active players me se, warna jo bhi bacha ho (sab frozen ho to bhi khel chale).
    const candidates = playerOrder.filter((id) => players[id]?.status === 'ACTIVE');
    const pool = candidates.length > 0 ? candidates : playerOrder;
    const nextIt = pool.length > 0 ? (pool[pickIndex(pool.length, random)] as PlayerId) : null;
    itId = nextIt;
    if (nextIt) {
      const p = players[nextIt] as FreezeTagPlayerState;
      players[nextIt] = { ...p, status: 'IT', thawedAt: null };
      events.push({ type: 'IT_CHANGED', from: playerId, to: nextIt });
    }
  }

  const next: FreezeTagState = { ...state, players, playerOrder, itId };
  const { state: afterRound, event } = checkRoundOver(next, now);
  if (event) events.push(event);
  return { state: afterRound, events };
}

/** Round khatam hone par har player ke stats (result screen ke liye). */
export function getStats(state: FreezeTagState): FreezeTagPlayerStats[] {
  return state.playerOrder
    .map((id) => state.players[id])
    .filter((p): p is FreezeTagPlayerState => p !== undefined)
    .map((p) => ({
      id: p.id,
      freezes: p.freezes,
      unfreezes: p.unfreezes,
      timesFrozen: p.timesFrozen,
      frozenAtEnd: p.status === 'FROZEN',
    }));
}

/** Client-facing snapshot — is game me kuch chhupa nahi hai, isliye sabko ek jaisa view jaata hai. */
export function getGameView(state: FreezeTagState): FreezeTagGameView {
  const players: FreezeTagPlayerTick[] = state.playerOrder
    .map((id) => state.players[id])
    .filter((p): p is FreezeTagPlayerState => p !== undefined)
    .map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y, status: p.status }));
  return {
    phase: state.phase,
    arenaWidth: state.config.arenaWidth,
    arenaHeight: state.config.arenaHeight,
    playerRadius: state.config.playerRadius,
    players,
    itId: state.itId,
    roundEndsAt: state.roundEndsAt,
    countdownEndsAt: state.countdownEndsAt,
    winner: state.winner,
    stats: getStats(state),
  };
}
