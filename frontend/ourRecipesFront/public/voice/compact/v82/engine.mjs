import * as ort from './ort.wasm.min.mjs';
import {Tokenizer} from './tokenizers.min.mjs';
import {classifyWithinWindow as classifyScoped} from './context_window_v64.mjs';
import {loadPyodide} from './python/pyodide.mjs';

async function localFile(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error('טעינת הקובץ נכשלה: ' + path);
  return response;
}

export async function loadEngine() {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = new URL('./', import.meta.url).href;
  const [definition, config, lexicon, python, policy, session] = await Promise.all([
    localFile('tokenizer.json').then(r=>r.json()), localFile('tokenizer_config.json').then(r=>r.json()),
    localFile('lexicon.json').then(r=>r.json()), loadPyodide({indexURL:new URL('./python/',import.meta.url).href}),
    localFile('policy.zip').then(r=>r.arrayBuffer()),
    ort.InferenceSession.create(new URL('./action-encoder.onnx',import.meta.url).href,{executionProviders:['wasm']})
  ]);
  definition.pre_tokenizer = null;
  const tokenizer = new Tokenizer(definition,config);
  python.unpackArchive(policy,'zip');
  const process = python.runPython('from substitution_questions_v82 import process\nprocess');
  return async (id,input) => {
    const start = performance.now();
    const {proposal,modelCalls} = await classifyScoped(input,tokenizer,ort,session,lexicon);
    const raw = JSON.stringify(proposal);
    const result = JSON.parse(process(JSON.stringify({id,input}),raw));
    return {...result, proposal_text:raw, modelCalls, ms:performance.now()-start};
  };
}
