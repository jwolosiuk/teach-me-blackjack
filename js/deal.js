import { hardTotals, softTotals, pairs, DEALER_UPCARDS } from './strategy-table.js';

const HARD_KEYS = Object.keys(hardTotals).map(Number);
const SOFT_KEYS = Object.keys(softTotals).map(Number);
const PAIR_KEYS = Object.keys(pairs);

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

// Uniform across the three chart buckets so every cell gets practice.
export function dealSituation() {
  const bucket = Math.floor(Math.random() * 3);
  let hand, type;
  if (bucket === 0) {
    hand = hardHand(randomItem(HARD_KEYS));
    type = 'hard';
  } else if (bucket === 1) {
    hand = softHand(randomItem(SOFT_KEYS));
    type = 'soft';
  } else {
    hand = pairHand(randomItem(PAIR_KEYS));
    type = 'pair';
  }
  return {
    hand: shuffle(hand),
    upcard: randomItem(DEALER_UPCARDS),
    type,
  };
}
