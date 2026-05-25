// Monte Carlo simulation: how often does each rule category come up under
// optimal play? Result feeds the analytics adj-ev-loss column, so a
// surrender mistake (rare cell) weighs differently than a hard-totals
// mistake (common cell) — that ratio is what theoretical frequency captures.
//
// Run: node tests/measure-frequencies.mjs [N_hands]
//
// Output: JS object literal printed to stdout, copy-paste into analytics.js.

import { createShoe, reshuffleIfLow, drawCard, handTotal, isBust, isBlackjack, dealerPlay } from '../js/game.js';
import { solveActions } from '../js/solver.js';
import { classifyDecision, classifyHand } from '../js/strategy.js';

const RULES = { dealerHitsSoft17: false, das: true, lateSurrender: true };
const CATEGORIES = ['mimic', 'hardTotals', 'adjust', 'double', 'split', 'surrender'];
const HAND_TYPES = ['hard', 'soft', 'pair'];

function emptyCounts() {
  const out = { total: 0, byCategory: {} };
  for (const c of CATEGORIES) {
    out.byCategory[c] = { total: 0, byType: { hard: 0, soft: 0, pair: 0 } };
  }
  return out;
}

function optimalAction(hand, upcard, legal) {
  const ev = solveActions(hand, upcard, RULES);
  let best = null, bestEv = -Infinity;
  for (const a of Object.keys(ev)) {
    if (!legal.includes(a)) continue;
    if (ev[a] > bestEv) { bestEv = ev[a]; best = a; }
  }
  return best;
}

function legalActionsFor(hand, isFirstDecisionOnFirstHand, fromSplitAce) {
  if (fromSplitAce) return [];          // post-ace-split: locked to one draw
  const actions = ['H', 'S'];
  if (hand.length === 2) {
    actions.push('D');
    if (isFirstDecisionOnFirstHand && RULES.lateSurrender) actions.push('R');
    if (isFirstDecisionOnFirstHand && hand[0] === hand[1]) actions.push('P');
  }
  return actions;
}

function recordDecision(counts, hand, upcard, action) {
  const cat = classifyDecision(hand, upcard, action);
  const type = classifyHand(hand).type;
  counts.total++;
  counts.byCategory[cat].total++;
  counts.byCategory[cat].byType[type]++;
}

// Plays one player hand from the awaiting state; returns when the hand is
// resolved (stand / bust / surrender / done after double). Mutates the
// hand's `cards` array and the shoe in place.
function playHand(counts, hand, upcard, shoe, opts) {
  const { fromSplitAce, isFirstDecisionOnFirstHand } = opts;
  if (fromSplitAce) return;             // no choice, no decision recorded
  if (hand.length === 2 && handTotal(hand) === 21) return; // natural / 21 after split
  while (true) {
    const legal = legalActionsFor(hand, isFirstDecisionOnFirstHand && hand.length === 2, false);
    if (legal.length === 0) return;
    const action = optimalAction(hand, upcard, legal);
    recordDecision(counts, hand, upcard, action);
    if (action === 'S' || action === 'R') return;
    if (action === 'H') {
      hand.push(drawCard(shoe));
      if (isBust(hand) || handTotal(hand) === 21) return;
      continue;
    }
    if (action === 'D') {
      hand.push(drawCard(shoe));
      return;
    }
    // 'P' should only be reached from the caller's outer loop, not here.
    return;
  }
}

function simulate(nHands) {
  const counts = emptyCounts();
  let shoe = createShoe();
  for (let i = 0; i < nHands; i++) {
    shoe = reshuffleIfLow(shoe);
    const dealer = [drawCard(shoe), drawCard(shoe)];
    const player = [drawCard(shoe), drawCard(shoe)];
    const upcard = dealer[0];
    // Peeked dealer: if player has BJ or dealer (on A/10) has BJ, no decisions.
    if (isBlackjack(player)) continue;
    const dealerPeeks = upcard === 10 || upcard === 11;
    if (dealerPeeks && isBlackjack(dealer)) continue;

    // Initial-decision handling with possible split (one level, no resplit
    // since the chart's resplit rules are off in this app's variant).
    const firstLegal = legalActionsFor(player, true, false);
    const firstAction = optimalAction(player, upcard, firstLegal);

    if (firstAction === 'P') {
      // Record the split decision itself once.
      recordDecision(counts, player, upcard, 'P');
      const aces = player[0] === 11;
      const left = [player[0], drawCard(shoe)];
      const right = [player[1], drawCard(shoe)];
      // Play each split hand independently; they're no longer "first decision
      // on the first hand", so neither surrender nor further split is offered.
      playHand(counts, left, upcard, shoe, {
        fromSplitAce: aces,
        isFirstDecisionOnFirstHand: false,
      });
      playHand(counts, right, upcard, shoe, {
        fromSplitAce: aces,
        isFirstDecisionOnFirstHand: false,
      });
      continue;
    }

    // First decision wasn't split; play the hand normally starting with that action.
    recordDecision(counts, player, upcard, firstAction);
    if (firstAction === 'S' || firstAction === 'R') continue;
    if (firstAction === 'D') { player.push(drawCard(shoe)); continue; }
    if (firstAction === 'H') {
      player.push(drawCard(shoe));
      if (!isBust(player) && handTotal(player) !== 21) {
        playHand(counts, player, upcard, shoe, {
          fromSplitAce: false,
          isFirstDecisionOnFirstHand: false,
        });
      }
    }
  }
  return counts;
}

function formatFreq(n, d) { return d === 0 ? '0.0000' : (n / d).toFixed(4); }

const N = Number(process.argv[2] ?? 50000);
console.log(`Running ${N.toLocaleString()} hands of optimal play…`);
const t0 = Date.now();
const counts = simulate(N);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`${counts.total.toLocaleString()} decisions across ${N.toLocaleString()} hands (${elapsed}s)\n`);

// Per-category and per-(category, type) frequencies as a fraction of total decisions
console.log('Frequencies as fraction of all decisions:\n');
for (const c of CATEGORIES) {
  const bc = counts.byCategory[c];
  const fTotal = formatFreq(bc.total, counts.total);
  const parts = HAND_TYPES
    .filter(t => bc.byType[t] > 0)
    .map(t => `${t}=${formatFreq(bc.byType[t], counts.total)}`)
    .join('  ');
  console.log(`  ${c.padEnd(12)} ${fTotal}    ${parts}`);
}

console.log('\nCopy-paste into analytics.js:\n');
console.log('const CATEGORY_FREQ = {');
for (const c of CATEGORIES) {
  const bc = counts.byCategory[c];
  const total = bc.total / counts.total;
  const subTypes = HAND_TYPES.reduce((acc, t) => {
    if (bc.byType[t] > 0) acc[t] = +(bc.byType[t] / counts.total).toFixed(5);
    return acc;
  }, {});
  console.log(`  ${c}: { total: ${total.toFixed(5)}, byType: ${JSON.stringify(subTypes)} },`);
}
console.log('};');
