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
}

// Average EV preserved per decision: 1 - avg cost (in bet units).
// For binary V1 (cost ∈ {0,1}) this collapses to correct/total = accuracy.
// For real V3 EVs, 100% = chart-perfect play, 99% ≈ leaking 0.01 bet/decision.
export function efficiency(stats) {
  if (stats.total === 0) return null;
  return 1 - stats.totalCost / stats.total;
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
  };
}

export function recordPlayOutcome(stats, outcome, delta) {
  stats.hands++;
  if (outcome === 'win') stats.wins++;
  else if (outcome === 'loss') stats.losses++;
  else stats.pushes++;
  stats.netUnits += delta;
}

export function winPercent(stats) {
  if (stats.hands === 0) return null;
  return stats.wins / stats.hands;
}
