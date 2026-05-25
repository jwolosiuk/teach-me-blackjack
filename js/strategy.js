import { hardTotals, softTotals, pairs, DEALER_UPCARDS } from './strategy-table.js';

const DEFAULT_RULES = Object.freeze({
  dealerHitsSoft17: false,
  das: true,
  lateSurrender: true,
  numDecks: 6,
});

// A hand is a pair only when it has exactly 2 cards of equal value.
// Face cards all arrive as 10, so [10, J] looks like [10, 10] here — which is
// the correct strategy answer (any two ten-values is a "tens pair").
export function isPair(hand) {
  return hand.length === 2 && hand[0] === hand[1];
}

// Returns { type, total }. Hands with an Ace counted as 11 without busting are 'soft'.
// Two-card equal-rank hands are 'pair'. Everything else is 'hard'.
export function classifyHand(hand) {
  if (isPair(hand)) {
    return { type: 'pair', total: hand[0] + hand[1] };
  }
  let total = hand.reduce((sum, card) => sum + card, 0);
  let aces = hand.filter(card => card === 11).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { type: aces > 0 ? 'soft' : 'hard', total };
}

function pairKey(card) {
  return card === 11 ? 'A' : String(card);
}

function dealerIndex(dealerUpcard) {
  const idx = DEALER_UPCARDS.indexOf(dealerUpcard);
  if (idx === -1) throw new Error(`invalid dealer upcard: ${dealerUpcard}`);
  return idx;
}

// Resolves a table cell to one of 'H' | 'S' | 'D' | 'P' | 'R' based on
// whether the hand can double/surrender (only on the initial 2 cards).
function resolveCell(cell, handSize, rules) {
  const canAct = handSize === 2;
  if (cell === 'D')  return canAct ? 'D' : 'H';
  if (cell === 'Ds') return canAct ? 'D' : 'S';
  if (cell === 'R')  return (canAct && rules.lateSurrender) ? 'R' : 'H';
  return cell;
}

export function getOptimalAction(playerHand, dealerUpcard, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const { type, total } = classifyHand(playerHand);
  const col = dealerIndex(dealerUpcard);

  let cell;
  if (type === 'pair') {
    cell = pairs[pairKey(playerHand[0])][col];
  } else if (total >= 21) {
    return 'S';
  } else if (type === 'soft') {
    cell = softTotals[total][col];
  } else {
    cell = hardTotals[total][col];
  }
  return resolveCell(cell, playerHand.length, r);
}

// True when this exact hand's optimal action changes across dealer upcards
// (i.e., the upcard actually matters for the decision). Pair 8s, hard 17+
// and similar "always X" rows return false.
export function strategyDependsOnUpcard(playerHand, rules = {}) {
  let first = null;
  for (const up of DEALER_UPCARDS) {
    const a = getOptimalAction(playerHand, up, rules);
    if (first === null) first = a;
    else if (a !== first) return true;
  }
  return false;
}
