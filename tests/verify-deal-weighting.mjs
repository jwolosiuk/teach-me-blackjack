// Sanity check: synthetic practice stats with one bucket leaking heavily
// should sample that bucket far above its 1/6 share, and a no-data run
// should fall back to uniform (no bias).
//
// Run: node tests/verify-deal-weighting.mjs

import { dealSituation } from '../js/deal.js';
import { classifyDecision, getOptimalAction } from '../js/strategy.js';

function classify(situation) {
  const optimal = getOptimalAction(situation.hand, situation.upcard);
  return classifyDecision(situation.hand, situation.upcard, optimal);
}

function tally(stats, n) {
  const counts = { mimic: 0, hardTotals: 0, adjust: 0, double: 0, split: 0, surrender: 0 };
  for (let i = 0; i < n; i++) {
    const cat = classify(dealSituation(stats));
    counts[cat]++;
  }
  return counts;
}

function pct(c, total) { return ((c / total) * 100).toFixed(1) + '%'; }

const N = 20000;

// 1. No stats → uniform exploration only.
console.log('No stats (should be roughly uniform — 10% exploration is the only sampler):');
const baseline = tally(undefined, N);
for (const [k, v] of Object.entries(baseline)) {
  console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  ${pct(v, N)}`);
}

// 2. Surrender is the only leaky bucket. With weighting we expect to see
//    surrender pulled way above its baseline share even though it's a rare
//    cell in the chart.
console.log('\nOnly surrender leaks (0.20 ev loss / decision):');
const leakSurrender = {
  byCategory: {
    mimic:      { total: 100, correct: 100, cost: 0, byType: { hard: { total: 80, correct: 80, cost: 0 }, soft: { total: 20, correct: 20, cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    hardTotals: { total: 50,  correct: 50,  cost: 0, byType: { hard: { total: 45, correct: 45, cost: 0 }, soft: { total: 5,  correct: 5,  cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    adjust:     { total: 0,   correct: 0,   cost: 0, byType: { hard: { total: 0,  correct: 0,  cost: 0 }, soft: { total: 0,  correct: 0,  cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    double:     { total: 20,  correct: 20,  cost: 0, byType: { hard: { total: 16, correct: 16, cost: 0 }, soft: { total: 4,  correct: 4,  cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    split:      { total: 30,  correct: 30,  cost: 0, byType: { hard: { total: 0,  correct: 0,  cost: 0 }, soft: { total: 0,  correct: 0,  cost: 0 }, pair: { total: 30, correct: 30, cost: 0 } } },
    surrender:  { total: 10,  correct: 4,   cost: 2.0, byType: { hard: { total: 10, correct: 4, cost: 2.0 }, soft: { total: 0, correct: 0, cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
  },
};
const skewed = tally(leakSurrender, N);
for (const [k, v] of Object.entries(skewed)) {
  console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  ${pct(v, N)}`);
}
console.log('\nExpect surrender ~90% (only nonzero-weight bucket) + ~3.5% from 10% uniform exploration = ~90% + ~0.4% ≈ 90%.');

// 3. Two leaky buckets, doubles 2x heavier than mimic.
console.log('\nMimic leaks 0.02/decision, double leaks 0.04/decision (everything else perfect):');
const twoLeaks = {
  byCategory: {
    mimic:      { total: 100, correct: 98, cost: 2.0, byType: { hard: { total: 90, correct: 88, cost: 2.0 }, soft: { total: 10, correct: 10, cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    hardTotals: { total: 50,  correct: 50, cost: 0,   byType: { hard: { total: 45, correct: 45, cost: 0 }, soft: { total: 5,  correct: 5,  cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    adjust:     { total: 0,   correct: 0,  cost: 0,   byType: { hard: { total: 0,  correct: 0,  cost: 0 }, soft: { total: 0,  correct: 0,  cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    double:     { total: 25,  correct: 24, cost: 1.0, byType: { hard: { total: 20, correct: 19, cost: 1.0 }, soft: { total: 5,  correct: 5,  cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
    split:      { total: 30,  correct: 30, cost: 0,   byType: { hard: { total: 0,  correct: 0,  cost: 0 }, soft: { total: 0,  correct: 0,  cost: 0 }, pair: { total: 30, correct: 30, cost: 0 } } },
    surrender:  { total: 10,  correct: 10, cost: 0,   byType: { hard: { total: 10, correct: 10, cost: 0 }, soft: { total: 0,  correct: 0,  cost: 0 }, pair: { total: 0, correct: 0, cost: 0 } } },
  },
};
const twoLeaksRes = tally(twoLeaks, N);
for (const [k, v] of Object.entries(twoLeaksRes)) {
  console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  ${pct(v, N)}`);
}
// mimic-hard weight: 2.0/90 = 0.0222; double-hard weight: 1.0/20 = 0.05
// expected share (within the 90% exploit pool):
//   mimic-hard:  0.0222 / (0.0222 + 0.05) = 0.308 → 27.7% of total
//   double-hard: 0.05   / (0.0222 + 0.05) = 0.692 → 62.3% of total
// plus 10% uniform exploration spread across categories:
//   mimic uniform share ≈ (160/340)*10% ≈ 4.7%; double uniform ≈ (60/340)*10% ≈ 1.8%
//   surrender uniform ≈ (40/340)*10% ≈ 1.2%; hardTotals ≈ (60/340)*10% ≈ 1.8%
//   adjust ≈ (30/340)*10% ≈ 0.9%; split ≈ (100/340)*10% ≈ 2.9%
// So expected: mimic ~32%, double ~64%, others ~2-3% each.
console.log('\nExpect double ~64% (heavier per-decision leak), mimic ~32%, others ~2-3% (10% exploration only).');
