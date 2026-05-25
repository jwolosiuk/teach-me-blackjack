// Full-game mode. Stateful: persists a shoe and a hand-in-progress across
// renders. Settle = update play-stats, then click anywhere to deal next.

import {
  createShoe, reshuffleIfLow, drawCard,
  handTotal, isSoft, isBust, isBlackjack, dealerPlay,
} from './game.js';
import { buildDisplay, renderCard, renderBack } from './render.js';
import { recordPlayOutcome, recordPlayDecision } from './stats.js';
import { evaluateAction } from './evaluator.js';
import { classifyDecision, classifyHand } from './strategy.js';

const RULES = { dealerHitsSoft17: false, das: true, lateSurrender: true };

const ACTION_LABELS = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };
const ACTION_ORDER = ['H', 'S', 'D', 'P', 'R'];

const $ = id => document.getElementById(id);

let stats = null;
let onStatsChange = null;
let shoe = null;
let game = null;
let pendingTimeout = null;
let feedbackReady = false;
let docClickListener = null;

function newHand(cards, bet = 1) {
  return {
    cards,
    display: buildDisplay(cards),
    bet,
    status: 'playing',     // 'playing' | 'stand' | 'bust' | 'surrendered' | 'blackjack'
    fromSplitAce: false,
    doubled: false,
  };
}

function deal() {
  cancelTimeouts();
  shoe = reshuffleIfLow(shoe || createShoe());
  const dealerCards = [drawCard(shoe), drawCard(shoe)];
  const playerCards = [drawCard(shoe), drawCard(shoe)];
  game = {
    phase: 'awaiting',
    dealer: dealerCards,
    dealerDisplay: buildDisplay(dealerCards),
    hands: [newHand(playerCards)],
    active: 0,
    result: null,
    lastDecision: null,
    mistakes: 0,
    totalCost: 0,
  };

  const playerBJ = isBlackjack(playerCards);
  if (playerBJ) game.hands[0].status = 'blackjack';

  const dealerPeeks = dealerCards[0] === 10 || dealerCards[0] === 11;
  const dealerBJ = isBlackjack(dealerCards);

  if (playerBJ || (dealerPeeks && dealerBJ)) {
    game.phase = 'reveal';
    render();
    pendingTimeout = setTimeout(resolve, 650);
  } else {
    render();
  }
}

function activeHand() {
  return game.hands[game.active];
}

function legalActions() {
  const h = activeHand();
  if (!h || h.status !== 'playing') return [];
  const actions = ['H', 'S'];
  if (h.cards.length === 2 && !h.fromSplitAce) {
    actions.push('D');
    // surrender + split: only on the very first decision (no splits yet)
    if (game.hands.length === 1 && RULES.lateSurrender) actions.push('R');
    if (game.hands.length === 1 && h.cards[0] === h.cards[1]) actions.push('P');
  }
  return actions;
}

function handleAction(action) {
  if (game.phase !== 'awaiting') return;
  const legal = legalActions();
  if (!legal.includes(action)) return;
  const h = activeHand();

  // Score against basic strategy before mutating. Skip when the chart's
  // optimal action isn't available in the current legal set (e.g. P after
  // a previous split, where the chart would still say "P" for an [8,8] hand
  // but resplit isn't offered — feedback would be misleading there).
  const decision = evaluateAction({ hand: h.cards, upcard: game.dealer[0], action, rules: RULES });
  game.lastDecision = legal.includes(decision.optimal) ? decision : null;
  if (game.lastDecision) {
    const category = classifyDecision(h.cards, game.dealer[0], game.lastDecision.optimal);
    const type = classifyHand(h.cards).type;
    recordPlayDecision(stats, {
      correct: game.lastDecision.correct,
      cost: game.lastDecision.cost,
      category,
      type,
    });
    onStatsChange?.(stats);
    if (!game.lastDecision.correct) {
      game.mistakes++;
      game.totalCost += game.lastDecision.cost;
    }
  }

  if (action === 'H') {
    h.cards.push(drawCard(shoe));
    h.display = buildDisplay(h.cards);
    if (isBust(h.cards)) h.status = 'bust';
    else if (handTotal(h.cards) === 21) h.status = 'stand';
  } else if (action === 'S') {
    h.status = 'stand';
  } else if (action === 'D') {
    h.doubled = true;
    h.bet *= 2;
    h.cards.push(drawCard(shoe));
    h.display = buildDisplay(h.cards);
    h.status = isBust(h.cards) ? 'bust' : 'stand';
  } else if (action === 'P') {
    const [c1, c2] = h.cards;
    const aces = c1 === 11;
    const left = newHand([c1, drawCard(shoe)], h.bet);
    const right = newHand([c2, drawCard(shoe)], h.bet);
    if (aces) {
      left.fromSplitAce = right.fromSplitAce = true;
      left.status = right.status = 'stand';
    } else {
      [left, right].forEach(nh => {
        if (handTotal(nh.cards) === 21) nh.status = 'stand';
      });
    }
    game.hands.splice(game.active, 1, left, right);
  } else if (action === 'R') {
    h.status = 'surrendered';
  }

  advance();
}

function advance() {
  if (activeHand() && activeHand().status === 'playing') {
    render();
    return;
  }
  for (let i = game.active + 1; i < game.hands.length; i++) {
    if (game.hands[i].status === 'playing') {
      game.active = i;
      render();
      return;
    }
  }
  // No live decisions left — reveal dealer; player taps to settle
  game.phase = 'reveal';
  render();
}

function resolve() {
  // Dealer only draws when the player has at least one hand sitting on a
  // committed total (not bust, surrender, or natural blackjack — those resolve
  // independently of the dealer's final total).
  const dealerMustPlay = game.hands.some(h => h.status === 'stand');
  if (dealerMustPlay && !isBlackjack(game.dealer)) {
    dealerPlay(game.dealer, shoe, RULES.dealerHitsSoft17);
    game.dealerDisplay = buildDisplay(game.dealer);
  }
  game.result = settle();
  game.phase = 'result';
  game.result.hands.forEach(r => recordPlayOutcome(stats, r.outcome, r.delta));
  onStatsChange?.(stats);
  render();
  // brief grace period so the action click doesn't immediately re-deal
  feedbackReady = false;
  pendingTimeout = setTimeout(() => { feedbackReady = true; }, 250);
}

function settle() {
  const dTotal = handTotal(game.dealer);
  const dBust = dTotal > 21;
  const dBJ = isBlackjack(game.dealer);

  const hands = game.hands.map(h => {
    if (h.status === 'surrendered') return { outcome: 'loss', delta: -h.bet / 2, label: 'Surrender' };
    if (h.status === 'blackjack') {
      if (dBJ) return { outcome: 'push', delta: 0, label: 'Push' };
      return { outcome: 'win', delta: h.bet * 1.5, label: 'Blackjack' };
    }
    if (h.status === 'bust') return { outcome: 'loss', delta: -h.bet, label: 'Bust' };
    if (dBJ) return { outcome: 'loss', delta: -h.bet, label: 'Dealer BJ' };
    const pTotal = handTotal(h.cards);
    if (dBust) return { outcome: 'win', delta: h.bet, label: 'Dealer bust' };
    if (pTotal > dTotal) return { outcome: 'win', delta: h.bet, label: 'Win' };
    if (pTotal < dTotal) return { outcome: 'loss', delta: -h.bet, label: 'Loss' };
    return { outcome: 'push', delta: 0, label: 'Push' };
  });
  const delta = hands.reduce((s, r) => s + r.delta, 0);
  return { hands, delta };
}

function maybeAdvanceOnTap() {
  if (game?.phase === 'reveal') { resolve(); return; }
  if (game?.phase === 'result' && feedbackReady) deal();
}

function cancelTimeouts() {
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
}

// ---------- rendering ----------

function render() {
  renderDealer();
  renderPlayer();
  renderActions();
  renderResult();
}

function renderDealer() {
  const el = $('dealer-cards');
  el.innerHTML = '';
  if (game.phase === 'awaiting') {
    el.appendChild(renderCard(game.dealerDisplay[0]));
    el.appendChild(renderBack());
  } else {
    game.dealerDisplay.forEach(c => el.appendChild(renderCard(c)));
  }

  const label = $('dealer-label');
  if (game.phase !== 'awaiting' && isBust(game.dealer)) label.textContent = 'Dealer · Bust';
  else if (game.phase !== 'awaiting' && isBlackjack(game.dealer)) label.textContent = 'Dealer · Blackjack';
  else label.textContent = 'Dealer';
}

function renderPlayer() {
  const wrap = $('player-cards');
  wrap.innerHTML = '';
  wrap.classList.toggle('split', game.hands.length > 1);

  const label = $('hand-label');
  if (game.hands.length > 1) {
    label.hidden = true;
  } else {
    const summary = formatHandSummary(game.hands[0]);
    label.hidden = summary === '';
    label.innerHTML = summary;
  }

  if (game.hands.length === 1) {
    game.hands[0].display.forEach(c => wrap.appendChild(renderCard(c)));
    return;
  }

  game.hands.forEach((h, i) => {
    const group = document.createElement('div');
    group.className = 'split-hand';
    if (i === game.active && game.phase === 'awaiting') group.classList.add('active');
    const cards = document.createElement('div');
    cards.className = 'cards split-cards';
    h.display.forEach(c => cards.appendChild(renderCard(c)));
    group.appendChild(cards);
    const summary = formatHandSummary(h);
    if (summary !== '') {
      const total = document.createElement('div');
      total.className = 'split-label';
      total.innerHTML = summary;
      group.appendChild(total);
    }
    wrap.appendChild(group);
  });
}

// Play mode hides the running total — the user reads the cards. We still
// surface terminal states (Blackjack / Bust / Surrender) since those drive
// the result and shouldn't be left ambiguous.
function formatHandSummary(h) {
  if (h.status === 'surrendered') return 'Surrender';
  if (isBlackjack(h.cards)) return 'Blackjack';
  if (h.status === 'bust') return 'Bust';
  return '';
}

function renderActions() {
  const el = $('actions');
  el.innerHTML = '';
  if (game.phase !== 'awaiting') return;
  const legal = legalActions();
  const ordered = ACTION_ORDER.filter(a => legal.includes(a));
  ordered.forEach(a => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.action = a;
    btn.textContent = ACTION_LABELS[a];
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleAction(a);
    });
    el.appendChild(btn);
  });
  if (ordered.length % 2 === 1) el.lastChild.classList.add('span-2');
}

function renderResult() {
  const fb = $('feedback');
  if (game.phase === 'result') {
    const r = game.result;
    const tone = r.delta > 0 ? 'good' : r.delta < 0 ? 'bad' : 'neutral';
    const icon = r.delta > 0 ? '✓' : r.delta < 0 ? '✗' : '=';
    const sign = r.delta > 0 ? '+' : '';
    const deltaTxt = r.delta === 0 ? '' : ` <b>${sign}${formatDelta(r.delta)}</b>`;
    const labels = r.hands.map(h => h.label).join(' · ');
    const note = game.mistakes > 0
      ? ` <span class="muted-note">· ${game.mistakes} misplay${game.mistakes > 1 ? 's' : ''} (${formatEvCost(game.totalCost)})</span>`
      : '';
    fb.hidden = false;
    fb.className = `feedback ${tone}`;
    fb.innerHTML = `<span class="icon">${icon}</span><span>${labels}${deltaTxt}${note}</span>`;
    return;
  }
  if (game.lastDecision) {
    const d = game.lastDecision;
    fb.hidden = false;
    if (d.correct) {
      fb.className = 'feedback good';
      fb.innerHTML = `<span class="icon">✓</span><span>${ACTION_LABELS[d.chosen]}</span>`;
    } else {
      fb.className = 'feedback bad';
      fb.innerHTML = `<span class="icon">✗</span><span>Should be <b>${ACTION_LABELS[d.optimal]}</b> <span class="muted-note">(${formatEvCost(d.cost)})</span></span>`;
    }
    return;
  }
  fb.hidden = true;
}

function formatEvCost(cost) {
  if (cost < 0.005) return '−<0.01 EV';
  return `−${cost.toFixed(2)} EV`;
}

function formatDelta(d) {
  return Number.isInteger(d) ? String(d) : d.toFixed(1);
}

// ---------- public API ----------

export function activate(playStats, statsChangeCb) {
  stats = playStats;
  onStatsChange = statsChangeCb;
  docClickListener = maybeAdvanceOnTap;
  document.addEventListener('click', docClickListener);
  if (game) {
    // Resume the hand the user left mid-decision (or the result banner
    // they hadn't tapped past yet).
    if (game.phase === 'result') feedbackReady = true;
    render();
  } else {
    deal();
  }
}

export function deactivate() {
  cancelTimeouts();
  if (docClickListener) {
    document.removeEventListener('click', docClickListener);
    docClickListener = null;
  }
  // Keep `game` so re-entering this tab resumes the hand instead of dealing a
  // fresh one. The shoe is module-level too, so card draws stay consistent.
}
