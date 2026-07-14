/**
 * Print one bot-vs-bot deal turn by turn, for eyeballing rule correctness.
 * Run from the repo root:  npx tsx packages/shared/scripts/sim.ts [seed]
 */
import { cardKey, cardPoints, SUIT_NAMES } from '../src/core/cards';
import { makeRng } from '../src/core/rng';
import { chooseAction } from '../src/games/game304/bot';
import { actingSeat, applyAction, initDeal } from '../src/games/game304/engine';
import { redactFor } from '../src/games/game304/view';
import type { Game304State } from '../src/games/game304/types';

const seed = process.argv[2] ?? 'demo';
const rng = makeRng(`bots-${seed}`);
let state: Game304State = initDeal({ matchScore: [0, 0, 0, 0], dealer: 0, seed, dealNumber: 1 });

const show = (h: readonly { rank: string; suit: string }[]) =>
  h.map((c) => cardKey(c as never)).join(' ');

console.log(`=== 304 (hidden partner), seed "${seed}" — dealer seat 0 ===`);
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
    case 'declare':
      console.log(
        `seat ${seat} wins at ${before.bid?.amount}, declares hukum ${SUIT_NAMES[action.trumpSuit]}` +
          ` and partner card ${cardKey(action.partnerCard)} (secretly seat ${state.partner!.seat})`,
      );
      break;
    case 'playCard': {
      console.log(`seat ${seat} plays ${cardKey(action.card)}`);
      if (before.partner?.revealed === false && state.partner?.revealed === true) {
        console.log(`  !! partner revealed: seat ${state.partner.seat}`);
      }
      if (state.trick.length === 0 && state.lastTrick !== null) {
        const pts = state.lastTrick.reduce((s, p) => s + cardPoints(p.card), 0);
        console.log(
          `  -> trick to seat ${state.lastTrickWinner} (${pts} pts). Captured: ${state.capturedPoints.join(' / ')}`,
        );
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
    `=== deal over: seat ${r.bidder} bid ${r.bid} with partner seat ${r.partnerSeat} (${cardKey(r.partnerCard)});` +
      ` they took ${r.bidTeamPoints} -> ${r.madeIt ? 'MADE IT' : 'FAILED'};` +
      ` match score ${state.matchScore.join(' / ')} ===`,
  );
}
