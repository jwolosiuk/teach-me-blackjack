const WINDOW = 100;

const CATEGORIES = ['basic', 'adjust', 'double', 'split', 'surrender'];

function emptyByCategory() {
  const out = {};
  for (const c of CATEGORIES) out[c] = { total: 0, correct: 0, cost: 0 };
  return out;
}

// Older persisted stats may be missing newer fields; this brings them up to date.
export function migrateStats(stats) {
  if (!stats) return stats;
  if (!Array.isArray(stats.recent)) stats.recent = [];
  if (!stats.byCategory) stats.byCategory = emptyByCategory();
  else for (const c of CATEGORIES) {
    if (!stats.byCategory[c]) stats.byCategory[c] = { total: 0, correct: 0, cost: 0 };
  }
  return stats;
}

export function createStats() {
  return {
    total: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    byType: {
      hard: { total: 0, correct: 0 },
      soft: { total: 0, correct: 0 },
      pair: { total: 0, correct: 0 },
    },
    // Unified V1/V3 accumulators. Efficiency = 1 - totalCost / totalOptimal.
    // V1 (binary EV): collapses to correct/total — every miss costs 1 of 1 available.
    // V3 (real EV):   fraction of available EV the player actually captured.
    totalCost: 0,
    totalOptimal: 0,
    // Rolling window of the last WINDOW decisions: { correct, cost }.
    // Drives the headline accuracy / EV-loss stats so they reflect recent play.
    recent: [],
    // Cumulative per-rule-category breakdown for the analytics page.
    byCategory: emptyByCategory(),
  };
}

export function updateStats(stats, { result, type, category }) {
  stats.total++;
  stats.byType[type].total++;
  if (result.correct) {
    stats.correct++;
    stats.byType[type].correct++;
    stats.streak++;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  } else {
    stats.streak = 0;
  }
  stats.totalCost += result.cost;
  stats.totalOptimal += result.optimalEv;
  stats.recent.push({ correct: result.correct, cost: result.cost });
  if (stats.recent.length > WINDOW) stats.recent.shift();
  if (category && stats.byCategory?.[category]) {
    const bc = stats.byCategory[category];
    bc.total++;
    if (result.correct) bc.correct++;
    bc.cost += result.cost;
  }
}

export function efficiency(stats) {
  if (stats.total === 0) return null;
  return 1 - stats.totalCost / stats.total;
}

export function accuracy(stats) {
  const r = stats.recent ?? [];
  if (r.length === 0) return null;
  let correct = 0;
  for (const d of r) if (d.correct) correct++;
  return correct / r.length;
}

export function avgEvLoss(stats) {
  const r = stats.recent ?? [];
  if (r.length === 0) return null;
  let sum = 0;
  for (const d of r) sum += d.cost;
  return sum / r.length;
}

// --- Play-mode stats (separate from training accuracy). One settled
// hand = one increment, so split hands count individually.
export function createPlayStats() {
  return {
    hands: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    netUnits: 0,
    // Same shape as practice recent[] so avgEvLoss() works on it too.
    recent: [],
    byCategory: emptyByCategory(),
  };
}

export function recordPlayOutcome(stats, outcome, delta) {
  stats.hands++;
  if (outcome === 'win') stats.wins++;
  else if (outcome === 'loss') stats.losses++;
  else stats.pushes++;
  stats.netUnits += delta;
}

export function recordPlayDecision(stats, { correct, cost, category }) {
  stats.recent.push({ correct, cost });
  if (stats.recent.length > WINDOW) stats.recent.shift();
  if (category && stats.byCategory?.[category]) {
    const bc = stats.byCategory[category];
    bc.total++;
    if (correct) bc.correct++;
    bc.cost += cost;
  }
}

export function winPercent(stats) {
  if (stats.hands === 0) return null;
  return stats.wins / stats.hands;
}
