// One bounded follow-up: replace machine JSON context with compact Hebrew.
// Questions, option meanings, gold cases and model settings stay unchanged.
const progressText={pending:'טרם סומנה כהושלמה',partial:'סומנה כבוצעה חלקית',done:'סומנה כהושלמה'};
export function compactContextFor(item){
 const lines=['המתכון הנוכחי והיחיד בשיחה:'];
 for(const [i,a] of item.recipe.actions.entries())lines.push(`${i+1}. (${a.id}) ${a.source}`);
 lines.push(`מיקום נוכחי: שלב ${item.state.currentStepIndex+1}.`,'הרישום לפני ההודעה הנוכחית:');
 for(const [i,a] of item.recipe.actions.entries())lines.push(`פעולה ${i+1} (${a.id}): ${progressText[item.state.progress[a.id]]}.`);
 if(item.history.length){lines.push('היסטוריה בתוך אותו מתכון:');for(const h of item.history)lines.push(`${h.role==='assistant'?'עוזר':'משתמש'}: ${h.content}`);}
 lines.push('ההודעה הנוכחית של המשתמש:',item.text);
 return lines.join('\n');
}
