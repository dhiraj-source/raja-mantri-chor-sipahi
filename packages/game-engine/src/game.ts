import type {
  GamePhase,
  PlayerGameView,
  PlayerId,
  PlayerInfo,
  Role,
  RoundResult,
} from '@rmc/shared-types';
import { DEFAULT_CONFIG, PLAYERS_PER_GAME, type GameConfig } from './config';
import { GameEngineError } from './errors';
import type { RandomSource } from './random';
import { assignRoles, findPlayerByRole } from './roles';
import { calculateRoundScore } from './scoring';

/**
 * Poori game state. Isme SECRET roles hain, isliye ye sirf server par rehti hai.
 * Browser ko sirf getPlayerView() ka output milta hai.
 * Saare functions "pure" hain: purani state ko change nahi karte, nayi state return karte hain.
 */
export interface GameState {
  readonly phase: GamePhase;
  readonly config: GameConfig;
  readonly players: readonly PlayerInfo[];
  readonly totals: Readonly<Record<PlayerId, number>>;
  readonly roundNumber: number;
  /** Current round ke roles (ROUND_ACTIVE / ROUND_RESULT me set). */
  readonly roles: Readonly<Record<PlayerId, Role>> | null;
  readonly history: readonly RoundResult[];
}

export function createGame(
  players: readonly PlayerInfo[],
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  const ids = players.map((p) => p.id);
  if (
    players.length !== PLAYERS_PER_GAME ||
    new Set(ids).size !== ids.length ||
    players.some((p) => p.id.trim() === '' || p.name.trim() === '')
  ) {
    throw new GameEngineError(
      'INVALID_PLAYERS',
      `Exactly ${PLAYERS_PER_GAME} unique players (id + name) chahiye.`,
    );
  }
  if (!Number.isInteger(config.totalRounds) || config.totalRounds < 1) {
    throw new GameEngineError('INVALID_CONFIG', 'totalRounds kam se kam 1 hona chahiye.');
  }
  return {
    phase: 'LOBBY',
    config,
    players: players.map((p) => ({ ...p })),
    totals: Object.fromEntries(ids.map((id) => [id, 0])),
    roundNumber: 0,
    roles: null,
    history: [],
  };
}

function assertPhase(state: GameState, expected: GamePhase, action: string): void {
  if (state.phase !== expected) {
    throw new GameEngineError(
      'INVALID_PHASE',
      `${action} sirf ${expected} me ho sakta hai, abhi ${state.phase} hai.`,
    );
  }
}

function startRound(state: GameState, random: RandomSource): GameState {
  return {
    ...state,
    phase: 'ROUND_ACTIVE',
    roundNumber: state.roundNumber + 1,
    roles: assignRoles(
      state.players.map((p) => p.id),
      random,
    ),
  };
}

/** LOBBY -> ROUND_ACTIVE (round 1, roles assign). */
export function startGame(state: GameState, random: RandomSource = Math.random): GameState {
  assertPhase(state, 'LOBBY', 'startGame');
  return startRound(state, random);
}

/** ROUND_ACTIVE -> ROUND_RESULT. Sirf Mantri guess kar sakta hai. */
export function submitGuess(
  state: GameState,
  playerId: PlayerId,
  guessedChorId: PlayerId,
): GameState {
  assertPhase(state, 'ROUND_ACTIVE', 'submitGuess');
  const roles = state.roles as Record<PlayerId, Role>;

  if (findPlayerByRole(roles, 'MANTRI') !== playerId) {
    throw new GameEngineError('NOT_MANTRI', 'Sirf Mantri guess kar sakta hai.');
  }
  // Mantri khud ko ya Raja ko Chor nahi keh sakta; sirf Sipahi/Chor me se ek.
  const guessedRole = roles[guessedChorId];
  if (guessedRole !== 'SIPAHI' && guessedRole !== 'CHOR') {
    throw new GameEngineError('INVALID_GUESS', 'Guess Sipahi ya Chor me se ek hona chahiye.');
  }

  const score = calculateRoundScore(roles, guessedChorId, state.config);
  const totals: Record<PlayerId, number> = { ...state.totals };
  for (const [id, pts] of Object.entries(score.points)) {
    totals[id] = (totals[id] ?? 0) + pts;
  }
  const result: RoundResult = {
    round: state.roundNumber,
    roles: { ...roles },
    guessedChorId,
    guessCorrect: score.guessCorrect,
    points: score.points,
  };
  return { ...state, phase: 'ROUND_RESULT', totals, history: [...state.history, result] };
}

/** ROUND_RESULT -> ROUND_ACTIVE (agla round) ya GAME_RESULT (aakhri round ke baad). */
export function nextRound(state: GameState, random: RandomSource = Math.random): GameState {
  assertPhase(state, 'ROUND_RESULT', 'nextRound');
  if (state.roundNumber >= state.config.totalRounds) {
    return { ...state, phase: 'GAME_RESULT', roles: null };
  }
  return startRound(state, random);
}

/** Total points ke hisaab se sorted (zyada se kam). Tie me original player order. */
export function getStandings(state: GameState): { player: PlayerInfo; total: number }[] {
  return state.players
    .map((player) => ({ player, total: state.totals[player.id] ?? 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Sabse zyada points wale sabhi players (tie ho to ek se zyada). */
export function getWinnerIds(state: GameState): PlayerId[] {
  const standings = getStandings(state);
  const best = standings[0]?.total ?? 0;
  return standings.filter((s) => s.total === best).map((s) => s.player.id);
}

/**
 * Ek player ke liye safe view. Secret roles chhupe rehte hain.
 * ROUND_ACTIVE me: sab ko Raja + Mantri dikhte hain, apna role dikhta hai.
 * Sipahi/Chor doosron ke liye hidden. ROUND_RESULT me sab roles khul jaate hain.
 */
export function getPlayerView(state: GameState, viewerId: PlayerId): PlayerGameView {
  const visibleRoles: Record<PlayerId, Role> = {};
  let myRole: Role | null = null;

  if (state.roles) {
    myRole = state.roles[viewerId] ?? null;
    for (const [id, role] of Object.entries(state.roles)) {
      const isPublic = state.phase === 'ROUND_RESULT' || role === 'RAJA' || role === 'MANTRI';
      if (isPublic || id === viewerId) visibleRoles[id] = role;
    }
  }

  return {
    phase: state.phase,
    players: state.players.map((p) => ({ ...p })),
    totalRounds: state.config.totalRounds,
    currentRound: state.roundNumber,
    totals: { ...state.totals },
    visibleRoles,
    myRole,
    canGuess: state.phase === 'ROUND_ACTIVE' && myRole === 'MANTRI',
    winnerIds: state.phase === 'GAME_RESULT' ? getWinnerIds(state) : [],
    history: state.history.map((h) => ({ ...h })),
  };
}
