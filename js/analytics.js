// Analytics page: pull persisted stats from localStorage, aggregate practice +
// play per rule category, and render a breakdown so the user can see which
// rule they're weakest at.

import { migrateStats } from './stats.js';
import { RULE_CATEGORIES } from './strategy.js';

const STORAGE_KEY = 'blackjack-trainer:v1';

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

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { practice: null, play: null };
    const data = JSON.parse(raw);
    return {
      practice: migrateStats(data.practice ?? null),
      play: migrateStats(data.play ?? null),
    };
  } catch {
    return { practice: null, play: null };
  }
}

function combineByCategory(...statsObjects) {
  const out = {};
  for (const c of RULE_CATEGORIES) out[c] = { total: 0, correct: 0, cost: 0 };
  for (const s of statsObjects) {
    if (!s?.byCategory) continue;
    for (const c of RULE_CATEGORIES) {
      const src = s.byCategory[c];
      if (!src) continue;
      out[c].total += src.total;
      out[c].correct += src.correct;
      out[c].cost += src.cost;
    }
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
function tone(category) {
  const { total, correct, cost } = category;
  if (total < 5) return 'neutral';
  const avgLoss = cost / total;
  const acc = correct / total;
  if (avgLoss < 0.005 && acc >= 0.95) return 'good';
  if (avgLoss > 0.04 || acc < 0.75) return 'bad';
  return 'warn';
}

function render() {
  const { practice, play } = loadStats();
  const byCat = combineByCategory(practice, play);
  const all = overall(byCat);

  const $ = id => document.getElementById(id);

  if (all.total === 0) {
    $('empty').hidden = false;
    $('content').hidden = true;
    return;
  }
  $('empty').hidden = true;
  $('content').hidden = false;

  $('overall-total').textContent = String(all.total);
  $('overall-acc').textContent = pctText(all.correct, all.total);
  $('overall-ev').textContent = evText(all.cost, all.total);

  const sub = (k, l) => {
    const s = k === 'practice' ? practice : play;
    const ov = s ? overall(s.byCategory ?? {}) : { total: 0, correct: 0, cost: 0 };
    $(`${k}-total`).textContent = String(ov.total);
    $(`${k}-acc`).textContent = pctText(ov.correct, ov.total);
    $(`${k}-ev`).textContent = evText(ov.cost, ov.total);
  };
  sub('practice');
  sub('play');

  const tbody = $('cat-rows');
  tbody.innerHTML = '';
  // Rank rows by EV loss desc so the worst category bubbles to the top.
  const rows = RULE_CATEGORIES.map(c => ({
    key: c,
    info: CATEGORY_INFO[c],
    data: byCat[c],
    avgLoss: byCat[c].total === 0 ? -1 : byCat[c].cost / byCat[c].total,
  })).sort((a, b) => b.avgLoss - a.avgLoss);

  for (const { key, info, data } of rows) {
    const row = document.createElement('div');
    row.className = `cat-row ${tone(data)}`;
    row.innerHTML = `
      <div class="cat-head">
        <span class="cat-name">${info.label}</span>
        <span class="cat-stats">
          <span class="cat-stat"><span class="num">${data.total}</span><span class="lbl">hands</span></span>
          <span class="cat-stat"><span class="num">${pctText(data.correct, data.total)}</span><span class="lbl">acc</span></span>
          <span class="cat-stat"><span class="num">${evText(data.cost, data.total)}</span><span class="lbl">ev loss</span></span>
        </span>
      </div>
      <p class="cat-desc">${info.desc}</p>
    `;
    tbody.appendChild(row);
  }
}

render();
