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

export function efficiency(stats) {
  if (stats.totalOptimal === 0) return null;
  return 1 - stats.totalCost / stats.totalOptimal;
}
