// Real basic-strategy EV solver.
//
// Computes the exact expected value of each legal action in bet units,
// under standard "peeked dealer" multi-deck rules with the chosen variant
// flags. Uses the infinite-deck approximation (each draw is i.i.d. with
// 1/13 per rank, 4/13 for ten-values) — the same approximation Wizard of
// Odds and most chart references use; it deviates from finite-deck values
// by less than 0.05% for 6-deck shoes, which is well below the EV
// differences between competing strategy decisions.
//
// API:
//   solveActions(hand, upcard, rules) -> { H, S, D?, P?, R? } in bet units
//
// EV sign convention: +1 = win one unit, -1 = lose one unit, 0 = push.
// Doubles can return ±2, splits can return ±2 (two independent hands),
// blackjack pays 1.5.

const CARD_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CARD_PROB = {
  2: 1/13, 3: 1/13, 4: 1/13, 5: 1/13, 6: 1/13,
  7: 1/13, 8: 1/13, 9: 1/13, 10: 4/13, 11: 1/13,
};

// Caches keyed by rule variant. Cleared by clearCaches() for tests.
const dealerCache = new Map();   // key: "upcard:S17?"  -> dealer outcome distribution
const dealerPlayCache = new Map(); // key: "total:soft:S17?" -> dealer continuation distribution
const hitCache = new Map();      // key: "total:soft:upcard:S17?" -> EV of optimal play from (total,soft)

export function clearCaches() {
  dealerCache.clear();
  dealerPlayCache.clear();
  hitCache.clear();
}

// ---------- helpers ----------

export function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c;
    if (c === 11) aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export function isSoft(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c;
    if (c === 11) aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return aces > 0;
}

// Add one card to a (total, soft) state. Returns the new state, or
// null on bust. See ../tests for the exhaustive truth table.
export function addCard(total, soft, card) {
  let newTotal, newSoft;
  if (card === 11) {
    if (total + 11 <= 21) {
      newTotal = total + 11;
      newSoft = true;
    } else {
      newTotal = total + 1;
      newSoft = soft;
    }
  } else {
    newTotal = total + card;
    newSoft = soft;
  }
  if (newTotal > 21) {
    if (newSoft) {
      newTotal -= 10;
      newSoft = false;
    } else {
      return null;
    }
  }
  return { total: newTotal, soft: newSoft };
}

// ---------- dealer ----------

// Continuation distribution: given the dealer is at (total, soft) and must
// keep drawing per rule, what's P(final = 17..21 or bust)?
function dealerContinue(total, soft, dealerHitsSoft17) {
  const key = `${total}:${soft ? 's' : 'h'}:${dealerHitsSoft17 ? 1 : 0}`;
  const cached = dealerPlayCache.get(key);
  if (cached) return cached;

  // Stand conditions
  const mustStand = total >= 17 && !(dealerHitsSoft17 && soft && total === 17);
  if (mustStand) {
    const dist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
    dist[total] = 1;
    dealerPlayCache.set(key, dist);
    return dist;
  }

  const dist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  for (const card of CARD_VALUES) {
    const p = CARD_PROB[card];
    const next = addCard(total, soft, card);
    if (next === null) {
      dist.bust += p;
    } else {
      const sub = dealerContinue(next.total, next.soft, dealerHitsSoft17);
      for (const k of Object.keys(sub)) dist[k] += p * sub[k];
    }
  }
  dealerPlayCache.set(key, dist);
  return dist;
}

// Dealer outcome distribution given upcard, conditioned on "no dealer
// natural blackjack" when the dealer peeks (upcard 10 or A in US rules).
function dealerOutcomes(upcard, rules) {
  const s17key = rules.dealerHitsSoft17 ? 1 : 0;
  const key = `${upcard}:${s17key}`;
  const cached = dealerCache.get(key);
  if (cached) return cached;

  // Build hole-card distribution. With peek, exclude the BJ-completing card.
  const holeProb = { ...CARD_PROB };
  if (upcard === 11) holeProb[10] = 0;
  if (upcard === 10) holeProb[11] = 0;
  const norm = Object.values(holeProb).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(holeProb)) holeProb[k] /= norm;

  const dist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  for (const card of CARD_VALUES) {
    const p = holeProb[card];
    if (p === 0) continue;
    const start = addCard(upcard, upcard === 11, card); // upcard ace is soft
    // start cannot be null: two cards never bust
    const sub = dealerContinue(start.total, start.soft, rules.dealerHitsSoft17);
    for (const k of Object.keys(sub)) dist[k] += p * sub[k];
  }
  dealerCache.set(key, dist);
  return dist;
}

// ---------- per-action EV ----------

function evStand(playerTotal, dealerDist) {
  let win = 0, loss = 0;
  for (const k of Object.keys(dealerDist)) {
    const p = dealerDist[k];
    if (k === 'bust') { win += p; continue; }
    const d = +k;
    if (playerTotal > d) win += p;
    else if (playerTotal < d) loss += p;
  }
  return win - loss;
}

function evHit(total, soft, upcard, rules, dealerDist) {
  const key = `${total}:${soft ? 's' : 'h'}:${upcard}:${rules.dealerHitsSoft17 ? 1 : 0}`;
  const cached = hitCache.get(key);
  if (cached !== undefined) return cached;

  let ev = 0;
  for (const card of CARD_VALUES) {
    const p = CARD_PROB[card];
    const next = addCard(total, soft, card);
    if (next === null) {
      ev += p * -1;
    } else {
      const sEV = evStand(next.total, dealerDist);
      const hEV = evHit(next.total, next.soft, upcard, rules, dealerDist);
      ev += p * Math.max(sEV, hEV);
    }
  }
  hitCache.set(key, ev);
  return ev;
}

function evDouble(total, soft, dealerDist) {
  let ev = 0;
  for (const card of CARD_VALUES) {
    const p = CARD_PROB[card];
    const next = addCard(total, soft, card);
    if (next === null) ev += p * -2;
    else                ev += p * 2 * evStand(next.total, dealerDist);
  }
  return ev;
}

// EV of splitting a pair of `pair` (card value). Per standard chart-solver
// convention: each post-split hand is two cards, plays optimally with
// H/S/D (no resplit). Split aces are restricted to a single card each, no
// double, no resplit — the most common casino rule.
function evSplit(pair, upcard, rules, dealerDist) {
  const isAce = pair === 11;
  let evPerHand = 0;
  for (const card of CARD_VALUES) {
    const p = CARD_PROB[card];
    if (isAce) {
      // Split ace + new card. Treat ace as 11 when possible.
      let total = 11 + card;
      let soft = true;
      if (card === 11) { total = 12; }   // A,A → soft 12 (only one A can be 11)
      // Auto-stand (no further action allowed).
      evPerHand += p * evStand(total, dealerDist);
    } else {
      // Two-card hand: [pair, card]. Play H/S/D optimally.
      let total, soft;
      if (card === 11) {
        // pair + ace: try ace as 11
        if (pair + 11 <= 21) { total = pair + 11; soft = true; }
        else { total = pair + 1; soft = false; } // can't happen for pair ≤ 10
      } else {
        total = pair + card;
        soft = false;
      }
      // 2-card 21 here is NOT a natural BJ (it's a split hand); pays 1:1.
      const sEV = evStand(total, dealerDist);
      const hEV = evHit(total, soft, upcard, rules, dealerDist);
      const dEV = rules.das === false ? -Infinity : evDouble(total, soft, dealerDist);
      evPerHand += p * Math.max(sEV, hEV, dEV);
    }
  }
  return 2 * evPerHand;
}

// ---------- public API ----------

export function solveActions(hand, upcard, rules = {}) {
  const r = { dealerHitsSoft17: false, das: true, lateSurrender: true, ...rules };
  const dealerDist = dealerOutcomes(upcard, r);
  const total = handTotal(hand);
  const soft = isSoft(hand);
  const twoCard = hand.length === 2;
  const pair = twoCard && hand[0] === hand[1];

  // Natural blackjack on a two-card 21: not a decision, but for completeness
  // return its payoff. Caller normally won't ask about BJ hands.
  if (twoCard && total === 21) return { S: 1.5 };

  const ev = {};
  ev.S = evStand(total, dealerDist);
  ev.H = evHit(total, soft, upcard, r, dealerDist);
  if (twoCard) {
    ev.D = evDouble(total, soft, dealerDist);
    if (r.lateSurrender) ev.R = -0.5;
    if (pair) ev.P = evSplit(hand[0], upcard, r, dealerDist);
  }
  return ev;
}

// Expose dealer distribution for tests / UI introspection.
export function dealerDistribution(upcard, rules = {}) {
  return dealerOutcomes(upcard, { dealerHitsSoft17: false, ...rules });
}
