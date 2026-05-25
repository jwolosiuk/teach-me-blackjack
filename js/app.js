import { dealSituation } from './deal.js';
import { legalActions, evaluateAction } from './evaluator.js';
import { classifyHand } from './strategy.js';
import { createStats, updateStats, efficiency } from './stats.js';

const RULES = { dealerHitsSoft17: false, das: true, lateSurrender: true, numDecks: 6 };

const ACTION_LABELS = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double',
  P: 'Split',
  R: 'Surrender',
};
const ACTION_ORDER = ['H', 'S', 'D', 'P', 'R'];

const SUITS = ['♠', '♥', '♦', '♣'];
const RED_SUITS = new Set(['♥', '♦']);
const FACE_NAMES = ['10', 'J', 'Q', 'K'];

const $ = id => document.getElementById(id);

const stats = createStats();
let current = null;
// 'awaiting' = waiting for player action; 'feedback' = showing result, tap advances.
let state = 'awaiting';
let pendingAdvance = null;
let feedbackReady = false;

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rankLabel(value) {
  if (value === 11) return 'A';
  if (value === 10) return randomItem(FACE_NAMES);
  return String(value);
}

function buildDisplay(values) {
  return values.map(v => ({ rank: rankLabel(v), suit: randomItem(SUITS) }));
}

function renderCard(card) {
  const div = document.createElement('div');
  div.className = 'card' + (RED_SUITS.has(card.suit) ? ' red' : '');
  div.innerHTML = `
    <div class="rank">${card.rank}</div>
    <div class="suit">${card.suit}</div>
  `;
  return div;
}

function renderBack() {
  const div = document.createElement('div');
  div.className = 'card back';
  return div;
}

function handLabel(hand) {
  const { type, total } = classifyHand(hand);
  if (type === 'pair') {
    const rank = hand[0] === 11 ? 'Aces' : `${hand[0]}s`;
    return `Pair of ${rank}`;
  }
  if (type === 'soft') {
    return `Soft ${total} · A,${total - 11}`;
  }
  return `Hard ${total}`;
}

function deal() {
  cancelAdvance();
  state = 'awaiting';
  feedbackReady = false;
  current = dealSituation();
  current.display = {
    player: buildDisplay(current.hand),
    upcard: buildDisplay([current.upcard])[0],
  };
  renderSituation();
  renderActions();
  hideFeedback();
}

function renderSituation() {
  const dealerEl = $('dealer-cards');
  dealerEl.innerHTML = '';
  dealerEl.appendChild(renderCard(current.display.upcard));
  dealerEl.appendChild(renderBack());

  const playerEl = $('player-cards');
  playerEl.innerHTML = '';
  current.display.player.forEach(c => playerEl.appendChild(renderCard(c)));

  $('hand-label').textContent = handLabel(current.hand);
}

function renderActions() {
  const legal = legalActions(current.hand, RULES);
  const ordered = ACTION_ORDER.filter(a => legal.includes(a));
  const el = $('actions');
  el.innerHTML = '';
  ordered.forEach(a => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.action = a;
    btn.textContent = ACTION_LABELS[a];
    btn.addEventListener('click', e => handleAction(a, e));
    el.appendChild(btn);
  });
  if (ordered.length % 2 === 1) {
    el.lastChild.classList.add('span-2');
  }
}

function handleAction(action, e) {
  if (state !== 'awaiting') return;
  e.stopPropagation();
  state = 'feedback';
  const result = evaluateAction({ hand: current.hand, upcard: current.upcard, action, rules: RULES });
  updateStats(stats, { result, type: current.type });
  showFeedback(result);
  renderStats();

  // Brief grace period so the click that triggered feedback doesn't immediately advance.
  setTimeout(() => { feedbackReady = true; }, 120);
  if (result.correct) {
    pendingAdvance = setTimeout(advance, 850);
  }
}

function showFeedback(result) {
  const el = $('actions');
  for (const btn of el.children) {
    const a = btn.dataset.action;
    if (a === result.chosen) {
      btn.classList.add('chosen', result.correct ? 'good' : 'bad');
    }
    if (!result.correct && a === result.optimal) {
      btn.classList.add('reveal');
    }
  }
  const fb = $('feedback');
  fb.hidden = false;
  if (result.correct) {
    fb.className = 'feedback good';
    fb.innerHTML = `<span class="icon">✓</span><span>Correct</span>`;
  } else {
    fb.className = 'feedback bad';
    fb.innerHTML = `<span class="icon">✗</span><span>Should be <b>${ACTION_LABELS[result.optimal]}</b></span>`;
  }
  // V3 hook: if (result.cost !== undefined) append cost display here.
}

function hideFeedback() {
  $('feedback').hidden = true;
}

function renderStats() {
  const eff = efficiency(stats);
  $('accuracy').textContent = eff === null ? '—' : `${Math.round(eff * 100)}%`;
  $('streak').textContent = String(stats.streak);
  $('total').textContent = String(stats.total);
}

function cancelAdvance() {
  if (pendingAdvance !== null) {
    clearTimeout(pendingAdvance);
    pendingAdvance = null;
  }
}

function advance() {
  if (state !== 'feedback') return;
  cancelAdvance();
  deal();
}

document.addEventListener('click', () => {
  if (state === 'feedback' && feedbackReady) advance();
});

renderStats();
deal();
