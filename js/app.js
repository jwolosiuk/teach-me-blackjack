import { dealSituation } from './deal.js';
import { legalActions, evaluateAction } from './evaluator.js';
import { classifyHand, strategyDependsOnUpcard, classifyDecision } from './strategy.js';
import { createStats, updateStats, accuracy, avgEvLoss, createPlayStats, migrateStats } from './stats.js';
import { buildDisplay, renderCard, renderBack } from './render.js';
import { renderAnalytics } from './analytics.js';
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
    statLabels: ['accuracy', 'ev loss', 'hands'],
  },
  play: {
    activate: () => play.activate(playStats, renderPlayStats, {
      timerEnabled: persistedSettings.timerEnabled,
      onTimerChange: (enabled) => { persistedSettings.timerEnabled = enabled; persist(); },
    }),
    deactivate: () => play.deactivate(),
    renderStats: renderPlayStats,
    statLabels: ['net', 'ev loss', 'hands'],
  },
  learn: {
    activate: () => {},
    deactivate: () => {},
    renderStats: () => {},          // no header stats in learn mode
    statLabels: ['', '', ''],
  },
};

const STORAGE_KEY = 'blackjack-trainer:v1';

let currentMode = null;
const persisted = loadPersisted();
const practiceStats = migrateStats(persisted.practice ?? createStats());
const playStats = migrateStats(persisted.play ?? createPlayStats());
const persistedSettings = persisted.settings ?? { timerEnabled: false };
const initialMode = ['practice', 'play', 'learn'].includes(persisted.mode) ? persisted.mode : 'practice';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      practice: data.practice && isPracticeShape(data.practice) ? data.practice : null,
      play: data.play && isPlayShape(data.play) ? data.play : null,
      mode: data.mode,
      settings: data.settings && typeof data.settings === 'object' ? data.settings : null,
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
      settings: persistedSettings,
    }));
  } catch {
    // storage unavailable / quota — ignore
  }
}

// Per-mode scroll positions so switching tabs doesn't carry the scroll
// state of one view into another (e.g. scrolling deep into the Learn
// article and then jumping into Play shouldn't land you mid-analytics).
const modeScrollY = {};

function switchMode(name) {
  if (currentMode === name) return;
  if (currentMode) {
    modeScrollY[currentMode] = window.scrollY;
    modes[currentMode].deactivate();
  }
  currentMode = name;
  document.body.dataset.mode = name;
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
  // Restore (or zero) this mode's scroll after the DOM has settled into
  // its new shape — heights and visibility changed, so doing it inline
  // would be racing the layout.
  requestAnimationFrame(() => window.scrollTo(0, modeScrollY[name] ?? 0));
  persist();
}

// ---------- practice mode (single-decision training) ----------

let current = null;
let currentResult = null; // last decision's result, kept so feedback survives tab switches
let pState = 'awaiting'; // 'awaiting' | 'feedback'
let pPendingAdvance = null;
let pFeedbackReady = false;
let pDocClick = null;

function deal() {
  cancelAdvance();
  pState = 'awaiting';
  pFeedbackReady = false;
  currentResult = null;
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
  currentResult = evaluateAction({ hand: current.hand, upcard: current.upcard, action, rules: RULES });
  const category = classifyDecision(current.hand, current.upcard, currentResult.optimal);
  updateStats(practiceStats, { result: currentResult, type: current.type, category });
  showFeedback(currentResult);
  renderPracticeStats();
  setTimeout(() => { pFeedbackReady = true; }, 120);
  if (currentResult.correct) pPendingAdvance = setTimeout(advance, 850);
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
  const acc = accuracy(practiceStats);
  const evl = avgEvLoss(practiceStats);
  $('stat-1').textContent = acc === null ? '—' : `${Math.round(acc * 100)}%`;
  $('stat-2').textContent = evl === null ? '—' : evl.toFixed(3);
  $('stat-3').textContent = String(practiceStats.total);
  renderAnalytics($('analytics'), practiceStats, { sortBy: 'ev' });
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
  if (current) {
    // Resume the situation that was on screen when the user last left this tab.
    renderSituation();
    renderActions();
    if (pState === 'feedback' && currentResult) {
      showFeedback(currentResult);
      pFeedbackReady = true;     // tap immediately to advance
    } else {
      hideFeedback();
    }
  } else {
    deal();
  }
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
  const net = playStats.netUnits;
  const sign = net > 0 ? '+' : '';
  $('stat-1').textContent = net === 0 ? '0' : `${sign}${Number.isInteger(net) ? net : net.toFixed(1)}`;
  const evl = avgEvLoss(playStats);
  $('stat-2').textContent = evl === null ? '—' : evl.toFixed(3);
  $('stat-3').textContent = String(playStats.hands);
  renderAnalytics($('analytics'), playStats);
  persist();
}

// ---------- bootstrap ----------

document.querySelectorAll('.mode-tab[data-mode]').forEach(tab => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

// Tap any header stat to scroll down to the per-category analytics.
document.querySelectorAll('.header .stat').forEach(el => {
  el.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('analytics').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Horizontal swipe anywhere on the page switches between Practice / Play /
// Learn. Vertical motion still goes to the browser (so the analytics list
// scrolls and the Learn article reads top-to-bottom). The listener lives
// on the document so it picks up swipes started on the analytics rows
// too — not just on .app.
const SWIPE_MIN_DX = 60;
const SWIPE_MAX_DY_RATIO = 1.5;
const SWIPEABLE_MODES = ['practice', 'play', 'learn'];
// Don't arm the swipe handler when the touch starts on a tappable control
// — otherwise a tap can be misread as a tiny swipe (or its click swallowed
// on some iOS builds). Expandable category rows (details/summary) are NOT
// in this list any more so swiping over a category still switches tabs;
// the touch threshold keeps short taps from triggering a switch.
const SWIPE_IGNORE_SELECTOR = 'button, a, .mode-tabs, .actions, .header';
let swipeStartX = 0, swipeStartY = 0, swipeActive = false;

document.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || e.target.closest(SWIPE_IGNORE_SELECTOR)) {
    swipeActive = false;
    return;
  }
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
  swipeActive = true;
}, { passive: true });

document.addEventListener('touchend', e => {
  if (!swipeActive || e.changedTouches.length !== 1) return;
  swipeActive = false;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = e.changedTouches[0].clientY - swipeStartY;
  if (Math.abs(dx) < SWIPE_MIN_DX) return;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_MAX_DY_RATIO) return;
  const i = SWIPEABLE_MODES.indexOf(currentMode);
  if (i === -1) return;
  const next = i + (dx < 0 ? 1 : -1);
  if (next >= 0 && next < SWIPEABLE_MODES.length) switchMode(SWIPEABLE_MODES[next]);
});

switchMode(initialMode);
