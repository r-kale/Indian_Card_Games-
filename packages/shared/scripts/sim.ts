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
      const beforeStatus = before.partner?.status;
      const afterStatus = state.partner?.status;
      if (beforeStatus !== afterStatus && (afterStatus === 'allied' || afterStatus === 'lone')) {
        console.log(
          afterStatus === 'allied'
            ? `  !! partner allied: seat ${state.partner!.seat}`
            : `  !! partner trick lost: seat ${state.bid!.bidder} plays alone vs 3`,
        );
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
  const side =
    r.alliance === 'allied'
      ? `with partner seat ${r.partnerSeat} (${cardKey(r.partnerCard)})`
      : `ALONE (partner trick lost)`;
  console.log(
    `=== deal over: seat ${r.bidder} bid ${r.bid} ${side};` +
      ` they took ${r.bidTeamPoints} -> ${r.madeIt ? 'MADE IT' : 'FAILED'};` +
      ` match score ${state.matchScore.join(' / ')} ===`,
  );
}

// Run a Laddis round instead:  npx tsx packages/shared/scripts/sim.ts [seed] laddis
if (process.argv[3] === 'laddis') {
  void (async () => {
    const { initRound, actingSeat: laddisActing, applyAction: laddisApply } = await import(
      '../src/games/laddis/engine'
    );
    const { chooseAction: laddisBot } = await import('../src/games/laddis/bot');
    const { redactFor: laddisRedact } = await import('../src/games/laddis/view');
    const { formatKalyas } = await import('../src/games/laddis/scoring');
    let ls = initRound({ deficit: 10, shufflingTeam: 0, dealer: 0, seed, roundNumber: 1 });
    console.log(`\n=== LADDIS, seed "${seed}" — team 0 shuffling, down ${formatKalyas(ls.deficit)} ===`);
    ls.hands.forEach((h, i) => console.log(`seat ${i} dealt: ${show(h)}`));
    const lrng = makeRng(`laddis-${seed}`);
    while (ls.phase !== 'roundOver' && ls.phase !== 'matchOver') {
      const seat = laddisActing(ls)!;
      const a = laddisBot(laddisRedact(ls, seat), lrng);
      const before = ls;
      ls = laddisApply(ls, a);
      if (a.type === 'passVakhaai') console.log(`seat ${seat} passes vakhaai`);
      else if (a.type === 'vakhaai') console.log(`seat ${seat} VAKHAAI ${a.bet} — 4 cards, no trumps, caller leads`);
      else if (a.type === 'declareHukum') console.log(`seat ${seat} sets the hidden hukum (secretly ${a.suit})`);
      else if (a.type === 'passSix') console.log(`seat ${seat} passes the six-call`);
      else if (a.type === 'callSix') console.log(`seat ${seat} CALLS SIX HANDS`);
      else if (a.type === 'callHukum') console.log(`seat ${seat} calls for the hukum -> ${ls.hukum!.suit}`);
      else if (a.type === 'playCard') {
        console.log(`seat ${seat} plays ${cardKey(a.card)}`);
        if (ls.trick.length === 0 && ls.lastTrick !== null && before.trick.length === 3) {
          console.log(`  -> hand to seat ${ls.lastTrickWinner}. Hands: ${ls.tricksTaken.join('/')}`);
        }
      }
    }
    const r = ls.roundResult!;
    console.log(
      `=== round over (${r.mode}): ${r.made ? 'MADE' : 'FAILED'}; team hands ${r.teamTricks.join('-')}; ` +
        `delta ${r.delta}; ${r.swapped ? 'ROLES SWAP; ' : ''}team ${r.shufflingTeamAfter} now down ${formatKalyas(r.deficitAfter)} ===`,
    );
  })();
}
