// Pure blackjack mechanics for play mode: shoe, hand totals, dealer rule.
// Stateless except for the shoe array, which callers own.

const NUM_DECKS = 6;
const SHUFFLE_AT = NUM_DECKS * 52 * 0.25;

function freshDeck() {
  const out = [];
  for (let d = 0; d < NUM_DECKS; d++) {
    for (let s = 0; s < 4; s++) {
      for (let v = 2; v <= 9; v++) out.push(v);
      out.push(10, 10, 10, 10); // 10, J, Q, K all count as 10
      out.push(11);              // Ace (counted as 11 by default)
    }
  }
  return out;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createShoe() {
  return shuffleInPlace(freshDeck());
}

// Reshuffle when we cross typical 75% penetration.
export function reshuffleIfLow(shoe) {
  return shoe.length < SHUFFLE_AT ? createShoe() : shoe;
}

export function drawCard(shoe) {
  return shoe.pop();
}

export function handTotal(cards) {
  let total = cards.reduce((a, b) => a + b, 0);
  let aces = cards.filter(c => c === 11).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

// Soft = at least one ace still counted as 11 in the current total.
export function isSoft(cards) {
  let total = cards.reduce((a, b) => a + b, 0);
  let aces = cards.filter(c => c === 11).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return aces > 0 && total <= 21;
}

export function isBust(cards) {
  return handTotal(cards) > 21;
}

export function isBlackjack(cards) {
  return cards.length === 2 && handTotal(cards) === 21;
}

// Mutates `cards` in-place, drawing from `shoe` until dealer rule says stop.
export function dealerPlay(cards, shoe, dealerHitsSoft17 = false) {
  while (true) {
    const total = handTotal(cards);
    if (total > 17) return cards;
    if (total === 17 && !(dealerHitsSoft17 && isSoft(cards))) return cards;
    cards.push(drawCard(shoe));
  }
}
