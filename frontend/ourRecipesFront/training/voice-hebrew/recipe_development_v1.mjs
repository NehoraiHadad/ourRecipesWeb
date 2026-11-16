// Authored synthetic development cases, not independent held-out evaluation.
// Two recurring recipes intentionally expose contract failures cheaply.
import {initialState,projectState} from './recipe_contract_v1.mjs';
export const bread={id:'bread-dev-v1',version:'source-1',actions:[
 {id:'flour',stepIndex:0,source:'להוסיף 200 גרם קמח לקערה.'},
 {id:'water',stepIndex:0,source:'להוסיף 120 מ״ל מים.'},
 {id:'mix',stepIndex:1,source:'לערבב את הקמח והמים לבצק.'},
 {id:'cook',stepIndex:2,source:'לבשל את הבצק במחבת.'},
]};
export const salad={id:'salad-dev-v1',version:'source-1',actions:[
 {id:'cut',stepIndex:0,source:'לחתוך מלפפון.'},
 {id:'lemon',stepIndex:1,source:'להוסיף מיץ לימון. הכמות אינה מצוינת.'},
 {id:'toss',stepIndex:2,source:'לערבב את הסלט.'},
]};
export const cases=[];
function add(family,text,facts=[],options={}){
 const recipe=options.recipe??bread;
 const state=projectState(recipe,{...initialState(recipe).progress,...options.progress},options.revision??0,options.currentStepIndex??0);
 const changes=facts.map(([actionId,status,quote])=>{
  const start=text.indexOf(quote);if(start<0)throw Error('Missing quote: '+quote);
  return {actionId,status,evidence:{start,end:start+quote.length,quote}};
 });
 const clarifications=(options.clarify??[]).map(actionId=>({actionId,question:options.question??'מה בדיוק בוצע בפעולה הזו?'}));
 cases.push({id:`${family}-${cases.filter(c=>c.family===family).length+1}`,family,text,recipe,state,history:options.history??[],expectedProposal:{contractVersion:1,recipeId:recipe.id,recipeVersion:recipe.version,expectedRevision:state.revision,intents:options.intents??(changes.length?['report']:clarifications.length?['clarify']:['next']),facts:changes,clarifications},replyRubric:options.replyRubric??'להשיב בקצרה בעברית לפי המתכון והמצב המעודכן בלבד.'});
}

for(const [text,id,quote] of [
 ['שמתי קמח בקערה','flour','שמתי קמח'],['הוספתי את הקמח','flour','הוספתי את הקמח'],
 ['הקמח כבר בפנים','flour','הקמח כבר בפנים'],['סיימתי להוסיף קמח','flour','סיימתי להוסיף קמח'],
 ['הוספתי מים','water','הוספתי מים'],['המים כבר בקערה','water','המים כבר בקערה'],
 ['כבר ערבבתי את הבצק','mix','כבר ערבבתי את הבצק'],['סיימתי לבשל במחבת','cook','סיימתי לבשל במחבת'],
])add('clear',text,[[id,'done',quote]]);

for(const [text,id] of [
 ['עוד לא שמתי קמח','flour'],['לא הוספתי קמח','flour'],['טרם הוספתי מים','water'],['את המים עדיין לא הוספתי','water'],
 ['לא ערבבתי עדיין','mix'],['עוד לא התחלתי לערבב','mix'],['לא בישלתי במחבת','cook'],['את הבישול עוד לא התחלתי','cook'],
])add('negation',text,[[id,'pending',text]]);

for(const [text,facts] of [
 ['הוספתי מים אבל עוד לא ערבבתי',[['water','done','הוספתי מים'],['mix','pending','עוד לא ערבבתי']]],
 ['שמתי קמח ומים',[['flour','done','שמתי קמח ומים'],['water','done','שמתי קמח ומים']]],
 ['לא שמתי מים, רק קמח',[['water','pending','לא שמתי מים'],['flour','done','רק קמח']]],
 ['ערבבתי, אבל לבשל עוד לא התחלתי',[['mix','done','ערבבתי'],['cook','pending','לבשל עוד לא התחלתי']]],
 ['הקמח בפנים והמים בחוץ, עוד לא הוספתי אותם',[['flour','done','הקמח בפנים'],['water','pending','המים בחוץ, עוד לא הוספתי אותם']]],
 ['הוספתי את הקמח ורק חלק מהמים',[['flour','done','הוספתי את הקמח'],['water','partial','רק חלק מהמים']]],
 ['סיימתי לערבב וגם לבשל במחבת',[['mix','done','סיימתי לערבב וגם לבשל במחבת'],['cook','done','סיימתי לערבב וגם לבשל במחבת']]],
 ['את המים הוספתי, את הקמח לא',[['water','done','את המים הוספתי'],['flour','pending','את הקמח לא']]],
])add('multiple',text,facts);

for(const [text,id] of [
 ['הוספתי רק חלק מהמים','water'],['שמתי מעט מים, נשאר עוד להוסיף','water'],
 ['התחלתי לשפוך מים ועצרתי לפני שסיימתי','water'],['שמתי חלק מהקמח','flour'],
 ['התחלתי להוסיף קמח, עוד לא את כולו','flour'],['ערבבתי קצת אבל עוד לא סיימתי','mix'],
 ['התחלתי לבשל במחבת, הבישול עוד לא נגמר','cook'],['חלק מהמים בפנים והשאר עדיין בכוס','water'],
])add('partial',text,[[id,'partial',text]],{replyRubric:'להכיר בביצוע חלקי; לא לסמן השלמה או להמציא כמה נשאר. לברר כמות כשנחוצה להמשך.'});

for(const [text,id,status,quote,previous] of [
 ['תיקון, בעצם לא שמתי קמח','flour','pending','לא שמתי קמח','done'],
 ['אמרתי שהוספתי מים, טעיתי, עוד לא הוספתי אותם','water','pending','עוד לא הוספתי אותם','done'],
 ['רגע, הקמח דווקא כן בפנים','flour','done','הקמח דווקא כן בפנים','pending'],
 ['עדכון: כן ערבבתי בסוף','mix','done','כן ערבבתי בסוף','pending'],
 ['לא נכון שסיימתי עם המים, הוספתי רק חלק','water','partial','הוספתי רק חלק','done'],
 ['בעצם הבישול לא הושלם, רק התחלתי','cook','partial','הבישול לא הושלם, רק התחלתי','done'],
 ['תיקון למה שאמרתי: כבר הוספתי את כל המים','water','done','כבר הוספתי את כל המים','partial'],
 ['חוזר בי, עוד לא התחלתי לערבב','mix','pending','עוד לא התחלתי לערבב','done'],
])add('correction',text,[[id,status,quote]],{progress:{[id]:previous},revision:3,history:[{role:'assistant',content:`המצב הקודם של ${id}: ${previous}`} ]});

for(const text of ['נראה לי שהוספתי מים','אולי כבר שמתי מים','אני לא בטוח אם הוספתי מים','נדמה לי שהמים בפנים','יכול להיות שהוספתי את המים','אני חושב ששפכתי מים אבל לא זוכר','כנראה שהוספתי מים, לא בטוח','יכול להיות שרק התכוונתי להוסיף מים'])add('uncertainty',text,[],{clarify:['water'],replyRubric:'לברר אם המים נוספו; לא לשנות את התקדמות המים.'});

for(const [text,quote] of [
 ['אולי הכף בכיור, אבל שמתי קמח','שמתי קמח'],['אני לא בטוח איפה המגבת; קמח כבר הוספתי','קמח כבר הוספתי'],
 ['יכול להיות שקר בחוץ, הקמח בפנים','הקמח בפנים'],['נראה לי שהטלפון מצלצל, אבל סיימתי להוסיף קמח','סיימתי להוסיף קמח'],
 ['הקערה אולי קטנה, בכל מקרה הוספתי את הקמח','הוספתי את הקמח'],['לא זוכר איפה האריזה, את הקמח שמתי','את הקמח שמתי'],
 ['אולי נגמר הסבון; הקמח כבר בקערה','הקמח כבר בקערה'],['אני חושב שהשעה מאוחרת, שמתי קמח','שמתי קמח'],
])add('unrelated-doubt',text,[['flour','done',quote]]);

for(const [text,facts,options] of [
 ['עשיתי את זה',[['water','done','עשיתי את זה']],{history:[{role:'assistant',content:'לפי המתכון, עכשיו הוסף את המים.'}]}],
 ['אותם עדיין לא הוספתי',[['water','pending','אותם עדיין לא הוספתי']],{history:[{role:'assistant',content:'האם הוספת את המים?'}]}],
 ['הוספתי גם אותם',[['water','done','הוספתי גם אותם']],{history:[{role:'assistant',content:'עכשיו נותר להוסיף את המים.'}]}],
 ['סיימתי עם הפעולה הזאת',[['mix','done','סיימתי עם הפעולה הזאת']],{history:[{role:'assistant',content:'כעת ערבב את הבצק.'}]}],
 ['עשיתי את זה',[],{clarify:[null]}],
 ['כבר הוספתי אותם',[],{history:[{role:'assistant',content:'יש להוסיף קמח ומים. על איזה מהם אתה מדבר?'}],clarify:[null]}],
 ['חלק ממנו בפנים',[['flour','partial','חלק ממנו בפנים']],{history:[{role:'assistant',content:'האם הוספת את הקמח?'}]}],
 ['לא, בעצם עוד לא',[['mix','pending','לא, בעצם עוד לא']],{history:[{role:'assistant',content:'סימנתי שהערבוב הושלם. נכון?'}],progress:{mix:'done'}}],
])add('reference',text,facts,options);

for(const [text,intent,rubric] of [
 ['מה עכשיו?','next','להציע קמח לפי המצב ההתחלתי, ללא שינוי מצב.'],
 ['על איזה שלב דילגתי?','missed','לציין פעולות קודמות שלא סומנו, לפי מיקום הניווט.'],
 ['כמה מים כתוב להוסיף?','quantity','120 מ״ל, לפי המקור; לא להסיק ביצוע.'],
 ['כמה שמן להוסיף?','quantity','שמן וכמותו אינם במתכון; לא להמציא כמות.'],
 ['לערבב לפני המים או אחרי?','explain','להסביר שמוסיפים מים לפני הערבוב.'],
 ['מה השלב שאחרי הערבוב?','explain','הפעולה הבאה במקור היא בישול במחבת.'],
 ['האם צריך לחמם תנור?','explain','המקור מתאר מחבת ולא הוראת תנור; לא להמציא.'],
 ['כמה קמח לפי המתכון?','quantity','200 גרם לפי המתכון, ללא דיווח ביצוע.'],
])add('recipe-question',text,[],{intents:[intent],currentStepIndex:text.includes('דילגתי')?1:0,replyRubric:rubric});

for(const [text,facts,options] of [
 ['עברתי לסלט, מה קודם?',[],{intents:['next']}],
 ['במתכון הקודם שמתי קמח, מה עכשיו בסלט?',[],{intents:['next']}],
 ['חתכתי את המלפפון',[['cut','done','חתכתי את המלפפון']],{}],
 ['הוספתי לימון אבל עוד לא ערבבתי',[['lemon','done','הוספתי לימון'],['toss','pending','עוד לא ערבבתי']],{}],
 ['כמה מיץ לימון להוסיף?',[],{intents:['quantity'],replyRubric:'לומר שכמות הלימון אינה מצוינת במקור.'}],
 ['נראה לי שכבר חתכתי',[],{clarify:['cut']}],
 ['תיקון, עוד לא חתכתי מלפפון',[['cut','pending','עוד לא חתכתי מלפפון']],{progress:{cut:'done'},revision:2}],
 ['את הסלט ערבבתי רק חלקית',[['toss','partial','את הסלט ערבבתי רק חלקית']],{}],
])add('recipe-switch',text,facts,{recipe:salad,history:[{role:'user',content:'במתכון הקודם הוספתי קמח ומים וסיימתי לבשל במחבת.'}],...options});

export const manifest={version:'recipe-development-v1',authoredSynthetic:true,humanReviewed:false,trainingPerformed:false,modelInferencePerformed:false,heldOut:false,recipeCount:2,caseCount:cases.length,families:Object.fromEntries([...new Set(cases.map(c=>c.family))].map(f=>[f,cases.filter(c=>c.family===f).length])),limits:'Reusable development probes with assistant-authored labels; not independent generalization evidence. Lifecycle/browser support is tested separately, not a text-model intent.'};
