import {
  DRAW_GUESS_PHASES,
  type DrawGuessCorrectGuesser,
  type DrawGuessGameView,
  type DrawGuessPhase,
  type DrawGuessTurnResult,
  type PlayerId,
  type PlayerInfo,
} from '@rmc/shared-types';
import {
  DEFAULT_DRAW_GUESS_CONFIG,
  DEFAULT_SCORING_CONFIG,
  type DrawGuessConfig,
  type ScoringConfig,
} from './config';
import { DrawGuessError } from './errors';
import { isCorrectGuess } from './guess';
import { buildHintOrder, maskWord, revealedIndices } from './mask';
import { pickIndex, type RandomSource } from './random';
import { drawerPoints, guesserPoints } from './scoring';
import { pickWordChoices, type WordFilter } from './words';

export { DRAW_GUESS_PHASES, type DrawGuessPhase };

export interface DrawGuessPlayerState {
  id: PlayerId;
  name: string;
  score: number;
  connected: boolean;
}

export interface DrawGuessState {
  phase: DrawGuessPhase;
  config: DrawGuessConfig;
  scoring: ScoringConfig;
  /** Fixed order — drawer rotation isi array par round-robin chalta hai (fair, deterministic). */
  playerOrder: PlayerId[];
  players: Record<PlayerId, DrawGuessPlayerState>;
  totalTurns: number;
  /** -1 = abhi koi turn shuru nahi hua (LOBBY/COUNTDOWN). */
  turn: number;
  round: number;
  drawerId: PlayerId | null;
  /** Sirf CHOOSING_WORD me bhara hota hai; server-side hi rehta hai (getPlayerView filter karta hai). */
  wordChoices: string[] | null;
  /** SECRET — sirf yahi field kabhi non-drawer ko nahi jaani chahiye. getPlayerView() se bahar mat bhejo. */
  word: string | null;
  hintOrder: number[];
  turnStartedAt: number | null;
  /** DRAWING me turn ka deadline; CHOOSING_WORD me word-select ka deadline; ROUND_RESULTS me agle turn ka time. */
  turnEndsAt: number | null;
  correctGuessers: DrawGuessCorrectGuesser[];
  usedWords: string[];
  history: DrawGuessTurnResult[];
  winnerIds: PlayerId[];
  customWords: readonly string[];
  wordFilter: WordFilter | undefined;
}

export interface CreateGameOptions {
  config?: DrawGuessConfig;
  scoring?: ScoringConfig;
  customWords?: readonly string[];
  wordFilter?: WordFilter;
}

/** Room-level player list se ek nayi (LOBBY) game state banata hai. */
export function createGame(players_: readonly PlayerInfo[], options?: CreateGameOptions): DrawGuessState {
  const config = options?.config ?? DEFAULT_DRAW_GUESS_CONFIG;
  const playerIds = players_.map((p) => p.id);
  const unique = new Set(playerIds);
  if (unique.size !== playerIds.length) {
    throw new DrawGuessError('INVALID_PLAYERS', 'Duplicate player ids.');
  }
  if (playerIds.length < config.minPlayers || playerIds.length > config.maxPlayers) {
    throw new DrawGuessError(
      'INVALID_PLAYERS',
      `Players must be between ${config.minPlayers} and ${config.maxPlayers}.`,
    );
  }
  const players: Record<PlayerId, DrawGuessPlayerState> = {};
  for (const p of players_) players[p.id] = { id: p.id, name: p.name, score: 0, connected: true };
  return {
    phase: 'LOBBY',
    config,
    scoring: options?.scoring ?? DEFAULT_SCORING_CONFIG,
    playerOrder: [...playerIds],
    players,
    totalTurns: config.totalRounds * playerIds.length,
    turn: -1,
    round: 0,
    drawerId: null,
    wordChoices: null,
    word: null,
    hintOrder: [],
    turnStartedAt: null,
    turnEndsAt: null,
    correctGuessers: [],
    usedWords: [],
    history: [],
    winnerIds: [],
    customWords: options?.customWords ?? [],
    wordFilter: options?.wordFilter,
  };
}

function requirePhase(state: DrawGuessState, phase: DrawGuessPhase): void {
  if (state.phase !== phase) {
    throw new DrawGuessError('INVALID_PHASE', `Expected phase ${phase}, got ${state.phase}.`);
  }
}

function requirePlayer(state: DrawGuessState, playerId: PlayerId): DrawGuessPlayerState {
  const player = state.players[playerId];
  if (!player) throw new DrawGuessError('UNKNOWN_PLAYER', `Unknown player: ${playerId}.`);
  return player;
}

/** LOBBY -> COUNTDOWN. Countdown khatam hone par gateway `beginNextTurn` call karega. */
export function startGame(state: DrawGuessState, now: number): DrawGuessState {
  requirePhase(state, 'LOBBY');
  return { ...state, phase: 'COUNTDOWN', turnEndsAt: now + state.config.countdownMs };
}

/** Agla turn shuru karta hai, ya (saare turns ho chuke to) GAME_RESULTS me le jaata hai. */
export function beginNextTurn(state: DrawGuessState, now: number, random: RandomSource): DrawGuessState {
  if (state.phase !== 'COUNTDOWN' && state.phase !== 'ROUND_RESULTS') {
    throw new DrawGuessError('INVALID_PHASE', `Cannot begin next turn from ${state.phase}.`);
  }
  const nextTurn = state.turn + 1;
  if (nextTurn >= state.totalTurns) {
    return finishToResults(state);
  }
  const order = state.playerOrder;
  const drawerId = order[nextTurn % order.length] as PlayerId;
  const round = Math.floor(nextTurn / order.length) + 1;
  const usedWordsSet = new Set(state.usedWords);
  const wordChoices = pickWordChoices(state.config.wordsToChoose, usedWordsSet, random, {
    customWords: state.customWords,
    filter: state.wordFilter,
  });
  return {
    ...state,
    phase: 'CHOOSING_WORD',
    turn: nextTurn,
    round,
    drawerId,
    wordChoices,
    word: null,
    hintOrder: [],
    turnStartedAt: now,
    turnEndsAt: now + state.config.wordSelectMs,
    correctGuessers: [],
  };
}

function finishToResults(state: DrawGuessState): DrawGuessState {
  let best = -1;
  for (const p of Object.values(state.players)) if (p.score > best) best = p.score;
  const winnerIds = Object.values(state.players)
    .filter((p) => p.score === best)
    .map((p) => p.id);
  return { ...state, phase: 'GAME_RESULTS', drawerId: null, word: null, wordChoices: null, winnerIds };
}

function applySelectedWord(state: DrawGuessState, word: string, now: number, random: RandomSource): DrawGuessState {
  return {
    ...state,
    phase: 'DRAWING',
    word,
    wordChoices: null,
    hintOrder: buildHintOrder(word, random),
    usedWords: [...state.usedWords, word],
    turnStartedAt: now,
    turnEndsAt: now + state.config.drawTimeMs,
  };
}

/** Drawer khud ek word chunta hai. */
export function selectWord(
  state: DrawGuessState,
  drawerId: PlayerId,
  word: string,
  now: number,
  random: RandomSource,
): DrawGuessState {
  requirePhase(state, 'CHOOSING_WORD');
  if (state.drawerId !== drawerId) throw new DrawGuessError('NOT_DRAWER', 'Only the drawer selects a word.');
  if (!state.wordChoices?.includes(word)) {
    throw new DrawGuessError('INVALID_WORD_CHOICE', 'Word is not one of the offered choices.');
  }
  return applySelectedWord(state, word, now, random);
}

/** Drawer time par nahi chunta to gateway (deadline par) ise call karta hai — game kabhi atakta nahi. */
export function autoSelectWord(state: DrawGuessState, now: number, random: RandomSource): DrawGuessState {
  requirePhase(state, 'CHOOSING_WORD');
  const choices = state.wordChoices ?? [];
  const idx = pickIndex(choices.length, random);
  const word = (idx >= 0 ? choices[idx] : undefined) as string;
  return applySelectedWord(state, word, now, random);
}

export interface GuessOutcome {
  state: DrawGuessState;
  correct: boolean;
  /** True ho to gateway turn jaldi khatam kar sakta hai (sab guess kar chuke). */
  allGuessed: boolean;
}

/** Ek guess submit karta hai. Server hi decide karta hai sahi hai ya nahi — client kabhi khud nahi. */
export function submitGuess(state: DrawGuessState, playerId: PlayerId, rawGuess: string, now: number): GuessOutcome {
  requirePhase(state, 'DRAWING');
  requirePlayer(state, playerId);
  if (playerId === state.drawerId) throw new DrawGuessError('DRAWER_CANNOT_GUESS', 'Drawer cannot guess.');
  if (state.correctGuessers.some((c) => c.playerId === playerId)) {
    throw new DrawGuessError('ALREADY_GUESSED', 'Already guessed correctly this turn.');
  }
  const word = state.word;
  if (!word || !isCorrectGuess(rawGuess, word, state.config.guessTolerance)) {
    return { state, correct: false, allGuessed: false };
  }
  const rank = state.correctGuessers.length + 1;
  const points = guesserPoints(rank, state.scoring);
  const atMs = state.turnStartedAt !== null ? Math.max(0, now - state.turnStartedAt) : 0;
  const correctGuessers = [...state.correctGuessers, { playerId, rank, points, atMs }];
  const guesser = requirePlayer(state, playerId);
  const nextState: DrawGuessState = {
    ...state,
    correctGuessers,
    players: { ...state.players, [playerId]: { ...guesser, score: guesser.score + points } },
  };
  return { state: nextState, correct: true, allGuessed: allEligibleGuessed(nextState) };
}

/** Drawer chhodkar, abhi connected players jinka guess "count" hota hai. */
export function eligibleGuessers(state: DrawGuessState): PlayerId[] {
  return state.playerOrder.filter((id) => id !== state.drawerId && state.players[id]?.connected);
}

/**
 * Sab eligible (connected, non-drawer) players sahi guess kar chuke — gateway isse disconnect ke
 * baad bhi check kar sakta hai (turn jaldi khatam karne ke liye), sirf naye guess ke baad nahi.
 */
export function allEligibleGuessed(state: DrawGuessState): boolean {
  const eligible = eligibleGuessers(state);
  return eligible.length > 0 && eligible.every((id) => state.correctGuessers.some((c) => c.playerId === id));
}

export interface EndTurnOutcome {
  state: DrawGuessState;
  result: DrawGuessTurnResult;
}

/** Timer khatam ho ya sab guess kar chuke ho ya drawer disconnect ho jaye — gateway isse turn band karta hai. */
export function endTurn(state: DrawGuessState, now: number): EndTurnOutcome {
  requirePhase(state, 'DRAWING');
  const word = state.word as string;
  const drawerId = state.drawerId as PlayerId;
  const dPoints = drawerPoints(state.correctGuessers.length, state.scoring);
  const drawer = state.players[drawerId];
  const players = drawer ? { ...state.players, [drawerId]: { ...drawer, score: drawer.score + dPoints } } : state.players;
  const result: DrawGuessTurnResult = {
    turn: state.turn,
    round: state.round,
    drawerId,
    word,
    correctGuessers: state.correctGuessers,
    drawerPoints: dPoints,
  };
  const nextState: DrawGuessState = {
    ...state,
    players,
    phase: 'ROUND_RESULTS',
    turnEndsAt: now + state.config.roundResultMs,
    history: [...state.history, result],
  };
  return { state: nextState, result };
}

/** GAME_RESULTS dikhaane ke baad (owner ki "roundResultMs jaisa" duration) FINISHED — room cleanup ka signal. */
export function finishGame(state: DrawGuessState): DrawGuessState {
  requirePhase(state, 'GAME_RESULTS');
  return { ...state, phase: 'FINISHED' };
}

/** Disconnect/reconnect — service layer isse call karta hai, game logic khud kuch decide nahi karta. */
export function setConnected(state: DrawGuessState, playerId: PlayerId, connected: boolean): DrawGuessState {
  const player = state.players[playerId];
  if (!player) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, connected } } };
}

// ---------------------------------------------------------------------------
// Player view: SECURITY CHOKEPOINT. Ye function hi tay karta hai browser ko kya dikhta hai.
// `state.word` aur `state.wordChoices` yahan ke alawa kabhi seedha serialize/broadcast mat karo.
// ---------------------------------------------------------------------------

export function getPlayerView(state: DrawGuessState, viewerId: PlayerId | null, now: number): DrawGuessGameView {
  const isDrawer = viewerId !== null && viewerId === state.drawerId;
  const correctGuesserIds = state.correctGuessers.map((c) => c.playerId);

  let maskedWord: string | null = null;
  let wordLength: number | null = null;
  if (state.phase === 'DRAWING' && state.word && state.turnStartedAt !== null) {
    wordLength = state.word.length;
    const elapsed = Math.max(0, now - state.turnStartedAt);
    const revealed = revealedIndices(
      state.hintOrder,
      state.word.length,
      elapsed,
      state.config.hintIntervalMs,
      state.config.maxHintFraction,
    );
    maskedWord = maskWord(state.word, revealed);
  }

  return {
    phase: state.phase,
    players: state.playerOrder
      .map((id) => state.players[id])
      .filter((p): p is DrawGuessPlayerState => p !== undefined)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        hasGuessedCorrectly: correctGuesserIds.includes(p.id),
      })),
    totalRounds: state.config.totalRounds,
    round: state.round,
    turn: state.turn,
    totalTurns: state.totalTurns,
    drawerId: state.drawerId,
    isDrawer,
    wordChoices: isDrawer && state.phase === 'CHOOSING_WORD' ? state.wordChoices : null,
    word: isDrawer && state.phase === 'DRAWING' ? state.word : null,
    maskedWord,
    wordLength,
    turnStartedAt: state.turnStartedAt,
    turnEndsAt: state.turnEndsAt,
    correctGuesserIds,
    myGuessedCorrectly: viewerId !== null && correctGuesserIds.includes(viewerId),
    history: state.history,
    winnerIds: state.winnerIds,
  };
}
