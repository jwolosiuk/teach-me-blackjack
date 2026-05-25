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

// Mutually exclusive rule categories — what kind of decision is this?
// Returns { category, subType }; subType is the within-category breakdown:
//   hard / soft for mimic / hardTotals / adjust / double
//   hard       for surrender (no soft surrenders in the chart)
//   always     for splits whose entire row is one action (A,A and 8,8 always P,
//              10,10 always S)
//   mixed      for splits whose action depends on the dealer upcard
// Category meanings:
//   'split'      — hand is a pair (every pair situation, even when optimal is H/S)
//   'surrender'  — non-pair, optimal is R
//   'double'     — non-pair, non-R, optimal is D
//   'mimic'      — non-pair, non-R, non-D, optimal matches "hit below 17,
//                    stand at 17+" — the dealer's own rule already gets it right
//   'hardTotals' — non-pair, non-R, non-D, mimic is wrong but the bust-card rule
//                    matches optimal (hard: stand 12+ vs 2–6; soft: stand 18+)
//   'adjust'     — neither mimic nor the bust-card rule matches optimal
//                    (the exceptions: 12 vs 2–3, soft 18 vs 9, 11 vs A, …)
function pairSubType(hand) {
  const rank = hand[0] === 11 ? 'A' : String(hand[0]);
  const row = pairs[rank];
  return row.every(c => c === row[0]) ? 'always' : 'mixed';
}

export function classifyDecision(hand, upcard, optimal) {
  if (isPair(hand)) {
    return { category: 'split', subType: pairSubType(hand) };
  }
  const { type, total } = classifyHand(hand);
  const handSub = type === 'soft' ? 'soft' : 'hard';
  if (optimal === 'R') return { category: 'surrender', subType: handSub };
  if (optimal === 'D') return { category: 'double', subType: handSub };
  const mimic = total >= 17 ? 'S' : 'H';
  if (mimic === optimal) return { category: 'mimic', subType: handSub };
  const hardRule = type === 'soft'
    ? (total >= 18 ? 'S' : 'H')
    : (total >= 17 ? 'S' : total <= 11 ? 'H' : (upcard <= 6 ? 'S' : 'H'));
  return { category: hardRule === optimal ? 'hardTotals' : 'adjust', subType: handSub };
}

// Ordered to match the Learn page progression (1, 2A, 2B, 2C, 2D, 2E),
// so empty stats and ties on the sort key fall back to a sensible default.
export const RULE_CATEGORIES = ['mimic', 'hardTotals', 'double', 'split', 'surrender', 'adjust'];
export const SUB_TYPES = ['hard', 'soft', 'pair', 'always', 'mixed'];
