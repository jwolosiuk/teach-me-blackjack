// Shared card-rendering helpers. Practice mode draws a single situation;
// play mode draws an evolving hand. Both want the same visual cards.

const SUITS = ['♠', '♥', '♦', '♣'];
const RED_SUITS = new Set(['♥', '♦']);
const FACE_NAMES = ['10', 'J', 'Q', 'K'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function rankLabel(value) {
  if (value === 11) return 'A';
  if (value === 10) return randomItem(FACE_NAMES);
  return String(value);
}

export function buildDisplay(values) {
  return values.map(v => ({ rank: rankLabel(v), suit: randomItem(SUITS) }));
}

export function renderCard(card) {
  const div = document.createElement('div');
  div.className = 'card' + (RED_SUITS.has(card.suit) ? ' red' : '');
  div.innerHTML = `
    <div class="rank">${card.rank}</div>
    <div class="suit">${card.suit}</div>
  `;
  return div;
}

export function renderBack() {
  const div = document.createElement('div');
  div.className = 'card back';
  return div;
}
