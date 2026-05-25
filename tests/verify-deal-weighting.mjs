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
function bucket(total, correct, cost) { return { total, correct, cost }; }
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
console.log('\nExpect surrender ~75% exploit + 2.5% exploration = ~78%. Others get ~2.5-5% each from exploration alone (2-sub cats get 5%, single-sub 2.5%).');

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
// mimic-hard weight: 2.0/90 = 0.0222; double-hard weight: 1.0/20 = 0.05
// 90% exploit pool: mimic ~28%, double ~62%. Plus 1% per sub-bucket from
// the 10% exploration. So:
//   mimic ~30% (~28% exploit + 2% exploration from 2 sub-buckets)
//   double ~64% (~62% exploit + 2% exploration)
//   others ~1-2% each (exploration only).
console.log('\nExpect double ~57%, mimic ~28%, others ~2-5% each (25% exploration spread across 10 sub-buckets).');
