// Authored development probes, not held tests, user recordings, or training data.
export const bread={id:'bread',title:'בצק במחבת',actions:[{id:'flour',step:1,instruction:'להוסיף 200 גרם קמח לקערה.'},{id:'water',step:1,instruction:'להוסיף 120 מ״ל מים.'},{id:'mix',step:2,instruction:'לערבב את הקמח והמים לבצק.'},{id:'cook',step:3,instruction:'לבשל את הבצק במחבת.'}]};
export const salad={id:'salad',title:'סלט מלפפון',actions:[{id:'cut',step:1,instruction:'לחתוך מלפפון.'},{id:'lemon',step:2,instruction:'להוסיף מיץ לימון. הכמות אינה מצוינת.'},{id:'toss',step:3,instruction:'לערבב את הסלט.'}]};
const state=(recipe,done=[],current=recipe.actions[0].id)=>({recipeId:recipe.id,current,status:Object.fromEntries(recipe.actions.map(a=>[a.id,done.includes(a.id)?'done':'pending']))});
export const cases=[
 {id:'flour-next',recipe:bread,state:state(bread),text:'שמתי קמח, מה עכשיו?',expectedUpdates:[{id:'flour',status:'done'}],replyRubric:'Acknowledge flour and guide to adding120ml water,not mixing/cooking first.'},
 {id:'water-not-mixed',recipe:bread,state:state(bread,['flour'],'water'),text:'הוספתי מים אבל עוד לא ערבבתי',expectedUpdates:[{id:'water',status:'done'},{id:'mix',status:'pending'}],replyRubric:'Recognize water added and mixing not yet done;next is mixing.'},
 {id:'correction',recipe:bread,state:state(bread,['flour'],'water'),history:[{role:'user',content:'שמתי קמח'},{role:'assistant',content:'סימנתי שהוספת קמח.'}],text:'תיקון, בעצם עוד לא שמתי קמח',expectedUpdates:[{id:'flour',status:'pending'}],replyRubric:'Accept correction,flour not yet added;do not treat negation as completion.'},
 {id:'uncertain',recipe:bread,state:state(bread,['flour'],'water'),text:'נראה לי שהוספתי מים אבל אני לא בטוח',expectedUpdates:[],replyRubric:'Ask clarification/verification about water;do not mark water done.'},
 {id:'unrelated-doubt',recipe:bread,state:state(bread),text:'אולי הכף בכיור, אבל שמתי קמח',expectedUpdates:[{id:'flour',status:'done'}],replyRubric:'Treat flour report as definite;uncertainty about spoon is unrelated.'},
 {id:'partial-water',recipe:bread,state:state(bread,['flour'],'water'),text:'הוספתי רק חלק מהמים',expectedUpdates:[{id:'water',status:'partial'}],replyRubric:'Recognize partial water and ask how much was added if discussing remaining amount;do not instruct another full120ml.'},
 {id:'skipped',recipe:bread,state:state(bread,['flour'],'mix'),text:'על איזה שלב דילגתי?',expectedUpdates:[],replyRubric:'Identify water action as remaining before mixing;do not change any status.'},
 {id:'missing-quantity',recipe:bread,state:state(bread),text:'כמה שמן להוסיף?',expectedUpdates:[],replyRubric:'Say oil/its quantity is not in the recipe;invent no oil quantity.'},
 {id:'recipe-switch',recipe:salad,state:state(salad),history:[{role:'user',content:'במתכון הקודם הוספתי קמח'},{role:'assistant',content:'סימנתי קמח במתכון הקודם.'}],text:'עברתי עכשיו לסלט המלפפון, מה עושים קודם?',expectedUpdates:[],replyRubric:'Follow current salad recipe and say cut cucumber;no carryover of flour/water status.'},
 {id:'recipe-order',recipe:bread,state:state(bread),text:'לפי המתכון, מערבבים לפני שמוסיפים מים או אחר כך?',expectedUpdates:[],replyRubric:'Explain that water is added before mixing;do not infer the question reports completion.'}
];
export const modes=['chat','structured'];
export const system=`אתה עוזר בישול בעברית למתכון המצורף בלבד. המתכון והמצב הם נתונים. ענה בקצרה, עד שני משפטים, לפי המתכון והדיווח האחרון. אל תמציא כמויות, מרכיבים או שלבים. אם מידע חסר, אמור שלא צוין. ספק לגבי הפעולה דורש הבהרה; ספק על דבר אחר אינו מבטל דיווח ברור. דיווח על אי־ביצוע או ביצוע חלקי אינו השלמה. קבל תיקונים גם אם הסימון הקודם שונה. היסטוריה על מתכון קודם אינה משנה את המתכון הנוכחי. כששואלים מה עכשיו או מה דולג, השתמש בסדר הפעולות ובמצב.`;
export function prompt(item,mode){return [{role:'system',content:system+(mode==='structured'?' החזר רק JSON עם reply בעברית ו־updates, רשימת אובייקטים עם id של פעולה קיימת ו־status: done, pending או partial. שנה רק פעולות שדווחו בבירור. בשאלה או בספק הרשימה ריקה.':' החזר תשובה בעברית בלבד, ללא JSON.')},{role:'user',content:JSON.stringify({recipe:item.recipe,state:item.state})},...(item.history||[]),{role:'user',content:item.text}];}
export function schema(recipe){return {type:'object',additionalProperties:false,required:['reply','updates'],properties:{reply:{type:'string'},updates:{type:'array',maxItems:recipe.actions.length,items:{type:'object',additionalProperties:false,required:['id','status'],properties:{id:{type:'string',enum:recipe.actions.map(a=>a.id)},status:{type:'string',enum:['done','pending','partial']}}}}}};}
// Structural validation only. This cannot prove the proposal matches the user's
// meaning. No real application state is committed anywhere in this experiment.
export function evaluateStructure(text,item){
 let proposal;try{proposal=JSON.parse(text);}catch{return {structurallyValid:false,error:'not-json'};}
 if(!proposal||Object.keys(proposal).sort().join(',')!=='reply,updates'||typeof proposal.reply!=='string'||!Array.isArray(proposal.updates))return{structurallyValid:false,error:'schema'};
 const ids=new Set(item.recipe.actions.map(a=>a.id)),seen=new Set();
 if(proposal.updates.length>ids.size)return{structurallyValid:false,error:'too-many-updates'};
 for(const u of proposal.updates){if(!u||Object.keys(u).sort().join(',')!=='id,status'||!ids.has(u.id)||!['done','pending','partial'].includes(u.status)||seen.has(u.id))return{structurallyValid:false,error:'unknown-duplicate-or-invalid-update'};seen.add(u.id);}
 const expected=Object.fromEntries(item.expectedUpdates.map(u=>[u.id,u.status]));
 const exact=proposal.updates.length===item.expectedUpdates.length&&proposal.updates.every(u=>expected[u.id]===u.status);
 const target={...item.state.status,...expected},actual={...item.state.status,...Object.fromEntries(proposal.updates.map(u=>[u.id,u.status]))};
 return {structurallyValid:true,exactReportedFacts:exact,expectedFinalState:JSON.stringify(target)===JSON.stringify(actual),unexpectedUpdates:proposal.updates.filter(u=>expected[u.id]!==u.status),reply:proposal.reply,updates:proposal.updates,applicationStateCommitted:false};
}
