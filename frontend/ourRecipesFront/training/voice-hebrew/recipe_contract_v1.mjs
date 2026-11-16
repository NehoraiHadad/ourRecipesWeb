// Research contract only. This module never mutates production cooking state.
export const statuses = ['pending', 'partial', 'done'];
export const intents = ['report', 'next', 'missed', 'quantity', 'explain', 'clarify'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const keys = (value, allowed) => object(value) && Object.keys(value).every(k => allowed.includes(k));

export function checkRecipe(recipe) {
  if (!object(recipe) || !recipe.id || !recipe.version || !Array.isArray(recipe.actions) || !recipe.actions.length) fail('invalid-recipe');
  const ids = new Set();
  for (const a of recipe.actions) {
    if (!a.id || ids.has(a.id) || !Number.isInteger(a.stepIndex) || a.stepIndex < 0 || typeof a.source !== 'string' || !a.source.trim()) fail('invalid-action');
    ids.add(a.id);
  }
  return ids;
}

export function projectState(recipe, progress, revision = 0, currentStepIndex = 0) {
  const ids = checkRecipe(recipe);
  if (!Number.isInteger(revision) || revision < 0 || !Number.isInteger(currentStepIndex) || currentStepIndex < 0 || currentStepIndex > Math.max(...recipe.actions.map(a => a.stepIndex))) fail('invalid-state-position');
  if (!object(progress) || Object.keys(progress).length !== ids.size || Object.keys(progress).some(id => !ids.has(id)) || [...ids].some(id => !statuses.includes(progress[id]))) fail('invalid-progress');
  const ordered = recipe.actions.map(a => a.id);
  return {
    recipeId: recipe.id, recipeVersion: recipe.version, revision, currentStepIndex,
    progress: { ...progress },
    completedActionIds: ordered.filter(id => progress[id] === 'done'),
    partialActionIds: ordered.filter(id => progress[id] === 'partial'),
    remainingActionIds: ordered.filter(id => progress[id] !== 'done'),
    nextActionId: ordered.find(id => progress[id] !== 'done') ?? null,
  };
}

export function initialState(recipe) {
  return projectState(recipe, Object.fromEntries(recipe.actions.map(a => [a.id, 'pending'])));
}

export function validateProposal(proposal, recipe, state, utterance) {
  const ids = checkRecipe(recipe);
  const stateProjection = projectState(recipe, state.progress, state.revision, state.currentStepIndex);
  if (state.recipeId !== recipe.id || state.recipeVersion !== recipe.version || ['completedActionIds','partialActionIds','remainingActionIds','nextActionId'].some(k => JSON.stringify(state[k]) !== JSON.stringify(stateProjection[k]))) fail('invalid-state');
  if (!keys(proposal, ['contractVersion','recipeId','recipeVersion','expectedRevision','intents','facts','clarifications']) || proposal.contractVersion !== 1 || proposal.recipeId !== recipe.id || proposal.recipeVersion !== recipe.version || proposal.expectedRevision !== state.revision) fail('stale-or-invalid-envelope');
  if (!Array.isArray(proposal.intents) || !proposal.intents.length || proposal.intents.some(i => !intents.includes(i)) || new Set(proposal.intents).size !== proposal.intents.length) fail('invalid-intents');
  if (!Array.isArray(proposal.facts) || !Array.isArray(proposal.clarifications) || proposal.facts.length > ids.size || proposal.clarifications.length > ids.size + 1) fail('invalid-facts');
  if (proposal.facts.length && !proposal.intents.includes('report')) fail('facts-without-report');
  const seen = new Set();
  for (const fact of proposal.facts) {
    if (!keys(fact, ['actionId','status','evidence']) || !ids.has(fact.actionId) || seen.has(fact.actionId) || !statuses.includes(fact.status)) fail('unknown-duplicate-or-invalid-fact');
    const e = fact.evidence;
    // UTF-16 offsets, matching JS slice; exact quote is necessary, not semantic proof.
    if (!keys(e, ['start','end','quote']) || !Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end <= e.start || e.end > utterance.length || typeof e.quote !== 'string' || !e.quote.trim() || utterance.slice(e.start,e.end) !== e.quote) fail('invalid-evidence');
    seen.add(fact.actionId);
  }
  const clarifying = new Set();
  for (const c of proposal.clarifications) {
    if (!keys(c, ['actionId','question']) || !(c.actionId === null || ids.has(c.actionId)) || seen.has(c.actionId) || clarifying.has(c.actionId) || typeof c.question !== 'string' || !c.question.trim()) fail('invalid-clarification');
    clarifying.add(c.actionId);
  }
  if (proposal.clarifications.length && !proposal.intents.includes('clarify')) fail('clarification-intent-required');
  return structuredClone(proposal);
}

export function previewProposal(proposal, recipe, state, utterance) {
  const validated = validateProposal(proposal, recipe, state, utterance);
  const progress = { ...state.progress };
  for (const fact of validated.facts) progress[fact.actionId] = fact.status;
  const changed = Object.keys(progress).some(id => progress[id] !== state.progress[id]);
  return {
    proposedState: projectState(recipe, progress, state.revision + Number(changed), state.currentStepIndex),
    requiresUserConfirmation: true, semanticTruthVerified: false, applicationStateCommitted: false,
  };
}
