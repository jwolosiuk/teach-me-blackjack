// Per-rule-category breakdown of decision quality. Used by the main app
// (practice and play tabs) — pass in the stats object for the active mode
// and the analytics renders into the given root element.
//
// Categories come from strategy.classifyDecision and are mutually exclusive.
// Expandable ones reveal hard/soft sub-tiles tracked via stats.byCategory[*].byType.

import { RULE_CATEGORIES } from './strategy.js';

const CATEGORY_INFO = {
  mimic: {
    label: 'Mimic the dealer',
    desc: 'Hit below 17, stand at 17+ — even the worst common strategy already gets these right.',
    subTypes: ['hard', 'soft'],
  },
  hardTotals: {
    label: 'Hard totals',
    desc: 'When you need the bust-card insight: stand on 12+ vs dealer 2–6 (mimic would hit and bust).',
    subTypes: ['hard', 'soft'],
  },
  adjust: {
    label: 'Adjustments',
    desc: 'Exceptions to the basic rules: 12 vs 2–3 is hit, soft 18 vs 9 is hit, 11 vs A is hit.',
    subTypes: ['hard', 'soft'],
  },
  double: {
    label: 'Doubles',
    desc: 'Two-card non-pair hands where doubling is optimal (hard 9–11, soft doubles).',
    subTypes: ['hard', 'soft'],
  },
  split: {
    label: 'Splits',
    desc: 'Any pair situation — when to split and when not to.',
    subTypes: [],
  },
  surrender: {
    label: 'Surrenders',
    desc: 'Hard 16 vs 9/10/A and hard 15 vs 10 — half-unit refund beats playing the hand.',
    subTypes: [],
  },
};

const TYPE_LABEL = { hard: 'Hard', soft: 'Soft', pair: 'Pair' };

// Persist expanded category state across re-renders (analytics re-renders
// after every decision; without this the user's expansion would collapse).
const expandedCats = new Set();

function readCategory(stats, key) {
  const src = stats?.byCategory?.[key];
  const empty = { total: 0, correct: 0, cost: 0 };
  if (!src) return { ...empty, byType: { hard: { ...empty }, soft: { ...empty }, pair: { ...empty } } };
  return {
    total: src.total ?? 0,
    correct: src.correct ?? 0,
    cost: src.cost ?? 0,
    byType: {
      hard: { ...empty, ...(src.byType?.hard ?? {}) },
      soft: { ...empty, ...(src.byType?.soft ?? {}) },
      pair: { ...empty, ...(src.byType?.pair ?? {}) },
    },
  };
}

function overall(byCats) {
  let total = 0, correct = 0, cost = 0;
  for (const c of RULE_CATEGORIES) {
    total += byCats[c].total;
    correct += byCats[c].correct;
    cost += byCats[c].cost;
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

function statsHtml(d) {
  return `
    <span class="cat-stats">
      <span class="cat-stat"><span class="num">${d.total}</span><span class="lbl">hands</span></span>
      <span class="cat-stat"><span class="num">${pctText(d.correct, d.total)}</span><span class="lbl">acc</span></span>
      <span class="cat-stat"><span class="num">${evText(d.cost, d.total)}</span><span class="lbl">ev loss</span></span>
    </span>
  `;
}

function subRowsHtml(byType, types) {
  return types.map(t => {
    const d = byType[t];
    return `
      <div class="cat-sub ${tone(d)}">
        <div class="cat-head">
          <span class="sub-name">${TYPE_LABEL[t]}</span>
          ${statsHtml(d)}
        </div>
      </div>
    `;
  }).join('');
}

function categoryHtml(key, data) {
  const info = CATEGORY_INFO[key];
  const t = tone(data);
  const expandable = info.subTypes.length > 0;
  const isOpen = expanded(key);
  const headInner = `
    <div class="cat-head">
      <span class="cat-name">${escapeHtml(info.label)}${expandable ? '<span class="chev">▸</span>' : ''}</span>
      ${statsHtml(data)}
    </div>
    <div class="cat-desc">${escapeHtml(info.desc)}</div>
  `;
  if (!expandable) {
    return `<div class="cat-row ${t}" data-cat="${key}">${headInner}</div>`;
  }
  return `
    <details class="cat-row ${t}" data-cat="${key}" ${isOpen ? 'open' : ''}>
      <summary>${headInner}</summary>
      <div class="cat-subs">${subRowsHtml(data.byType, info.subTypes)}</div>
    </details>
  `;
}

function expanded(key) {
  return expandedCats.has(key);
}

export function renderAnalytics(root, stats) {
  const byCats = {};
  for (const c of RULE_CATEGORIES) byCats[c] = readCategory(stats, c);
  const all = overall(byCats);

  if (all.total === 0) {
    root.innerHTML = `<div class="analytics-empty">No decisions yet — play a few hands to see your stats here.</div>`;
    return;
  }

  // Worst category bubbles to the top so the user sees what to work on.
  const ordered = RULE_CATEGORIES.map(c => ({
    key: c,
    data: byCats[c],
    avgLoss: byCats[c].total === 0 ? -1 : byCats[c].cost / byCats[c].total,
  })).sort((a, b) => b.avgLoss - a.avgLoss);

  const overallHtml = `
    <div class="analytics-overall">
      <div class="cell"><span class="value">${all.total}</span><span class="label">decisions</span></div>
      <div class="cell"><span class="value">${pctText(all.correct, all.total)}</span><span class="label">accuracy</span></div>
      <div class="cell"><span class="value">${evText(all.cost, all.total)}</span><span class="label">ev loss</span></div>
    </div>
  `;

  const rowsHtml = ordered.map(({ key, data }) => categoryHtml(key, data)).join('');

  root.innerHTML = `
    <h2 class="analytics-title">By rule category</h2>
    ${overallHtml}
    <div class="cat-list">${rowsHtml}</div>
  `;

  // Keep the in-memory expanded set in sync with user toggles. Without this,
  // expanding a row and then making a decision would collapse it again on
  // the next renderAnalytics() call.
  root.querySelectorAll('details[data-cat]').forEach(d => {
    d.addEventListener('toggle', () => {
      const k = d.dataset.cat;
      if (d.open) expandedCats.add(k); else expandedCats.delete(k);
    });
  });
}
