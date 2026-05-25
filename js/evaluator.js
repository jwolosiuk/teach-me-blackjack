import { getOptimalAction, isPair } from './strategy.js';

// Set of legal actions for the player. Used by the UI to enable/disable buttons.
export function legalActions(hand, rules = {}) {
  const canAct = hand.length === 2;
  const lateSurrender = rules.lateSurrender !== false;
  const actions = ['H', 'S'];
  if (canAct) {
    actions.push('D');
    if (lateSurrender) actions.push('R');
    if (isPair(hand)) actions.push('P');
  }
  return actions;
}

// Unified contract for V1 and V3:
//   { chosen, optimal, ev: {action: number}, chosenEv, optimalEv, cost, correct }
// V1 (here) uses binary EV — optimal action scores 1, the rest 0. cost is 0 or 1.
// V3 will plug a solver that fills `ev` with real per-action EV in bet-units; the
// same aggregation (sum cost, sum optimalEv) yields % accuracy in V1 and %
// EV-efficiency in V3 without changing any caller code.
export function evaluateAction({ hand, upcard, action, rules }) {
  const optimal = getOptimalAction(hand, upcard, rules);
  const ev = {};
  for (const a of legalActions(hand, rules)) {
    ev[a] = a === optimal ? 1 : 0;
  }
  const chosenEv = ev[action] ?? 0;
  const optimalEv = Math.max(...Object.values(ev));
  const cost = optimalEv - chosenEv;
  return {
    chosen: action,
    optimal,
    ev,
    chosenEv,
    optimalEv,
    cost,
    correct: cost === 0,
  };
}
