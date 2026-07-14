/**
 * Print one bot-vs-bot deal turn by turn, for eyeballing rule correctness.
 * Run from the repo root:  npx tsx packages/shared/scripts/sim.ts [seed]
 */
import { cardKey, SUIT_NAMES } from '../src/core/cards';
import { makeRng } from '../src/core/rng';
import { chooseAction } from '../src/games/game304/bot';
import { actingSeat, applyAction, initDeal } from '../src/games/game304/engine';
import { redactFor } from '../src/games/game304/view';
import type { Game304State } from '../src/games/game304/types';

const seed = process.argv[2] ?? 'demo';
const rng = makeRng(`bots-${seed}`);
let state: Game304State = initDeal({ matchScore: [0, 0], dealer: 0, seed, dealNumber: 1 });

const show = (h: readonly { rank: string; suit: string }[]) =>
  h.map((c) => cardKey(c as never)).join(' ');

console.log(`=== 304, seed "${seed}" — teams: seats 0&2 vs seats 1&3, dealer seat 0 ===`);
state.hands.forEach((h, i) => console.log(`seat ${i} dealt: ${show(h)}`));

while (state.phase !== 'dealOver' && state.phase !== 'matchOver') {
  const seat = actingSeat(state)!;
  const before = state;
  const action = chooseAction(redactFor(state, seat), rng);
  state = applyAction(state, action);

  switch (action.type) {
    case 'bid':
      console.log(`seat ${seat} bids ${action.amount}`);
      break;
    case 'pass':
      console.log(`seat ${seat} passes`);
      break;
    case 'selectTrump':
      console.log(`seat ${seat} wins the bid at ${before.bid?.amount ?? before.bidding.highBid} and places ${cardKey(action.card)} face down as trump`);
      state.hands.forEach((h, i) => console.log(`seat ${i} now holds: ${show(h)}`));
      break;
    case 'revealTrump':
      console.log(`seat ${seat} asks for the trump: it is ${SUIT_NAMES[state.trump!.suit]} (${cardKey(state.trump!.card)})`);
      break;
    case 'playCard': {
      console.log(`seat ${seat} plays ${cardKey(action.card)}`);
      if (before.trump?.revealed === false && state.trump?.revealed === true) {
        console.log(`  (trump auto-revealed: ${SUIT_NAMES[state.trump.suit]}, ${cardKey(state.trump.card)} returns to seat ${state.bid!.bidder})`);
      }
      if (state.trick.length === 0 && state.lastTrick !== null) {
        const pts = state.lastTrick.reduce((s, p) => s + (({ J: 30, '9': 20, A: 11, '10': 10, K: 3, Q: 2, '8': 0, '7': 0 })[p.card.rank] ?? 0), 0);
        console.log(`  -> trick to seat ${state.lastTrickWinner} (${pts} pts). Team points: ${state.capturedPoints[0]} vs ${state.capturedPoints[1]}`);
      }
      break;
    }
    case 'nextDeal':
      break;
  }
}

if (state.dealResult !== null) {
  const r = state.dealResult;
  console.log(
    `=== deal over: seat ${r.bidder} bid ${r.bid}; team ${r.bidTeam} captured ${r.capturedPoints[r.bidTeam]} -> ${r.madeIt ? 'MADE IT' : 'FAILED'}; match score ${state.matchScore[0]}-${state.matchScore[1]} ===`,
  );
}
