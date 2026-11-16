import {cases as controls} from './tiny_recipe_controls.mjs';
import {cases,prompt,schema} from './tiny_recipe_cases.mjs';
export const modelPath='/tmp/voice-models/llm/Qwen3-0.6B-Q4_K_M.gguf';
export const llamaCommit='7d7f0287530bc8981690f361d8c1627dbae1c99a';
export const settings={n_ctx:1536,n_batch:128,n_ubatch:64,n_threads:4,n_gpu_layers:0,n_parallel:1,jinja:true,reasoning:false,default_template_kwargs:{enable_thinking:false},warmup:true,ctx_shift:false,flash_attn:false,seed:42};
const base={temperature:0,seed:42,chat_template_kwargs:{enable_thinking:false},cache_prompt:false,stream:false,logprobs:true,top_logprobs:5,verbose:true,return_tokens:true};
export const jobs=[
 ...controls.map(item=>({id:item.id,kind:'control',messages:item.messages,max_tokens:80})),
 ...cases.map(item=>({id:item.id,kind:'structured',messages:prompt(item,'structured'),max_tokens:160,response_format:{type:'json_schema',json_schema:{name:'recipe_response',strict:true,schema:schema(item.recipe)}}})),
].map(({id,kind,...body})=>({id,kind,body:{...base,...body}}));
