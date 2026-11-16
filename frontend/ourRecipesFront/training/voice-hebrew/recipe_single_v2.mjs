// User-directed scope: one recipe per context. Preserve the frozen v1 stress set.
import {cases as previous} from './recipe_development_v1.mjs';
export const robustnessCases = structuredClone(previous.filter(c => c.family === 'recipe-switch'));
export const cases = previous.map(original => {
  const c=structuredClone(original);c.originCaseId=original.id;
  if(c.family==='recipe-switch'){
    c.family='single-recipe-salad';c.id=c.id.replace('recipe-switch','single-recipe-salad');c.history=[];
    if(c.originCaseId==='recipe-switch-1')c.text='מה עושים קודם בסלט המלפפון?';
    if(c.originCaseId==='recipe-switch-2')c.text='מה השלב הבא בסלט המלפפון?';
  }
  return c;
});
export const manifest={version:'recipe-single-v2',authoredSynthetic:true,humanReviewed:false,heldOut:false,caseCount:cases.length,recipeCount:2,contextPolicy:'Current recipe, explicit state, same-recipe history only; no cross-case conversation accumulation. Weights may stay loaded.',robustnessCaseCount:robustnessCases.length,robustnessInPrimaryScore:false,limits:'72 original development probes plus8 clean-context salad variants. This is a changed protocol, not a causal improvement over the older mixed-history benchmark.'};
