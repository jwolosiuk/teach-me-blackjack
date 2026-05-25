const WINDOW = 100;

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
  };
}

export function updateStats(stats, { result, type }) {
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
  };
}

export function recordPlayOutcome(stats, outcome, delta) {
  stats.hands++;
  if (outcome === 'win') stats.wins++;
  else if (outcome === 'loss') stats.losses++;
  else stats.pushes++;
  stats.netUnits += delta;
}

export function recordPlayDecision(stats, { correct, cost }) {
  stats.recent.push({ correct, cost });
  if (stats.recent.length > WINDOW) stats.recent.shift();
}

export function winPercent(stats) {
  if (stats.hands === 0) return null;
  return stats.wins / stats.hands;
}
