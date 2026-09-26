import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAW_GUESS_CONFIG, DEFAULT_SCORING_CONFIG } from '../src/config';
import { DrawGuessError } from '../src/errors';
import {
  allEligibleGuessed,
  autoSelectWord,
  beginNextTurn,
  createGame,
  endTurn,
  eligibleGuessers,
  finishGame,
  getPlayerView,
  selectWord,
  setConnected,
  startGame,
  submitGuess,
  type DrawGuessState,
} from '../src/state';

const config = { ...DEFAULT_DRAW_GUESS_CONFIG, totalRounds: 2, wordsToChoose: 3 };

/** DrawGuessError ka `.code` check karta hai (message text par depend karna fragile hota). */
function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`Expected to throw DrawGuessError(${code})`);
  } catch (e) {
    expect(e).toBeInstanceOf(DrawGuessError);
    expect((e as DrawGuessError).code).toBe(code);
  }
}
const random = () => 0.1; // deterministic shuffle
let clock = 0;
const now = () => clock;
const tick = (ms: number) => (clock += ms);

function infos(ids: readonly string[]): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: id }));
}

function newGame(players: string[] = ['p1', 'p2', 'p3']): DrawGuessState {
  clock = 0;
  return createGame(infos(players), { config });
}

describe('createGame', () => {
  it('kam players reject hota hai', () => {
    expect(() => createGame(infos(['p1']), { config })).toThrow(DrawGuessError);
  });

  it('zyada players reject hota hai', () => {
    const tooMany = Array.from({ length: config.maxPlayers + 1 }, (_, i) => `p${i}`);
    expect(() => createGame(infos(tooMany), { config })).toThrow(DrawGuessError);
  });

  it('duplicate player ids reject hote hain', () => {
    expect(() => createGame(infos(['p1', 'p1']), { config })).toThrow(DrawGuessError);
  });

  it('LOBBY me shuru hota hai, sabka score 0', () => {
    const state = newGame();
    expect(state.phase).toBe('LOBBY');
    expect(state.totalTurns).toBe(config.totalRounds * 3);
    for (const p of state.playerOrder) expect(state.players[p]?.score).toBe(0);
  });
});

describe('turn lifecycle (happy path)', () => {
  it('LOBBY -> COUNTDOWN -> CHOOSING_WORD -> DRAWING -> ROUND_RESULTS -> next turn', () => {
    let state = newGame();
    state = startGame(state, now());
    expect(state.phase).toBe('COUNTDOWN');

    state = beginNextTurn(state, now(), random);
    expect(state.phase).toBe('CHOOSING_WORD');
    expect(state.drawerId).toBe('p1');
    expect(state.wordChoices).toHaveLength(3);
    expect(state.turn).toBe(0);
    expect(state.round).toBe(1);

    const chosen = state.wordChoices?.[0] as string;
    state = selectWord(state, 'p1', chosen, now(), random);
    expect(state.phase).toBe('DRAWING');
    expect(state.word).toBe(chosen);
    expect(state.wordChoices).toBeNull(); // choices ab kisi kaam ke nahi, clear ho gaye

    tick(1000);
    const g1 = submitGuess(state, 'p2', chosen, now());
    expect(g1.correct).toBe(true);
    expect(g1.allGuessed).toBe(false); // p3 abhi baaki
    state = g1.state;
    expect(state.players.p2?.score).toBe(300);

    tick(1000);
    const g2 = submitGuess(state, 'p3', chosen, now());
    expect(g2.correct).toBe(true);
    expect(g2.allGuessed).toBe(true); // drawer chhodkar sab guess kar chuke
    state = g2.state;
    expect(state.players.p3?.score).toBe(250);

    const { state: afterEnd, result } = endTurn(state, now());
    state = afterEnd;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(result.word).toBe(chosen); // ab turn khatam ho gaya, word reveal karna sahi hai
    expect(result.correctGuessers).toHaveLength(2);
    expect(state.players.p1?.score).toBe(DEFAULT_SCORING_CONFIG.drawerBasePoints + 2 * DEFAULT_SCORING_CONFIG.drawerPointsPerCorrectGuesser);
    expect(state.history).toHaveLength(1);
  });

  it('poora game: sab turns ke baad GAME_RESULTS, winner sabse zyada score wala', () => {
    let state = newGame(['p1', 'p2']);
    const twoPlayerConfig = { ...config };
    state = { ...state, config: twoPlayerConfig, totalTurns: twoPlayerConfig.totalRounds * 2 };
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);

    for (let i = 0; i < state.totalTurns; i++) {
      const word = state.wordChoices?.[0] as string;
      state = selectWord(state, state.drawerId as string, word, now(), random);
      const guesserId = state.playerOrder.find((id) => id !== state.drawerId) as string;
      const outcome = submitGuess(state, guesserId, word, now());
      state = outcome.state;
      state = endTurn(state, now()).state;
      state = beginNextTurn(state, now(), random);
    }

    expect(state.phase).toBe('GAME_RESULTS');
    expect(state.winnerIds.length).toBeGreaterThan(0);
    // Dono players har turn me barabar guess/draw karte hain, isliye tie ho sakti hai — bas crash na ho ye check hai.
    state = finishGame(state);
    expect(state.phase).toBe('FINISHED');
  });
});

describe('validation errors', () => {
  function inDrawingPhase() {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    const word = state.wordChoices?.[0] as string;
    state = selectWord(state, state.drawerId as string, word, now(), random);
    return { state, word };
  }

  it('NOT_DRAWER: doosra player word nahi chun sakta', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    const word = state.wordChoices?.[0] as string;
    expectCode(() => selectWord(state, 'p2', word, now(), random), 'NOT_DRAWER');
  });

  it('INVALID_WORD_CHOICE: offer se bahar ka word nahi chun sakta', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    expectCode(() => selectWord(state, state.drawerId as string, 'Definitely Not Offered', now(), random), 'INVALID_WORD_CHOICE');
  });

  it('DRAWER_CANNOT_GUESS: drawer khud guess nahi kar sakta', () => {
    const { state } = inDrawingPhase();
    expectCode(() => submitGuess(state, state.drawerId as string, 'anything', now()), 'DRAWER_CANNOT_GUESS');
  });

  it('UNKNOWN_PLAYER: room ke bahar ka player guess nahi kar sakta', () => {
    const { state } = inDrawingPhase();
    expectCode(() => submitGuess(state, 'ghost', 'anything', now()), 'UNKNOWN_PLAYER');
  });

  it('ALREADY_GUESSED: ek hi turn me dobara sahi count nahi hota', () => {
    const { state: initial, word } = inDrawingPhase();
    let state = initial;
    const guesserId = state.playerOrder.find((id) => id !== state.drawerId) as string;
    state = submitGuess(state, guesserId, word, now()).state;
    expectCode(() => submitGuess(state, guesserId, word, now()), 'ALREADY_GUESSED');
  });

  it('galat guess se koi error nahi, bas correct:false', () => {
    const { state } = inDrawingPhase();
    const guesserId = state.playerOrder.find((id) => id !== state.drawerId) as string;
    const outcome = submitGuess(state, guesserId, 'totally wrong guess', now());
    expect(outcome.correct).toBe(false);
    expect(outcome.state.players[guesserId]?.score).toBe(0);
  });

  it('galat phase me action karne par INVALID_PHASE', () => {
    const state = newGame();
    expectCode(() => selectWord(state, 'p1', 'x', now(), random), 'INVALID_PHASE');
    expectCode(() => submitGuess(state, 'p1', 'x', now()), 'INVALID_PHASE');
    expectCode(() => endTurn(state, now()), 'INVALID_PHASE');
  });
});

describe('autoSelectWord (drawer time par nahi chunta)', () => {
  it('koi word apne aap chun leta hai, DRAWING me chala jaata hai', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    const choices = state.wordChoices as string[];
    state = autoSelectWord(state, now(), random);
    expect(state.phase).toBe('DRAWING');
    expect(state.word).not.toBeNull();
    expect(choices).toContain(state.word);
  });
});

describe('disconnect handling (pure helpers)', () => {
  it('eligibleGuessers disconnected players ko exclude karta hai', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    const word = state.wordChoices?.[0] as string;
    state = selectWord(state, state.drawerId as string, word, now(), random);
    const [g1, g2] = state.playerOrder.filter((id) => id !== state.drawerId);

    state = setConnected(state, g2 as string, false);
    expect(eligibleGuessers(state)).toEqual([g1]);

    state = submitGuess(state, g1 as string, word, now()).state;
    expect(allEligibleGuessed(state)).toBe(true); // sirf connected non-drawer, wahi guess kar chuka
  });
});

describe('getPlayerView — security (kabhi bhi non-drawer ko asli word nahi milna chahiye)', () => {
  it('CHOOSING_WORD: sirf drawer ko wordChoices dikhte hain', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);

    const drawerView = getPlayerView(state, state.drawerId, now());
    expect(drawerView.wordChoices).toHaveLength(3);
    expect(drawerView.isDrawer).toBe(true);

    const otherId = state.playerOrder.find((id) => id !== state.drawerId) as string;
    const otherView = getPlayerView(state, otherId, now());
    expect(otherView.wordChoices).toBeNull();
    expect(otherView.word).toBeNull();
    expect(otherView.isDrawer).toBe(false);
  });

  it('DRAWING: sirf drawer ko asli word, baaki sabko sirf maskedWord (kabhi asli word nahi)', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    const word = state.wordChoices?.[0] as string;
    state = selectWord(state, state.drawerId as string, word, now(), random);

    const drawerView = getPlayerView(state, state.drawerId, now());
    expect(drawerView.word).toBe(word);

    const otherId = state.playerOrder.find((id) => id !== state.drawerId) as string;
    const otherView = getPlayerView(state, otherId, now());
    expect(otherView.word).toBeNull();
    expect(otherView.wordChoices).toBeNull();
    expect(otherView.maskedWord).not.toBeNull();
    expect(otherView.maskedWord?.replace(/[_ ]/g, '')).toBe(''); // shuru me koi hint reveal nahi hua (hintIntervalMs 10s)
    expect(otherView.wordLength).toBe(word.length);

    // Serialize karke bhi (jaisa gateway JSON.stringify karta hai) kahin asli word na ho.
    const serialized = JSON.stringify(otherView);
    expect(serialized.toLowerCase().includes(word.toLowerCase())).toBe(false);
  });

  it('ROUND_RESULTS ke baad history me word dikhna sahi hai (turn khatam ho chuka)', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    const word = state.wordChoices?.[0] as string;
    state = selectWord(state, state.drawerId as string, word, now(), random);
    state = endTurn(state, now()).state;

    const view = getPlayerView(state, 'p2', now());
    expect(view.history[0]?.word).toBe(word);
  });

  it('viewerId null (spectator/logged-out) ko bhi kabhi drawer-only data nahi milta', () => {
    let state = newGame();
    state = startGame(state, now());
    state = beginNextTurn(state, now(), random);
    const view = getPlayerView(state, null, now());
    expect(view.isDrawer).toBe(false);
    expect(view.wordChoices).toBeNull();
    expect(view.word).toBeNull();
  });
});
