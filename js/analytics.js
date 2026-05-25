// Per-rule-category breakdown of decision quality. Used by the main app
// (practice and play tabs) — pass in the stats object for the active mode
// and the analytics renders into the given root element.
//
// Categories come from strategy.classifyDecision and are mutually exclusive.

import { RULE_CATEGORIES } from './strategy.js';

const CATEGORY_INFO = {
  basic: {
    label: 'Basic hit / stand',
    desc: 'Stand on 12+ vs dealer 2–6; hit until 17 vs 7–A. Soft hands: stand 18+, hit otherwise.',
  },
  adjust: {
    label: 'Adjustments',
    desc: 'Exceptions to the basic rule (e.g. 12 vs 2–3 is hit, soft 18 vs 9 is hit, 11 vs A is hit).',
  },
  double: {
    label: 'Doubles',
    desc: 'Two-card non-pair hands where doubling is optimal (hard 9–11, soft doubles).',
  },
  split: {
    label: 'Splits',
    desc: 'Any pair situation — when to split and when not to.',
  },
  surrender: {
    label: 'Surrenders',
    desc: 'Hard 16 vs 9/10/A and hard 15 vs 10 — half-unit refund beats playing the hand.',
  },
};

function readByCategory(stats) {
  const out = {};
  for (const c of RULE_CATEGORIES) out[c] = { total: 0, correct: 0, cost: 0 };
  if (!stats?.byCategory) return out;
  for (const c of RULE_CATEGORIES) {
    const src = stats.byCategory[c];
    if (!src) continue;
    out[c] = { total: src.total, correct: src.correct, cost: src.cost };
  }
  return out;
}

function overall(byCategory) {
  let total = 0, correct = 0, cost = 0;
  for (const c of RULE_CATEGORIES) {
    total += byCategory[c].total;
    correct += byCategory[c].correct;
    cost += byCategory[c].cost;
  }
  return { total, correct, cost };
}

function pctText(num, den) {
  if (den === 0) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

function evText(cost, total) {
  if (total === 0) return '—';
  const avg = cost / total;
  if (avg < 0.0005) return '0.000';
  return avg.toFixed(3);
}

// Heuristic tone for the row: red when EV loss is high, green when low,
// neutral when sample is too small to judge.
function tone({ total, correct, cost }) {
  if (total < 5) return 'neutral';
  const avgLoss = cost / total;
  const acc = correct / total;
  if (avgLoss < 0.005 && acc >= 0.95) return 'good';
  if (avgLoss > 0.04 || acc < 0.75) return 'bad';
  return 'warn';
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function renderAnalytics(root, stats) {
  const byCat = readByCategory(stats);
  const all = overall(byCat);

  if (all.total === 0) {
    root.innerHTML = `<div class="analytics-empty">No decisions yet — play a few hands to see your stats here.</div>`;
    return;
  }

  // Worst category bubbles to the top so the user sees what to work on.
  const rows = RULE_CATEGORIES.map(c => ({
    info: CATEGORY_INFO[c],
    data: byCat[c],
    avgLoss: byCat[c].total === 0 ? -1 : byCat[c].cost / byCat[c].total,
  })).sort((a, b) => b.avgLoss - a.avgLoss);

  const overallHtml = `
    <div class="analytics-overall">
      <div class="cell"><span class="value">${all.total}</span><span class="label">decisions</span></div>
      <div class="cell"><span class="value">${pctText(all.correct, all.total)}</span><span class="label">accuracy</span></div>
      <div class="cell"><span class="value">${evText(all.cost, all.total)}</span><span class="label">ev loss</span></div>
    </div>
  `;

  const rowsHtml = rows.map(({ info, data }) => `
    <div class="cat-row ${tone(data)}">
      <div class="cat-head">
        <span class="cat-name">${escapeHtml(info.label)}</span>
        <span class="cat-stats">
          <span class="cat-stat"><span class="num">${data.total}</span><span class="lbl">hands</span></span>
          <span class="cat-stat"><span class="num">${pctText(data.correct, data.total)}</span><span class="lbl">acc</span></span>
          <span class="cat-stat"><span class="num">${evText(data.cost, data.total)}</span><span class="lbl">ev loss</span></span>
        </span>
      </div>
      <p class="cat-desc">${escapeHtml(info.desc)}</p>
    </div>
  `).join('');

  root.innerHTML = `
    <h2 class="analytics-title">By rule category</h2>
    ${overallHtml}
    <div class="cat-list">${rowsHtml}</div>
  `;
}
