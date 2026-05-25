import { dealSituation } from './deal.js';
import { legalActions, evaluateAction } from './evaluator.js';
import { classifyHand, strategyDependsOnUpcard } from './strategy.js';
import { createStats, updateStats, efficiency, createPlayStats, winPercent } from './stats.js';
import { buildDisplay, renderCard, renderBack } from './render.js';
import * as play from './play.js';

const RULES = { dealerHitsSoft17: false, das: true, lateSurrender: true, numDecks: 6 };

const ACTION_LABELS = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };
const ACTION_ORDER = ['H', 'S', 'D', 'P', 'R'];

const $ = id => document.getElementById(id);

// ---------- mode switching ----------

const modes = {
  practice: {
    activate: activatePractice,
    deactivate: deactivatePractice,
    renderStats: renderPracticeStats,
    statLabels: ['accuracy', 'streak', 'hands'],
  },
  play: {
    activate: () => play.activate(playStats, renderPlayStats),
    deactivate: () => play.deactivate(),
    renderStats: renderPlayStats,
    statLabels: ['win %', 'hands', 'net'],
  },
};

const STORAGE_KEY = 'blackjack-trainer:v1';

let currentMode = null;
const persisted = loadPersisted();
const practiceStats = persisted.practice ?? createStats();
const playStats = persisted.play ?? createPlayStats();
const initialMode = persisted.mode === 'play' ? 'play' : 'practice';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      practice: data.practice && isPracticeShape(data.practice) ? data.practice : null,
      play: data.play && isPlayShape(data.play) ? data.play : null,
      mode: data.mode,
    };
  } catch {
    return {};
  }
}

function isPracticeShape(s) {
  return s && typeof s.total === 'number' && s.byType && s.byType.hard && s.byType.soft && s.byType.pair;
}
function isPlayShape(s) {
  return s && typeof s.hands === 'number' && typeof s.wins === 'number';
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      practice: practiceStats,
      play: playStats,
      mode: currentMode,
    }));
  } catch {
    // storage unavailable / quota — ignore
  }
}

function switchMode(name) {
  if (currentMode === name) return;
  if (currentMode) modes[currentMode].deactivate();
  currentMode = name;
  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.classList.toggle('active', tab.dataset.mode === name);
  }
  // Reset shared DOM bits between modes
  $('feedback').hidden = true;
  $('actions').innerHTML = '';
  $('player-cards').classList.remove('split');
  // stat labels swap per mode
  document.querySelectorAll('.stat .label').forEach((el, i) => {
    el.textContent = modes[name].statLabels[i];
  });
  modes[name].renderStats();
  modes[name].activate();
  persist();
}

// ---------- practice mode (single-decision training) ----------

let current = null;
let pState = 'awaiting'; // 'awaiting' | 'feedback'
let pPendingAdvance = null;
let pFeedbackReady = false;
let pDocClick = null;

function deal() {
  cancelAdvance();
  pState = 'awaiting';
  pFeedbackReady = false;
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
  $('dealer-label').textContent = 'Dealer';

  const playerEl = $('player-cards');
  playerEl.innerHTML = '';
  current.display.player.forEach(c => playerEl.appendChild(renderCard(c)));

  const label = $('hand-label');
  label.hidden = false;
  label.innerHTML = handLabelHtml(current.hand);
}

function handLabelHtml(hand) {
  const { type, total } = classifyHand(hand);
  let text;
  if (type === 'pair') {
    const rank = hand[0] === 11 ? 'Aces' : `${hand[0]}s`;
    text = `Pair of ${rank}`;
  } else if (type === 'soft') {
    text = `Soft ${total} · A,${total - 11}`;
  } else {
    text = `Hard ${total}`;
  }
  const depends = strategyDependsOnUpcard(hand, RULES);
  const hint = depends
    ? `<span class="hint variable" title="Strategy depends on dealer upcard">?</span>`
    : `<span class="hint fixed" title="Strategy is the same vs any upcard">✓</span>`;
  return `<span class="hand-text">${text}</span>${hint}`;
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
    btn.addEventListener('click', e => handleDecision(a, e));
    el.appendChild(btn);
  });
  if (ordered.length % 2 === 1) el.lastChild.classList.add('span-2');
}

function handleDecision(action, e) {
  if (pState !== 'awaiting') return;
  e.stopPropagation();
  pState = 'feedback';
  const result = evaluateAction({ hand: current.hand, upcard: current.upcard, action, rules: RULES });
  updateStats(practiceStats, { result, type: current.type });
  showFeedback(result);
  renderPracticeStats();
  setTimeout(() => { pFeedbackReady = true; }, 120);
  if (result.correct) pPendingAdvance = setTimeout(advance, 850);
}

function showFeedback(result) {
  const el = $('actions');
  for (const btn of el.children) {
    const a = btn.dataset.action;
    if (a === result.chosen) btn.classList.add('chosen', result.correct ? 'good' : 'bad');
    if (!result.correct && a === result.optimal) btn.classList.add('reveal');
  }
  const fb = $('feedback');
  fb.hidden = false;
  if (result.correct) {
    fb.className = 'feedback good';
    fb.innerHTML = `<span class="icon">✓</span><span>Correct</span>`;
  } else {
    fb.className = 'feedback bad';
    fb.innerHTML = `<span class="icon">✗</span><span>Should be <b>${ACTION_LABELS[result.optimal]}</b> <span class="muted-note">(${formatEvCost(result.cost)})</span></span>`;
  }
}

// Cost is in bet units. Always negative (you lost EV vs optimal).
// Below 0.01 bet, show "<0.01" so a near-tie doesn't read as "0.00".
function formatEvCost(cost) {
  if (cost < 0.005) return '−<0.01 EV';
  return `−${cost.toFixed(2)} EV`;
}

function hideFeedback() {
  $('feedback').hidden = true;
}

function renderPracticeStats() {
  const eff = efficiency(practiceStats);
  $('stat-1').textContent = eff === null ? '—' : `${Math.round(eff * 100)}%`;
  $('stat-2').textContent = String(practiceStats.streak);
  $('stat-3').textContent = String(practiceStats.total);
  persist();
}

function cancelAdvance() {
  if (pPendingAdvance !== null) {
    clearTimeout(pPendingAdvance);
    pPendingAdvance = null;
  }
}

function advance() {
  if (pState !== 'feedback') return;
  cancelAdvance();
  deal();
}

function maybeAdvanceOnTap() {
  if (pState === 'feedback' && pFeedbackReady) advance();
}

function activatePractice() {
  pDocClick = maybeAdvanceOnTap;
  document.addEventListener('click', pDocClick);
  deal();
}

function deactivatePractice() {
  cancelAdvance();
  if (pDocClick) {
    document.removeEventListener('click', pDocClick);
    pDocClick = null;
  }
}

// ---------- play-mode stat rendering (data lives in play.js) ----------

function renderPlayStats() {
  const wp = winPercent(playStats);
  $('stat-1').textContent = wp === null ? '—' : `${Math.round(wp * 100)}%`;
  $('stat-2').textContent = String(playStats.hands);
  const net = playStats.netUnits;
  const sign = net > 0 ? '+' : '';
  $('stat-3').textContent = net === 0 ? '0' : `${sign}${Number.isInteger(net) ? net : net.toFixed(1)}`;
  persist();
}

// ---------- bootstrap ----------

document.querySelectorAll('.mode-tab[data-mode]').forEach(tab => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

switchMode(initialMode);
