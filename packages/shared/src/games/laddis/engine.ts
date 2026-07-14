import { buildDeck32, cardsEqual, RANK_ORDER_STANDARD } from '../../core/cards';
import type { Card, Suit } from '../../core/cards';
import { makeRng, shuffle } from '../../core/rng';
import { legalFollows, ledSuit, trickWinner } from '../../core/tricks';
import { scoreRound } from './scoring';
import { LaddisError, nextSeat, partnerOf, VAKHAAI_BETS } from './types';
import type { LaddisAction, LaddisState, Seat, Team, VakhaaiBet } from './types';

export interface RoundConfig {
  deficit: number;
  shufflingTeam: Team;
  dealer: Seat;
  seed: string;
  roundNumber: number;
}

/** Deal the first 4 cards each and open the vakhaai window right of the dealer. */
export function initRound(config: RoundConfig): LaddisState {
  const rng = makeRng(`${config.seed}/round${config.roundNumber}`);
  const deck = shuffle(buildDeck32(), rng);
  const hands: LaddisState['hands'] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const seat = ((config.dealer + 1 + i) % 4) as Seat;
    hands[seat] = deck.slice(i * 4, i * 4 + 4);
  }
  return {
    phase: 'vakhaai',
    roundNumber: config.roundNumber,
    dealer: config.dealer,
    shufflingTeam: config.shufflingTeam,
    deficit: config.deficit,
    hands,
    undealt: deck.slice(16),
    window: { turn: nextSeat(config.dealer), passed: [false, false, false, false] },
    hukum: null,
    mode: 'normal',
    vakhaai: null,
    six: null,
    mustPlayHukum: null,
    turn: null,
    trick: [],
    trickLeader: nextSeat(config.dealer),
    tricksTaken: [0, 0, 0, 0],
    lastTrick: null,
    lastTrickWinner: null,
    roundResult: null,
    seed: config.seed,
  };
}

export function actingSeat(state: LaddisState): Seat | null {
  switch (state.phase) {
    case 'vakhaai':
    case 'sixCall':
      return state.window.turn;
    case 'declaring':
      return nextSeat(state.dealer); // non-shuffling player right of the dealer
    case 'playing':
      return state.turn;
    case 'roundOver':
    case 'matchOver':
      return null;
  }
}

/**
 * Legal actions for a seat: the single source of truth for server validation,
 * bots and UI. Parameterised actions (vakhaai suit/bet, hukum suit) are
 * enumerated with one representative; applyAction validates the actual choice.
 */
export function legalActions(state: LaddisState, seat: Seat): LaddisAction[] {
  const actions: LaddisAction[] = [];
  switch (state.phase) {
    case 'vakhaai': {
      if (state.window.turn !== seat) return [];
      actions.push({ type: 'passVakhaai', seat });
      actions.push({ type: 'vakhaai', seat, bet: 8 });
      return actions;
    }
    case 'declaring': {
      if (actingSeat(state) !== seat) return [];
      const sample = state.hands[seat][0]!;
      return [{ type: 'declareHukum', seat, suit: sample.suit }];
    }
    case 'sixCall': {
      if (state.window.turn !== seat) return [];
      return [
        { type: 'passSix', seat },
        { type: 'callSix', seat },
      ];
    }
    case 'playing': {
      if (state.turn !== seat) return [];
      for (const card of legalPlays(state, seat)) actions.push({ type: 'playCard', seat, card });
      const led = ledSuit(state.trick);
      if (
        state.hukum !== null &&
        !state.hukum.revealed &&
        led !== null &&
        !state.hands[seat].some((c) => c.suit === led)
      ) {
        actions.push({ type: 'callHukum', seat });
      }
      return actions;
    }
    case 'roundOver':
      return [
        { type: 'nextRound', seat },
        { type: 'endMatch', seat },
      ];
    case 'matchOver':
      return [];
  }
}

/** Follow suit if possible; a seat that called for the hukum must play it if able. */
function legalPlays(state: LaddisState, seat: Seat): Card[] {
  const follows = legalFollows(state.hands[seat], state.trick);
  const hukum = state.hukum;
  if (
    hukum !== null &&
    state.mustPlayHukum === seat &&
    hukum.revealed &&
    follows.some((c) => c.suit === hukum.suit)
  ) {
    return follows.filter((c) => c.suit === hukum.suit);
  }
  return follows;
}

export function applyAction(state: LaddisState, action: LaddisAction): LaddisState {
  const s: LaddisState = cloneState(state);
  switch (action.type) {
    case 'vakhaai':
      applyVakhaai(s, action.seat, action.bet);
      break;
    case 'passVakhaai':
      applyPassVakhaai(s, action.seat);
      break;
    case 'declareHukum':
      applyDeclareHukum(s, action.seat, action.suit);
      break;
    case 'callSix':
      applyCallSix(s, action.seat);
      break;
    case 'passSix':
      applyPassSix(s, action.seat);
      break;
    case 'callHukum':
      applyCallHukum(s, action.seat);
      break;
    case 'playCard':
      applyPlayCard(s, action.seat, action.card);
      break;
    case 'nextRound':
      return applyNextRound(s);
    case 'endMatch':
      applyEndMatch(s);
      break;
  }
  return s;
}

function fail(message: string): never {
  throw new LaddisError(message);
}

/**
 * The host may stop the match at any point — typically once a side is
 * hopelessly behind. The ledger stands as it is; an unfinished round is
 * simply abandoned and the team in deficit loses.
 */
function applyEndMatch(s: LaddisState): void {
  if (s.phase === 'matchOver') fail('the match is already over');
  s.phase = 'matchOver';
  s.turn = null;
  s.window.turn = null;
  s.mustPlayHukum = null;
  if (s.hukum !== null) s.hukum.revealed = true; // showdown: everyone learns it
}

/**
 * Vakhaai: the round is played with ONLY the first four cards — no second
 * deal, no hukum (no trumps at all) — and the caller leads. With 4 tricks on
 * the table, "4 hands alone" means the caller must win every one of them.
 */
function applyVakhaai(s: LaddisState, seat: Seat, bet: VakhaaiBet): void {
  if (s.phase !== 'vakhaai') fail('not in the vakhaai window');
  if (s.window.turn !== seat) fail('not your turn');
  if (!VAKHAAI_BETS.includes(bet)) fail('vakhaai must be 8, 16 or 32 kalyas');
  s.mode = 'vakhaai';
  s.vakhaai = { caller: seat, bet };
  s.hukum = null;
  s.undealt = [];
  s.phase = 'playing';
  s.window.turn = null;
  s.turn = seat;
  s.trickLeader = seat;
}

function applyPassVakhaai(s: LaddisState, seat: Seat): void {
  if (s.phase !== 'vakhaai') fail('not in the vakhaai window');
  if (s.window.turn !== seat) fail('not your turn');
  s.window.passed[seat] = true;
  const next = nextUnpassed(s, seat);
  if (next === null) {
    s.phase = 'declaring';
    s.window.turn = null;
  } else {
    s.window.turn = next;
  }
}

/** Six-call order: the non-shuffling side first, then the shuffling side. */
function sixOrder(s: LaddisState): Seat[] {
  const n1 = nextSeat(s.dealer);
  return [n1, partnerOf(n1), partnerOf(s.dealer), s.dealer];
}

function applyDeclareHukum(s: LaddisState, seat: Seat, suit: Suit): void {
  if (s.phase !== 'declaring') fail('not in the declaring phase');
  if (actingSeat(s) !== seat) fail('only the player right of the dealer declares the hukum');
  s.hukum = { suit, declarer: seat, revealed: false };
  dealRest(s);
  // Six-call window: everyone may raise to 6 hands — non-shufflers get first go.
  s.phase = 'sixCall';
  s.window = { turn: sixOrder(s)[0]!, passed: [false, false, false, false] };
}

function applyCallSix(s: LaddisState, seat: Seat): void {
  if (s.phase !== 'sixCall') fail('not in the six-call window');
  if (s.window.turn !== seat) fail('not your turn');
  s.mode = 'six';
  s.six = { caller: seat };
  startPlay(s);
}

function applyPassSix(s: LaddisState, seat: Seat): void {
  if (s.phase !== 'sixCall') fail('not in the six-call window');
  if (s.window.turn !== seat) fail('not your turn');
  s.window.passed[seat] = true;
  const next = sixOrder(s).find((t) => !s.window.passed[t]);
  if (next === undefined) {
    startPlay(s);
  } else {
    s.window.turn = next;
  }
}

function applyCallHukum(s: LaddisState, seat: Seat): void {
  if (s.phase !== 'playing') fail('not in the playing phase');
  if (s.turn !== seat) fail('not your turn');
  const hukum = s.hukum;
  if (hukum === null) fail('a vakhaai round has no hukum');
  if (hukum.revealed) fail('the hukum is already known');
  const led = ledSuit(s.trick);
  if (led === null) fail('cannot call for the hukum when leading');
  if (s.hands[seat].some((c) => c.suit === led)) {
    fail('you can only call for the hukum when void in the led suit');
  }
  hukum.revealed = true;
  s.mustPlayHukum = seat;
}

function applyPlayCard(s: LaddisState, seat: Seat, card: Card): void {
  if (s.phase !== 'playing') fail('not in the playing phase');
  if (s.turn !== seat) fail('not your turn');
  const hand = s.hands[seat];
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx === -1) fail('card not in hand');
  if (!legalPlays(s, seat).some((c) => cardsEqual(c, card))) {
    fail('illegal card (follow suit if you can; after calling for the hukum you must play it)');
  }

  hand.splice(idx, 1);
  s.trick.push({ seat, card });
  if (s.mustPlayHukum === seat) s.mustPlayHukum = null;

  if (s.trick.length === 4) {
    const trumpSuit = s.hukum !== null && s.hukum.revealed ? s.hukum.suit : null;
    const winner = trickWinner(s.trick, RANK_ORDER_STANDARD, trumpSuit) as Seat;
    s.tricksTaken[winner] += 1;
    s.lastTrick = s.trick;
    s.lastTrickWinner = winner;
    s.trick = [];
    s.trickLeader = winner;
    s.turn = winner;
  } else {
    s.turn = nextSeat(seat);
  }

  if (s.hands.every((h) => h.length === 0)) {
    s.roundResult = scoreRound(s);
    if (s.hukum !== null) s.hukum.revealed = true; // showdown: everyone learns it
    s.phase = 'roundOver';
    s.turn = null;
  }
}

function applyNextRound(s: LaddisState): LaddisState {
  if (s.phase !== 'roundOver') fail('the round is not over');
  const r = s.roundResult!;
  // Dealer stays within the (possibly new) shuffling team, alternating members.
  const dealer = r.swapped
    ? nextSeat(s.dealer) // adjacent seat belongs to the other (now shuffling) team
    : partnerOf(s.dealer);
  return initRound({
    deficit: r.deficitAfter,
    shufflingTeam: r.shufflingTeamAfter,
    dealer,
    seed: s.seed,
    roundNumber: s.roundNumber + 1,
  });
}

function dealRest(s: LaddisState): void {
  for (let i = 0; i < 4; i++) {
    const to = ((s.dealer + 1 + i) % 4) as Seat;
    s.hands[to].push(...s.undealt.slice(i * 4, i * 4 + 4));
  }
  s.undealt = [];
}

function startPlay(s: LaddisState): void {
  s.phase = 'playing';
  s.window.turn = null;
  s.turn = nextSeat(s.dealer);
  s.trickLeader = nextSeat(s.dealer);
}

function nextUnpassed(s: LaddisState, from: Seat): Seat | null {
  let t = nextSeat(from);
  for (let i = 0; i < 4; i++) {
    if (!s.window.passed[t]) return t;
    t = nextSeat(t);
  }
  return null;
}

function cloneState(state: LaddisState): LaddisState {
  return typeof structuredClone === 'function'
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as LaddisState);
}
