import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cases,manifest} from './recipe_single_v2.mjs';
import {score} from './decision_protocol_v2.mjs';
const median=xs=>{const s=[...xs].sort((a,b)=>a-b),n=s.length;return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):null;};
export function summarize(result){
 const seen=new Set();
 const rows=result.rows.map(row=>{
  const item=cases.find(c=>c.id===row.id);if(!item||seen.has(row.id))throw Error('Unknown or duplicate case');seen.add(row.id);
  let evaluation;
  try{evaluation={valid:true,...score(item,row.interpretation)};}catch(error){evaluation={valid:false,error:String(error),stateCorrect:false,factsExact:false,clarificationsExact:false,intentCorrect:false,interpretationExact:false};}
  evaluation.requiresChange=item.expectedProposal.facts.some(f=>item.state.progress[f.actionId]!==f.status);
  return {id:row.id,family:item.family,interpretation:row.interpretation,expectedFacts:item.expectedProposal.facts.map(f=>({actionId:f.actionId,status:f.status})),expectedIntents:item.expectedProposal.intents,expectedClarifications:item.expectedProposal.clarifications.map(c=>c.actionId),ms:row.ms,evaluation};
 });
 if(result.completed&&rows.length!==cases.length)throw Error('Incomplete result marked complete');
 const total=group=>({cases:group.length,valid:group.filter(r=>r.evaluation.valid).length,invalidOutputs:group.filter(r=>!r.evaluation.valid).length,stateCorrect:group.filter(r=>r.evaluation.stateCorrect).length,factsExact:group.filter(r=>r.evaluation.factsExact).length,intentCorrect:group.filter(r=>r.evaluation.intentCorrect).length,clarificationsExact:group.filter(r=>r.evaluation.clarificationsExact).length,interpretationExact:group.filter(r=>r.evaluation.interpretationExact).length,casesWithWrongState:group.filter(r=>r.evaluation.valid&&r.evaluation.wrongStateActions.length).length,casesWithUnexpectedFacts:group.filter(r=>r.evaluation.valid&&r.evaluation.wrongFactProposals.length).length,medianMs:median(group.map(r=>r.ms)),maxMs:group.length?Math.max(...group.map(r=>r.ms)):null});
 const byFamily=Object.fromEntries([...new Set(rows.map(r=>r.family))].map(f=>[f,total(rows.filter(r=>r.family===f))]));
 const changes=rows.filter(r=>r.evaluation.requiresChange),readonly=rows.filter(r=>!r.evaluation.requiresChange);
 return {arm:result.arm,studyId:result.plan.study,contextRepresentation:result.plan.data_file.includes('compact')?'compact-hebrew':'detailed-json',completed:result.completed,recordedRows:rows.length,plannedPrimaryCases:cases.length,remainingCases:cases.filter(c=>!seen.has(c.id)).map(c=>c.id),metrics:total(rows),requiredChangeMetrics:total(changes),readonlyMetrics:total(readonly),byFamily,loadMs:result.load_ms,controls:result.controls,memory:{selfPeakRssKiB:result.cpu_peak_self_rss_kib,childrenPeakRssKiB:result.cpu_peak_children_rss_kib,scope:result.memory_scope},error:result.error,rows};
}
if(process.argv[1]?.endsWith('single_recipe_report.mjs')){
 const inputs=process.argv.slice(2);if(!inputs.length)throw Error('Supply result paths');
 const arms=[];for(const file of inputs){const data=await readFile(file);arms.push({inputFile:file,inputSha256:createHash('sha256').update(data).digest('hex'),...summarize(JSON.parse(data))});}
 const report={manifest,arms,limits:['Authored synthetic development, two recipes; no human label review or held-test score.','Different pipelines and input/output formats: Nativ392 questions in80 batched forwards; Qwen80 joint JSON generations.','Current recipe only. Same-recipe history retained; previous-recipe stress probes were not inferred.','Measures interpretation, not conversational generation, browser export, voice or physical-phone performance.','Native results cannot establish browser accuracy; further validation after export/quantization is required.','No threshold fitting, training or prompt selection was performed in this frozen run.']};
 await writeFile('verification/single-recipe-results-20261116.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(arms.map(({arm,contextRepresentation,completed,recordedRows,metrics,requiredChangeMetrics,readonlyMetrics,byFamily})=>({arm,contextRepresentation,completed,recordedRows,metrics,requiredChangeMetrics,readonlyMetrics,byFamily})),null,2));
}
