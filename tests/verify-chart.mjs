// One-off chart audit: walk every cell of strategy-table.js, ask the solver
// for the best EV action, and report any mismatch with how the chart resolves.
// Run: node tests/verify-chart.mjs

import { hardTotals, softTotals, pairs, DEALER_UPCARDS } from '../js/strategy-table.js';
import { solveActions } from '../js/solver.js';

const RULES = { dealerHitsSoft17: false, das: true, lateSurrender: true };
const ACTION_NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };

function bestFromSolver(ev) {
  let best = null, bestEv = -Infinity;
  for (const a of Object.keys(ev)) {
    if (ev[a] > bestEv) { bestEv = ev[a]; best = a; }
  }
  return { best, bestEv, ev };
}

// `cell` is the raw chart code (H/S/D/Ds/P/R). Resolve to a real action.
function resolveCell(cell, handSize, lateSurrender) {
  const canAct = handSize === 2;
  if (cell === 'D')  return canAct ? 'D' : 'H';
  if (cell === 'Ds') return canAct ? 'D' : 'S';
  if (cell === 'R')  return (canAct && lateSurrender) ? 'R' : 'H';
  return cell;
}

function upcardLabel(u) { return u === 11 ? 'A' : String(u); }

function probeHand(label, hand, chartCell, upcard) {
  const chartAction = resolveCell(chartCell, hand.length, RULES.lateSurrender);
  const { best, bestEv, ev } = bestFromSolver(solveActions(hand, upcard, RULES));
  if (best === chartAction) return null;
  // Mismatch — but only flag if the EV difference is meaningful.
  const chartEv = ev[chartAction] ?? -Infinity;
  const gap = bestEv - chartEv;
  return {
    label, upcard: upcardLabel(upcard),
    chart: chartAction, solver: best,
    chartEv: chartEv.toFixed(4), solverEv: bestEv.toFixed(4),
    gap: gap.toFixed(5),
    ev: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.toFixed(4)])),
  };
}

const mismatches = [];

// Hard totals 5..20
for (const total of Object.keys(hardTotals).map(Number).sort((a, b) => a - b)) {
  const row = hardTotals[total];
  for (let i = 0; i < DEALER_UPCARDS.length; i++) {
    const up = DEALER_UPCARDS[i];
    // Build a representative 2-card hard hand summing to `total` with no ace.
    // Easy heuristic: pick (2, total-2) if total-2 ∈ [2..10]; else split differently.
    let hand;
    if (total === 5) hand = [2, 3];
    else if (total >= 4 && total <= 12) {
      // ensure non-pair so it doesn't hit the pair lookup path
      const a = total <= 10 ? 2 : 2;
      const b = total - a;
      if (a === b) hand = [a, b + 1, -1]; // shouldn't happen for these totals; fall back
      if (!hand) hand = [a, b];
    } else if (total >= 13 && total <= 20) {
      // 10 + (total-10)
      const b = total - 10;
      hand = (b === 10) ? [9, total - 9] : [10, b];
    } else {
      hand = [10, total - 10];
    }
    // Final sanity: avoid pair (same card values) which would route to pairs.
    if (hand[0] === hand[1]) hand = [hand[0] - 1, hand[1] + 1];
    const m = probeHand(`hard ${total}`, hand, row[i], up);
    if (m) mismatches.push(m);
  }
}

// Soft totals 13..20 (A + n)
for (const total of Object.keys(softTotals).map(Number).sort((a, b) => a - b)) {
  const row = softTotals[total];
  for (let i = 0; i < DEALER_UPCARDS.length; i++) {
    const up = DEALER_UPCARDS[i];
    const other = total - 11; // 13 -> 2, 20 -> 9
    const hand = [11, other];
    const m = probeHand(`soft ${total} (A,${other})`, hand, row[i], up);
    if (m) mismatches.push(m);
  }
}

// Pairs
for (const key of Object.keys(pairs)) {
  const row = pairs[key];
  const cardVal = key === 'A' ? 11 : Number(key);
  const hand = [cardVal, cardVal];
  for (let i = 0; i < DEALER_UPCARDS.length; i++) {
    const up = DEALER_UPCARDS[i];
    const m = probeHand(`pair ${key}`, hand, row[i], up);
    if (m) mismatches.push(m);
  }
}

console.log(`Swept ${16 * 10 + 8 * 10 + 10 * 10} cells (hard + soft + pairs).`);
if (mismatches.length === 0) {
  console.log('✓ Every chart cell matches the solver.');
} else {
  console.log(`✗ ${mismatches.length} mismatch(es):\n`);
  for (const m of mismatches) {
    console.log(`  ${m.label.padEnd(20)} vs ${m.upcard.padStart(2)}: ` +
      `chart=${ACTION_NAMES[m.chart].padEnd(10)} solver=${ACTION_NAMES[m.solver].padEnd(10)} ` +
      `(chart ev=${m.chartEv}, solver ev=${m.solverEv}, gap=${m.gap})`);
    console.log(`    full ev: ${JSON.stringify(m.ev)}`);
  }
}
