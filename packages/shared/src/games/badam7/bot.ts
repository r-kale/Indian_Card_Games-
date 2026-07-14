import { RANK_VALUE } from '../../core/cards';
import type { Card } from '../../core/cards';
import type { Rng } from '../../core/rng';
import type { BadamAction, BadamView } from './types';

/**
 * Simple Badam 7 bot: forced moves aside, prefer plays that unblock our own
 * cards (cards further along the same suit's run) and shed dead ends (A/K),
 * since every other play mostly opens doors for the opponents.
 */
export function chooseAction(view: BadamView, rng: Rng): BadamAction {
  const actions = view.legalActions;
  if (actions.length === 0) throw new Error('bot has no legal action');
  if (actions.length === 1) return actions[0]!;
  if (actions[0]!.type !== 'playCard') return actions[0]!;

  const plays = actions.filter(
    (a): a is Extract<BadamAction, { type: 'playCard' }> => a.type === 'playCard',
  );
  let best = plays[0]!;
  let bestScore = -Infinity;
  for (const play of plays) {
    const score = playScore(view, play.card) + rng() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }
  return best;
}

function playScore(view: BadamView, card: Card): number {
  const v = RANK_VALUE[card.rank];
  const own = view.hand.filter((c) => c.suit === card.suit && !(c.rank === card.rank));
  let unlocked: number;
  if (v === 7) {
    unlocked = own.length; // opening a suit frees our whole holding there
  } else if (v > 7) {
    unlocked = own.filter((c) => RANK_VALUE[c.rank] > v).length;
  } else {
    unlocked = own.filter((c) => RANK_VALUE[c.rank] < v).length;
  }
  const deadEnd = v === 1 || v === 13 ? 1 : 0; // A/K give nothing away
  return unlocked * 2 + deadEnd;
}
