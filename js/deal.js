// Practice-mode situation dealer.
//
// 25% of every deal is uniform random across the (category, subType)
// buckets — pick a bucket, then pick a random cell inside. With ~10
// active buckets (mimic-hard, mimic-soft, hardTotals-hard, …) every
// sub-skill gets equal exploration time regardless of how many cells
// it owns in the chart.
// The remaining 75% is exploitation: weighted by the player's per-bucket
// observed EV loss (cost / total). New users with no stats fall back to
// the same uniform exploration on every deal.

import { hardTotals, softTotals, pairs, DEALER_UPCARDS } from './strategy-table.js';
import { classifyDecision, getOptimalAction } from './strategy.js';

const HARD_KEYS = Object.keys(hardTotals).map(Number);
const SOFT_KEYS = Object.keys(softTotals).map(Number);
const PAIR_KEYS = Object.keys(pairs);

const EXPLORATION_RATE = 0.25;

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Hard 20 has no 2-card non-pair representation (10+10 reads as a pair). Use 3 cards.
function hardHand(total) {
  if (total === 20) return [2, 8, 10];
  const combos = [];
  for (let lo = 2; lo < total - lo; lo++) {
    const hi = total - lo;
    if (hi <= 10 && lo !== hi) combos.push([lo, hi]);
  }
  if (combos.length === 0) throw new Error(`no hard hand for ${total}`);
  return randomItem(combos);
}

function softHand(total) {
  return [11, total - 11];
}

function pairHand(rank) {
  return rank === 'A' ? [11, 11] : [Number(rank), Number(rank)];
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// One entry per chart cell, tagged with its (category, subType) bucket.
// Bucket keys are 'category-subType' (e.g. 'split-always', 'mimic-hard').
const CELLS = [];
const BUCKETS = {};

function classifyForBucket(hand, up) {
  return classifyDecision(hand, up, getOptimalAction(hand, up));
}

function indexCell(cell) {
  CELLS.push(cell);
  const subKey = `${cell.cat}-${cell.subType}`;
  (BUCKETS[subKey] ||= []).push(cell);
}

for (const total of HARD_KEYS) {
  for (const up of DEALER_UPCARDS) {
    const repHand = total === 20 ? [2, 8, 10]
      : (() => {
        for (let lo = 2; lo < total - lo; lo++) {
          const hi = total - lo;
          if (hi <= 10 && lo !== hi) return [lo, hi];
        }
        return [Math.floor(total / 2), Math.ceil(total / 2)];
      })();
    const { category, subType } = classifyForBucket(repHand, up);
    indexCell({ kind: 'hard', total, upcard: up, cat: category, subType });
  }
}
for (const total of SOFT_KEYS) {
  for (const up of DEALER_UPCARDS) {
    const { category, subType } = classifyForBucket(softHand(total), up);
    indexCell({ kind: 'soft', total, upcard: up, cat: category, subType });
  }
}
for (const rank of PAIR_KEYS) {
  for (const up of DEALER_UPCARDS) {
    const { category, subType } = classifyForBucket(pairHand(rank), up);
    indexCell({ kind: 'pair', rank, upcard: up, cat: category, subType });
  }
}

function cellToSituation(cell) {
  let hand;
  if (cell.kind === 'hard') hand = hardHand(cell.total);
  else if (cell.kind === 'soft') hand = softHand(cell.total);
  else hand = pairHand(cell.rank);
  // `type` here is the hand type (hard/soft/pair) — used by app.js for the
  // top-level stats.byType bucket. Distinct from the category subType.
  return { hand: shuffle(hand), upcard: cell.upcard, type: cell.kind };
}

// Pick a (cat, type) bucket key proportional to the player's cost / total
// in that bucket. Returns null when there's no observed loss anywhere yet.
function pickWeightedBucketKey(stats) {
  const keys = Object.keys(BUCKETS);
  const weights = keys.map(key => {
    const [cat, type] = key.split('-');
    const b = stats?.byCategory?.[cat]?.byType?.[type];
    if (!b || b.total === 0 || b.cost <= 0) return 0;
    return b.cost / b.total;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return null;
  let r = Math.random() * total;
  for (let i = 0; i < keys.length; i++) {
    r -= weights[i];
    if (r <= 0) return keys[i];
  }
  return keys[keys.length - 1];
}

const BUCKET_KEYS = Object.keys(BUCKETS);   // cached for the hot path

function exploreCell() {
  // Uniform over the (cat, subType) buckets — 10 of them — then uniform
  // over cells inside the chosen bucket. Every sub-skill (e.g. split-always
  // vs split-mixed) gets equal exploration regardless of cell count.
  const bucket = randomItem(BUCKET_KEYS);
  return randomItem(BUCKETS[bucket]);
}

export function dealSituation(stats) {
  if (!stats || Math.random() < EXPLORATION_RATE) {
    return cellToSituation(exploreCell());
  }
  // Exploitation: bias toward where the player is leaking EV.
  const bucketKey = pickWeightedBucketKey(stats);
  if (!bucketKey) return cellToSituation(exploreCell());
  return cellToSituation(randomItem(BUCKETS[bucketKey]));
}
