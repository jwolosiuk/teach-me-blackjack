// Per-rule-category breakdown of decision quality. Used by the main app
// (practice and play tabs) — pass in the stats object for the active mode
// and the analytics renders into the given root element.
//
// Categories come from strategy.classifyDecision and are mutually exclusive.
// Expandable ones reveal hard/soft sub-tiles tracked via stats.byCategory[*].byType.

import { RULE_CATEGORIES } from './strategy.js';

const CATEGORY_INFO = {
  mimic: {
    label: '1. Mimic the dealer',
    desc: 'Hit below 17, stand at 17+. The dumbest strategy already gets these right — including 11 vs A and 12 vs 2–3.',
    subTypes: ['hard', 'soft'],
  },
  hardTotals: {
    label: '2A. Hard totals',
    desc: 'Mimic is wrong but the basic rule fixes it. Hard 12–16 stands vs dealer 2–6 (mimic hits and busts). Soft 17 (A,6) hits vs 2 and vs 7–A (mimic stands on it because it\'s ≥17, but it\'s still a draw-once hand worth improving).',
    subTypes: ['hard', 'soft'],
  },
  adjust: {
    label: '2E. Adjustments',
    desc: 'The narrow exceptions where both mimic and the bust-card rule are wrong: only soft 18 (A,7) vs dealer 9, 10, or A — all three are hit, both rules say stand. The whole category is soft, so no hard/soft sub-tiles.',
    subTypes: [],
  },
  double: {
    label: '2B. Doubles',
    desc: 'Two-card non-pair hands where doubling is optimal: hard 9 vs 3–6, hard 10 vs 2–9, hard 11 vs 2–10, plus soft 13–18 vs the right upcards.',
    subTypes: ['hard', 'soft'],
  },
  split: {
    label: '2C. Splits',
    desc: 'Any pair situation — when to split and when not to. Always split A,A and 8,8; never split 5,5 or 10,10; the rest depends on the upcard.',
    subTypes: ['always', 'mixed'],
  },
  surrender: {
    label: '2D. Surrenders',
    desc: 'Hard 16 vs 9 / 10 / A and hard 15 vs 10 — half-unit refund beats playing the hand.',
    subTypes: [],
  },
};

const TYPE_LABEL = {
  hard: 'Hard',
  soft: 'Soft',
  pair: 'Pair',
  always: 'Always',     // one strategy: A,A & 8,8 always P; 10,10 always S
  mixed: 'Mixed',       // strategy depends on the dealer upcard
};

// Decision frequencies under perfect basic-strategy play. Measured by a
// 50,000-hand Monte Carlo (S17, DAS, late surrender) — re-generate with
// `node tests/measure-frequencies.mjs`. These weight the adj-ev-loss
// column so a mistake in a rare category (e.g. surrender) is scored by
// how often it actually comes up in real games, not how often it shows
// up in your practice / play log.
const CATEGORY_FREQ = {
  mimic:      { total: 0.63755, byType: { hard: 0.56886, soft: 0.06869 } },
  hardTotals: { total: 0.13793, byType: { hard: 0.12822, soft: 0.00971 } },
  adjust:     { total: 0.00637, byType: { hard: 0,       soft: 0.00637 } },
  double:     { total: 0.07394, byType: { hard: 0.06203, soft: 0.01192 } },
  split:      { total: 0.10963, byType: { always: 0.07804, mixed: 0.03158 } },
  surrender:  { total: 0.03459, byType: { hard: 0.03459 } },
};

// Persist expanded category state across re-renders (analytics re-renders
// after every decision; without this the user's expansion would collapse).
const expandedCats = new Set();

const ALL_SUB_TYPES = ['hard', 'soft', 'pair', 'always', 'mixed'];

function readCategory(stats, key) {
  const src = stats?.byCategory?.[key];
  const empty = { total: 0, correct: 0, cost: 0 };
  const byType = {};
  for (const t of ALL_SUB_TYPES) {
    byType[t] = { ...empty, ...(src?.byType?.[t] ?? {}) };
  }
  return {
    total: src?.total ?? 0,
    correct: src?.correct ?? 0,
    cost: src?.cost ?? 0,
    byType,
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

function freqText(freq) {
  if (freq === undefined || freq === null) return '—';
  const pct = freq * 100;
  if (pct < 0.05) return '<0.1%';
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
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

// Per-decision EV loss inside the category (cost / observed total),
// weighted by how often the category really comes up under optimal play:
//   adj = (cost / observed_total) * theoretical_frequency
// Sum across categories ≈ the player's overall ev loss expected in a real
// game given their current per-category proficiency, regardless of how
// the practice deal happened to bias their sample.
function adjText(d, freq) {
  if (d.total === 0) return '—';
  const adj = (d.cost / d.total) * freq;
  if (adj < 0.0005) return '0.000';
  return adj.toFixed(3);
}

function statsHtml(d, freq) {
  return `
    <span class="cat-stats">
      <span class="cat-stat cat-stat-meta"><span class="num">${d.total}</span><span class="lbl">hands</span></span>
      <span class="cat-stat"><span class="num">${pctText(d.correct, d.total)}</span><span class="lbl">acc</span></span>
      <span class="cat-stat"><span class="num">${evText(d.cost, d.total)}</span><span class="lbl">ev loss</span></span>
      <span class="cat-stat"><span class="num">${adjText(d, freq)}</span><span class="lbl">adj</span></span>
    </span>
  `;
}

function freqBadge(freq) {
  return `<span class="cat-freq" title="Theoretical frequency under optimal play">${freqText(freq)}</span>`;
}

function subRowsHtml(byType, types, freqByType) {
  return types.map(t => {
    const d = byType[t];
    const freq = freqByType?.[t] ?? 0;
    return `
      <div class="cat-sub ${tone(d)}">
        <div class="cat-head">
          <span class="cat-name-group">
            <span class="sub-name">${TYPE_LABEL[t]}</span>
            ${freqBadge(freq)}
          </span>
          ${statsHtml(d, freq)}
        </div>
      </div>
    `;
  }).join('');
}

function categoryHtml(key, data) {
  const info = CATEGORY_INFO[key];
  const freqEntry = CATEGORY_FREQ[key];
  const t = tone(data);
  const expandable = info.subTypes.length > 0;
  const isOpen = expanded(key);
  const headInner = `
    <div class="cat-head">
      <span class="cat-name-group">
        <span class="cat-name">${escapeHtml(info.label)}${expandable ? '<span class="chev">▸</span>' : ''}</span>
        ${freqBadge(freqEntry.total)}
      </span>
      ${statsHtml(data, freqEntry.total)}
    </div>
    <div class="cat-desc">${escapeHtml(info.desc)}</div>
  `;
  if (!expandable) {
    return `<div class="cat-row ${t}" data-cat="${key}">${headInner}</div>`;
  }
  return `
    <details class="cat-row ${t}" data-cat="${key}" ${isOpen ? 'open' : ''}>
      <summary>${headInner}</summary>
      <div class="cat-subs">${subRowsHtml(data.byType, info.subTypes, freqEntry.byType)}</div>
    </details>
  `;
}

function expanded(key) {
  return expandedCats.has(key);
}

// sortBy:
//   'adj' (default, used by play) — per-decision cost weighted by theoretical
//          frequency, i.e. what's actually costing the player the most in a
//          real game.
//   'ev'  (used by practice)      — raw per-decision ev loss, so the bucket
//          the player is worst at bubbles to the top regardless of how often
//          it comes up. Better signal for what to drill on.
export function renderAnalytics(root, stats, { sortBy = 'adj' } = {}) {
  const byCats = {};
  for (const c of RULE_CATEGORIES) byCats[c] = readCategory(stats, c);
  const all = overall(byCats);

  // No data → fall back to Learn-page order (the order RULE_CATEGORIES is
  // declared in). With data, sort by ev loss or adj depending on the mode;
  // buckets that still have no data tie at -1 and (thanks to Array.sort
  // being stable since ES2019) keep their Learn order at the bottom.
  const ordered = RULE_CATEGORIES.map(c => ({
    key: c,
    data: byCats[c],
    weight: byCats[c].total === 0
      ? -1
      : sortBy === 'ev'
        ? (byCats[c].cost / byCats[c].total)
        : (byCats[c].cost / byCats[c].total) * CATEGORY_FREQ[c].total,
  })).sort((a, b) => b.weight - a.weight);

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
