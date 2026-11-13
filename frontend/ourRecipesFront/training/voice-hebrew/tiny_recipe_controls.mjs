// Predeclared follow-up diagnostics after V19 0.8B failed; not held evaluation.
export {schema,evaluateStructure} from './tiny_recipe_cases.mjs';
export const modes=['chat'];
export const cases=[
 {id:'english-instruction',text:'Repeat exactly: OK',expectedUpdates:[],replyRubric:'Return exactly OK;checks basic instruction following.',messages:[{role:'system',content:'Follow the instruction. Answer briefly.'},{role:'user',content:'Repeat exactly: OK'}]},
 {id:'hebrew-instruction',text:'החזר בדיוק: שלום',expectedUpdates:[],replyRubric:'Return exactly שלום;checks basic Hebrew copying/instruction following.',messages:[{role:'system',content:'Follow the instruction. Answer briefly.'},{role:'user',content:'החזר בדיוק: שלום'}]},
 {id:'english-recipe',text:'I added the flour. What do I add next?',expectedUpdates:[],replyRubric:'Say add water next;not mixing or more flour.',messages:[{role:'system',content:'Answer only from the recipe in one short sentence.'},{role:'user',content:'Recipe: add flour, then add water, then mix. I added the flour. What do I add next?'}]},
 {id:'hebrew-recipe',text:'הוספתי קמח. מה להוסיף עכשיו?',expectedUpdates:[],replyRubric:'Say add water next;not mixing or more flour.',messages:[{role:'system',content:'Answer only from the recipe in one short sentence.'},{role:'user',content:'המתכון: מוסיפים קמח, אחר כך מוסיפים מים, ולבסוף מערבבים. הוספתי קמח. מה להוסיף עכשיו?'}]}
];
export const prompt=item=>item.messages;
