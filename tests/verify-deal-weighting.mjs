// Sanity check: synthetic practice stats with one bucket leaking heavily
// should sample that bucket far above its 1/6 share, and a no-data run
// should fall back to uniform (no bias).
//
// Run: node tests/verify-deal-weighting.mjs

import { dealSituation } from '../js/deal.js';
import { classifyDecision, getOptimalAction } from '../js/strategy.js';
import { BUCKET_WINDOW } from '../js/stats.js';

function classify(situation) {
  const optimal = getOptimalAction(situation.hand, situation.upcard);
  return classifyDecision(situation.hand, situation.upcard, optimal);
}

function tally(stats, n) {
  const counts = { mimic: 0, hardTotals: 0, adjust: 0, double: 0, split: 0, surrender: 0 };
  for (let i = 0; i < n; i++) {
    const { category } = classify(dealSituation(stats));
    counts[category]++;
  }
  return counts;
}

function pct(c, total) { return ((c / total) * 100).toFixed(1) + '%'; }

const N = 20000;

// 1. No stats → exploration only. Exploration is uniform OVER (cat, subType)
//    buckets (10 of them), so categories with two sub-buckets (mimic /
//    hardTotals / double / split) land at ~20%; single-bucket categories
//    (adjust / surrender) at ~10%.
console.log('No stats (sub-bucket-uniform exploration; 2-sub cats ~20%, single-sub ~10%):');
const baseline = tally(undefined, N);
for (const [k, v] of Object.entries(baseline)) {
  console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  ${pct(v, N)}`);
}

// 2. Surrender is the only leaky bucket. With weighting we expect to see
//    surrender pulled way above its baseline share even though it's a rare
//    cell in the chart.
//
// Bucket factory: also seeds a recent[] window (capped at BUCKET_WINDOW)
// with the same avg cost — that's what the sampler actually reads from.
function bucket(total, correct, cost) {
  const recentN = Math.min(total, BUCKET_WINDOW);
  const avgCost = total > 0 ? cost / total : 0;
  const recent = [];
  for (let i = 0; i < recentN; i++) recent.push({ correct: i < correct, cost: avgCost });
  return { total, correct, cost, recent };
}
function entry(total, correct, cost, byType) {
  const types = { hard: bucket(0,0,0), soft: bucket(0,0,0), pair: bucket(0,0,0), always: bucket(0,0,0), mixed: bucket(0,0,0) };
  Object.assign(types, byType);
  return { total, correct, cost, byType: types };
}

console.log('\nOnly surrender leaks (0.20 ev loss / decision):');
const leakSurrender = {
  byCategory: {
    mimic:      entry(100, 100, 0,   { hard: bucket(80, 80, 0), soft: bucket(20, 20, 0) }),
    hardTotals: entry(50,  50,  0,   { hard: bucket(45, 45, 0), soft: bucket(5,  5,  0) }),
    adjust:     entry(0,   0,   0,   {}),
    double:     entry(20,  20,  0,   { hard: bucket(16, 16, 0), soft: bucket(4,  4,  0) }),
    split:      entry(30,  30,  0,   { always: bucket(20, 20, 0), mixed: bucket(10, 10, 0) }),
    surrender:  entry(10,  4,   2.0, { hard: bucket(10, 4, 2.0) }),
  },
};
const skewed = tally(leakSurrender, N);
for (const [k, v] of Object.entries(skewed)) {
  console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  ${pct(v, N)}`);
}
console.log('\nWith sqrt + 40% explore: surrender ~64% (60% exploit + 4% explore), others ~4-8% from exploration (single-sub 4%, 2-sub 8%).');

// 3. Two leaky buckets, doubles 2x heavier than mimic.
console.log('\nMimic leaks 0.02/decision, double leaks 0.04/decision (everything else perfect):');
const twoLeaks = {
  byCategory: {
    mimic:      entry(100, 98, 2.0, { hard: bucket(90, 88, 2.0), soft: bucket(10, 10, 0) }),
    hardTotals: entry(50,  50, 0,   { hard: bucket(45, 45, 0),   soft: bucket(5,  5,  0) }),
    adjust:     entry(0,   0,  0,   {}),
    double:     entry(25,  24, 1.0, { hard: bucket(20, 19, 1.0), soft: bucket(5,  5,  0) }),
    split:      entry(30,  30, 0,   { always: bucket(20, 20, 0), mixed: bucket(10, 10, 0) }),
    surrender:  entry(10,  10, 0,   { hard: bucket(10, 10, 0) }),
  },
};
const twoLeaksRes = tally(twoLeaks, N);
for (const [k, v] of Object.entries(twoLeaksRes)) {
  console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  ${pct(v, N)}`);
}
// With sqrt: sqrt(0.022) = 0.149 (mimic-hard), sqrt(0.05) = 0.224 (double-hard).
// 60% exploit pool: mimic ~24%, double ~36%. Plus 4% explore per single-sub
// category or 8% per 2-sub category. So:
//   mimic ~32% (24% + 8% explore across hard+soft)
//   double ~44% (36% + 8%)
//   others ~4-8% each (explore only).
console.log('\nWith sqrt + 40% explore: double ~44%, mimic ~32%, others ~4-8% (much less stuck than linear weighting).');
