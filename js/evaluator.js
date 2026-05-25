import { isPair } from './strategy.js';
import { solveActions } from './solver.js';

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

const EPSILON = 1e-9;

// V3 contract — same shape as V1, real per-action EVs (in bet units) come
// from solver.js. `optimal` is the action with the highest EV; `cost` is
// the EV the player gives up by not picking it. `correct` is true when
// the chosen action is within float-noise of optimal so picking an action
// that ties for first still counts as correct.
export function evaluateAction({ hand, upcard, action, rules }) {
  const ev = solveActions(hand, upcard, rules);
  const actionsAvail = Object.keys(ev);
  let optimal = actionsAvail[0];
  for (const a of actionsAvail) {
    if (ev[a] > ev[optimal]) optimal = a;
  }
  const chosenEv = ev[action] ?? -Infinity;
  const optimalEv = ev[optimal];
  const cost = optimalEv - chosenEv;
  return {
    chosen: action,
    optimal,
    ev,
    chosenEv,
    optimalEv,
    cost,
    correct: cost < EPSILON,
  };
}
