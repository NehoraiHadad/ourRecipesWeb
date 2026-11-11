# Hebrew cooking voice proof of concept

Updated 2026-11-10. The working prototype is at `/voice-lab`, on branch `codex/hebrew-cooking-voice-poc`. It is deliberately separate from the production recipe page. The initial checkout was clean and contained no `RecipeVoiceGuide`, `useRecipeVoice` or `voiceCommands`; no applicable AGENTS.md was found.

**Result:** actual Hebrew Zipformer transcription, local Hebrew Pocket speech and browser LLM inference now run. The code owns and validates cooking progress. **No evaluated LLM has passed the Hebrew accuracy and latency gate.** Qwen3.5 2B is the default *comparison candidate in the lab*, not a final production selection. Straightforward next/missed questions work through code before invoking a model. No user audio/text is sent to an external provider.

## Run and reproduce

From `frontend/ourRecipesFront`, with Node 24:

```sh
npm ci
npm run dev                          # existing port 80 default
# Or: npm run voice:prepare && npx next dev -p 3000
# Visit /voice-lab; weights download only after an explicit click.
npm run test:run -- tests/unit/lib/voice
npm run voice:smoke                   # expects localhost:3000
```

Actual pinned-weight benchmarks use an explicit, separate fixture download. Defaults are **1,552,431,079 bytes** for ASR + Qwen3.5 2B + Pocket; runtime assets are additional. Fixtures live under `/tmp`, not in Git.

```sh
npm run voice:fetch-models
VOICE_MODEL_DIR=/tmp/voice-models npm run voice:benchmark
VOICE_BENCH_KINDS=tts npm run voice:benchmark
VOICE_BENCH_KINDS=llm VOICE_LLM_MODEL=qwen35 npm run voice:benchmark
# Also supported: VOICE_LLM_MODEL=dicta or qwen35-2b.
# Fetch the selected model first, using the same VOICE_LLM_MODEL setting.
VOICE_BENCH_KINDS=llm VOICE_LLM_MODEL=dicta VOICE_LOAD_ONLY=1 npm run voice:benchmark
# Optional local prerecorded WAV; never uploaded:
VOICE_BENCH_KINDS=asr VOICE_WAV=/path/to/hebrew.wav npm run voice:benchmark
# Real cached weights, real streamed PCM / browser playback and cancellation:
npm run voice:playback-smoke
# Download/progress/cache/delete UI replay: simulated network, real fixture bytes.
VOICE_MODEL_DIR=/tmp/voice-models npm run voice:smoke
```

`VOICE_LAB_URL`, `VOICE_MODEL_DIR`, `VOICE_BENCH_OUTPUT` and `CHROMIUM_PATH` override URL, fixture directory, result JSON and executable. The fixture server binds only to loopback and streams large files through a same-origin test proxy. The benchmark uses the shipped Workers, a disposable persistent Chromium profile and cache prepopulation; **this excludes internet download time**. LLM failures make it exit nonzero while preserving results. The six LLM cases currently fail the acceptance gate by design; do not interpret a nonzero exit as missing evidence.

`predev`/`prebuild` generate ignored, self-hosted inference assets in `public/voice/runtime`. No runtime CDN is used. Do not run `next dev` and `next build` concurrently against the same `.next` directory.

## Pipeline and state contract

- Push-to-talk, maximum 20 seconds, local AudioWorklet capture and band-limited resampling to mono 16 kHz. MediaStream tracks close before Zipformer inference in a dedicated ONNX Runtime WASM Worker. ASR uses one thread.
- The transcript is displayed and editable. Sending it routes exact next/missed commands and bare ambiguous reports locally first. Mixed concrete reports such as “שמתי קמח, מה עכשיו?” still go to the LLM. Routing never marks an action complete.
- Model context includes exact recipe/ingredient/source text, explicit current step and completed/remaining actions, revision, previous utterance and current utterance. Code state uses zero-based indices; the model projection consistently uses one-based steps and readable action labels. A reversible exact label map translates proposals back to stable IDs.
- `cookingState.ts` owns recipe identity/content fingerprint, revision, current step, completed and remaining IDs. Strict validation rejects stale recipes/revisions, unknown/duplicate actions, unknown fields, unsupported quotes, generic discourse such as “תיקון” offered as action evidence, negative evidence offered as completion and ambiguous pronoun updates. Evidence must be a substring of the current report. Corrections may reverse completion; partial reports leave other actions pending.
- Wllama raw completion uses explicit GBNF constraints, pinned ChatML-compatible candidates and escaped role-control tokens in untrusted text. Merely passing `response_format` to its chat API did not reliably enforce structure during experiments; the shipped adapter uses explicit grammar. **Grammar is not semantic validation. Every model-proposed update requires explicit human confirmation.** A valid JSON answer can still identify the wrong action or miss a correction. Invalid answers leave state unchanged and ask for clarification.
- Spoken recipe instructions are built from deterministic recipe source lookup, not generated model prose. Unknown quantities stay unknown; additional advice is labeled and disabled in this POC. A “missed” response describes earlier *unreported* actions, not proof of what happened in the kitchen.
- Actions are conservatively split from source slices on newlines/punctuation and selected Hebrew infinitive conjunctions. This is not a general Hebrew parser: plural imperatives/shared objects can remain compound. The lab requires reviewing the action plan before reporting. Production needs stable reviewed action plans. Changing recipe/source remounts the guide, clears progress and terminates old work. Progress currently survives only while that guide is mounted.
- The LLM context is capped at 2,048 tokens. Long recipes may fail initialization/completion rather than silently acquire invented state. The lab is not a validated long-recipe solution.

## Local playback, downloads and privacy

Two speech paths exist: an installed Hebrew OS voice with **`localService === true`** and `he`/`iw` language, or explicitly downloaded Pocket Hebrew with fixed **Omer** voice. No cloud/default voice fallback, speaker cloning or voice encoder is used. The cloud host has no installed Hebrew OS voice; actual speech measurements below use Pocket.

Pocket streams 24 kHz PCM through a local AudioContext. A deterministic normalizer preserves supported numeric values, including fractions, decimals and ranges; it handles “2 כפות” as “שתי כפות”. It is not a complete Hebrew grammar/pronunciation engine. Latin text, clock notation and unsupported symbols/numbers are rejected before G2P can silently omit them. Text and a supported local OS voice remain alternatives. The adapter deliberately omits the unused espeak path and its additional downloads/licenses.

Speech locks recording synchronously, including model load/generation/playback. Capture blocks speech. Stop cancels buffered PCM; completion drains the browser audio clock; there is a 700 ms tail cooldown and no automatic listening. Recipe switch, cancellation and unmount stop media and terminate workers. This is half duplex; physical acoustic echo suppression is untested.

Download buttons show actual byte progress against pinned manifests. AbortController cancels reads; incomplete files are not marked ready; complete files may be reused. Delete waits for in-flight cache writes, terminates inference and removes only `ourrecipes-voice-*` model caches, including earlier candidates/revisions. Runtime assets are ordinary app HTTP resources, separate from model caches.

Current downloads allocate a whole-file buffer; the largest selected GGUF is 1.28 GB. This can require multiple copies and is **not yet a memory-efficient phone downloader**. Private Chromium failed a large Cache.put in the first experiment; a normal persistent profile succeeded. Quota, storage and initialization failures keep manual controls available. Chunked/split storage, quota planning and physical phone limits remain integration work.

Hugging Face receives anonymous model-file GETs only after explicit download choice, with credentials omitted and no referrer. Inference reads only the feature cache and self-hosted runtimes. Wllama remote compatibility fallback is disabled; Pocket receives model buffers directly instead of its download/cache helpers. No remote STT/LLM/TTS provider is configured, and no audio, prompt, transcript or cooking state is included in model requests. Browser tests observed zero external HTTP(S) requests during cached inference/playback. Local `blob:` nested Worker URLs are executable local resources, not network egress.

## Candidates and verified provenance

Sizes are selected files, not entire repositories. Exact revisions and file bytes are in `src/lib/voice/models.ts`; source metadata for alternatives is preserved in `voice-evidence/alternatives-research.json`.

| Candidate | Selected download | License / source evidence | Current disposition |
| --- | ---: | --- | --- |
| [ivrit.ai Zipformer2 66M Hebrew](https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he/tree/ee769a2a13b887f91572eec349458bfb0fe79e7a) | **72,327,325 B** | **CC-BY-4.0**, Yakov Kolani; extra ONNX exports by ivrit.ai; base icefall Apache-2.0. Artifact-specific license, not a general ivrit.ai license assumption. | Actual browser transcription; kitchen accuracy remains unproven. |
| Local OS Hebrew voice | No app weights | Device/provider terms; [MDN localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService). Installed language availability varies. | Conditional option, unavailable on cloud host. |
| [Pocket Hebrew community adapter](https://github.com/thewh1teagle/pocket-tts-onnx), [pinned weights](https://huggingface.co/thewh1teagle/pocket-tts-onnx/tree/110f5251188e9407b4f724acdd8b0dfd0b20692a) | **199,267,914 B** | Adapter/package, Hebrew ONNX and ReNikud declare **CC-BY-4.0**, thewh1teagle; upstream Kyutai runtime **MIT**. Selected he model/assets/manifest/ReNikud only. | Actual synthesis/playback. No human pronunciation verdict yet. |
| [DictaLM 3.0 1.7B](https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Instruct), [community Q4_K_M GGUF](https://huggingface.co/EMD123/DictaLM-3.0-1.7B-Instruct-Q4_K_M-GGUF/tree/2f41ecf9bdeb2d75ff4dd85266970402c59c14d8) | **1,107,404,704 B** | **Apache-2.0**; Hebrew/English continued training from Qwen3 base; conversion EMD123. | Actual browser load/inference, initial chat run failed; final raw-grammar run **3/6**. Kept for comparison, not accepted. |
| [Qwen3.5 0.8B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/tree/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0) | **532,517,120 B** | **Apache-2.0**, Qwen; Unsloth conversion. | Lower download, insufficient Hebrew cooking results. |
| [Qwen3.5 2B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/tree/f6d5376be1edb4d416d56da11e5397a961aca8ae) | **1,280,835,840 B** | **Apache-2.0**, Qwen; Unsloth conversion. | Current lab comparison default; **3/6 semantic cases**, CPU latency too high. |
| [BlueTTS 2.5](https://github.com/maxmelichov/BlueTTS), [ONNX release](https://huggingface.co/notmax123/BlueTTS2.5-onnx/tree/95feb5d0cbfc8e5a95bffb067d03537cbf35be3e) | **263,174,095 B**, or **283,794,689 B** with inspected ReNikud | BlueTTS code/weights **MIT**; ReNikud separate CC-BY-4.0 and voice reference attribution. Four preset-voice graphs + metadata + one voice. Current Python quickstart uses RenikudPlus, excluded from this total. | Researched alternative, **not downloaded or run**. Card notes duration saturation/clipping around 16.5 s. |

Community posts were useful discovery leads, including the [BlueTTS announcement](https://www.reddit.com/r/LocalLLaMA/comments/1skiiog/introducing_bluetts/); the post's ~80 MB claim is not the inspected 2.5 bundle size. [TTS Lines](https://www.ttslines.com/technology) documents a BlueTTS/ReNikud browser implementation, not an independently validated performance guarantee. Pocket's official upstream language list excludes Hebrew, but the community Hebrew adapter has released code and weights and **has now been run here**. Publisher M-series speed claims are not our measurements.

Runtime dependencies: **onnxruntime-web 1.30.0** (MIT, ASR/TTS), **pocket-tts-onnx 0.1.0** (CC-BY-4.0) and **@wllama/wllama 3.13.0** (MIT, llama.cpp browser port). Transformers.js and its separate ONNX backend were removed from the current pipeline. Build bundles the Pocket TTS/G2P modules directly, avoiding its optional espeak and fetch paths. The pinned Dicta GGUF omits its chat-template metadata; its upstream ChatML template was verified at revision `5add44d6941d6ffb9eb6cc6b516f9fb4fd472494`. Only that exact pinned conversion receives the explicit template fallback (`dicta-template-provenance.json`); there is no runtime metadata fetch. Runtime/model attribution and the ORT MIT notice are included in `public/voice/THIRD_PARTY_NOTICES.txt`; generated Wllama/Pocket notices accompany their runtimes. Each Worker loads its matching self-hosted ORT JS/WASM pair; [ORT deployment documentation](https://onnxruntime.ai/docs/tutorials/web/deploy.html) requires version alignment. Runtime binaries add roughly 14 MB per selected ORT WASM and 10 MB wllama WASM, plus JS; prepared alternative binaries and HTTP caching/compression affect transfer size.

## Actual measurements: cloud browser, not a physical device

Host: Linux x86_64, headless **Chromium 156**, cgroup **4 CPU / 16 GB RAM**, browser reports 5 logical cores. No physical microphone/speaker. Cached model loads exclude fixture delivery. ASR/TTS use one WASM thread; final LLM run uses **4 WASM CPU threads**. COOP `same-origin` / COEP `credentialless` are scoped only to `/voice-lab` and `/voice/*`, enabling SharedArrayBuffer without changing other app routes. App LLM startup probes local WebGPU then uses CPU when absent; **GPU inference has not been measured**.

| Engine/run | Observed result | Evidence |
| --- | --- | --- |
| Zipformer2 | Load 2.73 s; 3 s silence → 0.475 s, empty transcript. Public 7.44 s Hebrew clip → **0.770 s**, RTF **0.103**. | `asr-chromium.json`, `hebrew-fixture.json` |
| Pocket Hebrew, final runtime | Load **2.281 s**; first generated PCM **0.303–0.417 s** after warm speak request, including normalization/G2P. Generation **2.544–4.285 s** for **2.88–5.04 s** speech, RTF **0.85–0.89**. | `pocket-final.json`, synthetic `pocket-hebrew-sample.wav` |
| Pocket actual UI playback | PCM scheduled through AudioContext, full drain, stop, recording blocked, recipe switch cancels, model deletion; actual LLM startup/pending completion cancellation leaves progress unchanged. **Zero external HTTP(S) requests.** | `playback-chromium.json` |
| DictaLM initial single-thread comparison | Load 3.983 s; six answers in **51.9–144.8 s**, **0/6** usable cases. Initial chat/schema path, before final raw grammar/prompt projection; not an identical-configuration leaderboard comparison. | `candidates-single-thread.json` |
| DictaLM final raw grammar + one-based projection, CPU4 | Load **3.776 s**; six structured answers in **9.4–60.1 s**, **3/6** intended cases. Partial water report and flour correction failed; missed-stage intent worked. | `dicta-grammar-final.json` |
| Qwen3.5 0.8B Hebrew prompt + raw grammar | Valid structured output did not establish semantics: **2/6** cases under resulting-state scoring, **1/6** exact change-list scoring. | `qwen35-small-hebrew.json` |
| Qwen3.5 2B final one-based projection + raw grammar, CPU4 | Load **4.206 s**; six structured answers in **11.8–77.6 s**. **3/6** intended state/intent cases; **2/6** exact change lists. | `qwen35-2b-projected.json` |

Pocket's first-PCM number excludes model load and the AudioContext's **0.3 s scheduling buffer**. It is not acoustic onset or an end-to-end conversational latency. The WAV is generated from non-private sample recipe text; listening quality still needs a Hebrew-speaking human review.

The Zipformer clip has a proper name/Latin acronym and yielded punctuation-stripped word edit rate **7/11 = 63.6%**; it exactly matched a sherpa-onnx 2.0.1 native reference (0.262 s decode). One deliberately uncurated clip is **not a representative Hebrew or cooking accuracy benchmark**. [Google FLEURS source](https://huggingface.co/datasets/google/fleurs/tree/70bb2e84b976b7e960aa89f1c648e09c59f894dd/data/he_il).

Qwen3.5 2B details, before the code command router:

| Utterance | Actual proposal | Evaluation |
| --- | --- | --- |
| שמתי קמח, מה עכשיו? | Complete flour | Pass |
| הוספתי מים אבל עוד לא ערבבתי | Complete water; mixing remains pending | Pass; omitted redundant `mixing=false` |
| תיקון, לא שמתי קמח | Clarify; no mutation | Fails intended correction, conservatively preserves state |
| עשיתי את זה | Clarify | Pass |
| על איזה שלב דילגתי? | Clarify | Fails model intent; now handled by deterministic command routing |
| כמה שמן להוסיף? | Clarify; no invented quantity | Fails expected advice classification; safe fallback |

Dicta’s final correction case proposed `water=true` using only the quote “תיקון”. The regression guard now rejects generic evidence like this; replay of the recorded answer confirms rejection, documented separately from inference in `dicta-grammar-final.json`. This does not make Dicta accurate, and does not prove every unsupported interpretation can be detected by code. Explicit user review remains essential.

Original JSON preserves exact-list scores and raw replies. Added `stateEvaluation` treats an omitted no-op as equivalent only if completed/remaining sets, expected intent and supported changes all match; it does not reward incorrect completions. Different prompt/engine configurations are labeled and should not be treated as a controlled ranking.

Pocket-only peak **sum of Chromium process RSS: 1,337 MiB**; final Qwen2B peak **2,334 MiB** and final Dicta peak **2,461 MiB**, sampled every 2 s. This includes browser/app/runtime/workers/native/WASM and may count shared pages repeatedly; it is not model-only memory or a safe phone RAM requirement. JS heap is recorded separately and excludes most inference memory. Fixture fetch script records network durations separately; these are cloud downloads, not user-browser rates.

Earlier Qwen3 0.6B ONNX q4 (928,225,125 B, Apache-2.0) experiments loaded in 6.20–8.65 s but did not finish the first Hebrew case within 180 s. Historical evidence is retained in `llm-initial-chromium.json` and `llm-nonthinking-chromium.json`. That engine pairing was replaced; it did not establish a universal limit on local LLMs.

## Verification boundaries and acceptance gate

- **Actual model inference:** cached pinned ASR, three GGUF candidates, Pocket model + ReNikud in browser Workers. Actual PCM scheduling and browser audio clock. No physical acoustic result claimed.
- **Actual UI:** manual partial completion/correction, gap reporting, recipe reset, typed next/missed commands without LLM download, 390 px layout, unsupported engine alternatives, stop/delete/cancel. UI download replay uses real fixture bytes with **simulated network URLs**, not internet speed.
- **Simulated unit tests:** fake Workers, microphone, native speech, cache/network and proposed model outputs. These verify state guards, Hebrew negative/partial evidence, clarification, numeric preservation, cancellation/unmount, local voice filtering and half duplex. They do not prove model understanding or pronunciation.
- **Repository:** **572 tests / 62 files** pass, including **30 focused tests / 5 files**; TypeScript and production build pass. No forbidden-path edits. `/voice-lab` is a static route.
- **Not tested:** physical Android/iOS/desktop devices, Safari/Firefox/WebViews, real room microphone, kitchen noise/accents, human listening, Bluetooth, thermal pressure, background/resume, phone airplane mode, WebGPU latency/memory or end-to-end physical conversation. WebAssembly/Worker/Cache/secure-context checks are preliminary; enough RAM/storage and model initialization are still required. Manual buttons/checklists/text remain usable when engines fail. Browser SpeechRecognition is not enabled because its default can be remote and Hebrew local language-pack support was not established.

Keep the experiment isolated until a model handles the six fixtures **and unseen variants**, including corrections/partial actions, with acceptable latency/memory on the actual target phone. Current evaluated LLMs fail that gate. Initial proposed warm targets (not promises): <=2 s final STT, <=3 s model response, <=0.5 s first generated speech. Next useful evaluation is at least 20 cooking utterances across speakers/noise plus human TTS listening and cold/warm CPU/WebGPU measurements on target hardware. Memory-efficient downloads and a reviewed real-recipe action plan are also required before full integration. Explicit confirmation and stale-result rejection remain in place.

## Timer boundary: documentation only

No `TimerContext`, `timerDB`, `lib/timers`, Capacitor, Android or iOS files were changed or imported. A future host-owned adapter could accept:

```ts
interface CookingTimerRequest {
  recipeKey: string;
  actionId: string;
  durationSeconds: number;
  source: 'explicit-user-request' | 'recipe-exact-duration';
  sourceQuote: string;
}
interface CookingTimerPort {
  requestTimer(request: CookingTimerRequest): Promise<{ timerId: string }>;
}
```

The host owns creation, deduplication and lifecycle. An unspecified duration requires clarification. No timer connection is implemented here.


## Follow-up: can we train the language understanding component?

Fresh web search and publisher metadata checked 2026-11-10; this section is research, **not a training run or new browser inference result**. Exact candidate revisions/weight bytes are preserved in `voice-evidence/training-research.json`. The six earlier cooking cases are diagnostic examples, not enough data to train or estimate generalization.

- [Sommelier's published Hebrew tool-calling experiment](https://huggingface.co/abdelstark/Llama-3.1-Nemotron-Nano-8B-xlam-tool-calling-he-en-hymt-lora) reports full-call exact match improving from **43.39% to 83.17%** on 945 held-out Hebrew prompts after QLoRA. This is publisher evidence on an **8B** model, machine-translated single-call data without human semantic review; not independently reproduced here and not a phone/cooking benchmark. Adapter size alone excludes the required base model. It supports investigating task adaptation, not promising equivalent results on tiny models.
- [FunctionGemma 270M](https://ai.google.dev/gemma/docs/functiongemma/model_card) is explicitly intended for task-specific function-calling fine-tuning, including multi-turn cases. [Google publishes an offline Mobile Actions training/deployment example](https://ai.google.dev/gemma/docs/mobile-actions). Current upstream BF16 weights alone are **536,223,056 bytes**, 268,098,176 parameters, before tokenizer/runtime; weights use **Gemma terms**, with gated access. Its app/domain intent fits a cooking-state experiment, but Hebrew cooking quality and browser export/performance are unverified. An English mobile demo is not Hebrew browser support.
- [DictaBERT-tiny](https://huggingface.co/dicta-il/dictabert-tiny) is a Hebrew masked-language base with **44,892,008 parameters**, four layers, **179,576,648 bytes** of FP32 safetensors, **CC-BY-4.0**. A supervised action-pair classification head could be trained; this is not a ready cooking classifier or chat assistant. Portable ONNX export, quantization parity, browser memory and latency must be tested; no quantized browser download size is claimed.
- [SetFit](https://huggingface.co/docs/hub/setfit) supports multilingual sentence encoders and [ONNX export](https://huggingface.co/docs/setfit/en/tutorials/onnx). It is an alternative intent-classification baseline, not a general solution for negation or matching arbitrary actions. A pretrained masked-language BERT is not automatically a ready SetFit sentence encoder. The inspected multilingual E5-small is 117.7M parameters / 470,641,600 B FP32; its published AVX512-VNNI int8 artifact is not evidence of portable browser compatibility.
- The discovered `humy65/hebrew-intent-classifier` targets four customer-support labels, not cooking. Its task and inconsistent usage identifier do not justify adoption; catalog discovery is not validation.

Recommended next experiment (engineering proposal): specialize language understanding while retaining code-owned state and recipe-grounded replies. Train a compact Hebrew encoder on report/action pairs plus previous/current state. Predict completed, explicitly not completed, or not reported per candidate action, with a separate intent/clarification decision. This supports arbitrary recipe action text instead of memorized action IDs. For “הוספתי מים אבל עוד לא ערבבתי”, water is completed and mixing is not completed; code maps labels to canonical IDs and constructs the recipe response. This is a focused conversational guide, not an open-ended chef chatbot. Compare it against an SFT/LoRA small function caller if the encoder loses necessary dialogue context.

Build a native-Hebrew, human-reviewed seed corpus with corrections, partial reports, ambiguous references, negation, unknown ingredients/actions, quantities and realistic ASR errors. Start with a pilot of hundreds of diverse examples and grow it from the learning curve; “a few thousand” is an experiment budget, not a sufficiency guarantee. Split by **recipe and paraphrase family** before augmenting, keep unseen recipes/utterances for evaluation, and do not recycle the six diagnostic fixtures as both training and acceptance data. Synthetic augmentations need semantic review, especially for negation. No user recordings or app text are collected/uploaded automatically.

Fine-tuning an existing large model may improve correctness but does not inherently reduce its inference compute or download. A small classifier, shorter inputs/outputs or separately validated acceleration targets latency; LoRA alone does not solve the observed CPU delay. Training happens once on a development machine (GPU optional/likely helpful, depending on experiment), followed by export and local inference on user devices. No paid GPU run, external teacher call, model training or accuracy claim has been made in this follow-up. Keep validation, clarification and confirmation until held-out semantic results and physical-device latency/memory justify integration.


## Prepared training kit (2026-11-11)

[Hebrew beginner guide and runnable material](../training/voice-hebrew/README.he.md): 720 synthetic labeled conversations, recipe-disjoint train/validation/test, review CSV/importer, bounded DictaBERT-tiny training, local evaluation/ONNX export, explicit Modal launcher and Colab notebook. No cloud GPU run or user data upload was performed. A real two-step CPU plumbing check, forced-stop/resume equivalence and pretokenized browser graph tests were run; these do not establish Hebrew cooking accuracy. See the kit’s `VERIFICATION.md` for exact boundaries.
