# Hebrew cooking voice proof of concept

Status: experimental lab at `/voice-lab`, on branch `codex/hebrew-cooking-voice-poc`. No production recipe UI integration or final model selection. The initial working tree was clean. There were no `RecipeVoiceGuide`, `useRecipeVoice`, or `voiceCommands` implementations in this checkout, and no applicable AGENTS.md files.

## Run

From `frontend/ourRecipesFront`:

```sh
# The Node/CUDA inference backend is unused. Skip its optional binary download
# in proxy-restricted environments; keep the rest of npm lifecycle scripts.
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run dev                          # existing port 80 default
# Or: npm run voice:prepare && npx next dev -p 3000
# Visit /voice-lab. No model downloads happen until an explicit click.
npm run test:run -- tests/unit/lib/voice
npm run voice:smoke                   # expects http://localhost:3000
```

`predev`/`prebuild` generate self-hosted executable inference assets in ignored `public/voice/runtime`. Executable code is never fetched from a third-party CDN by the lab. The model cache is separate from runtime assets and other application caches. The runtime assets are HTTP-cacheable app resources, not model weights; the model delete button deletes only the feature's Cache Storage entries, including old revisions. Browser settings can clear ordinary HTTP assets.

Measurements with actual, pinned weights (about **1 GB of fixtures**, explicitly downloaded):

```sh
npm run voice:fetch-models           # Python 3 urllib, inherited proxy/CA
VOICE_MODEL_DIR=/tmp/voice-models npm run voice:benchmark
# Optional prerecorded WAV, supplied locally, never uploaded:
VOICE_WAV=/path/to/hebrew.wav npm run voice:benchmark
# Optional ASR-only run:
VOICE_BENCH_KINDS=asr VOICE_WAV=/path/to/hebrew.wav npm run voice:benchmark
# Replayed download/cache/delete UI check (network is simulated):
VOICE_MODEL_DIR=/tmp/voice-models npm run voice:smoke
```

`VOICE_LAB_URL`, `VOICE_BENCH_OUTPUT`, and `CHROMIUM_PATH` override the benchmark URL/output/Chromium executable. Default benchmark JSON is `/tmp/voice-benchmark.json`. The runner exits nonzero on incomplete/failed LLM cases or model loading errors, and samples Chromium process RSS every 2 s for future runs (shared pages may be counted more than once), separately from the renderer JS heap. The runner uses a disposable persistent Chromium profile: an incognito run failed to cache the 919 MB LLM response with `Cache.put: Unexpected internal error`. The normal profile succeeded. The UI reports storage failures and leaves manual controls available; private browsing is not certified. Do not run `next dev` and `next build` against the same `.next` directory concurrently.

## Implemented pipeline and state contract

- Push-to-talk, maximum 20 seconds, AudioWorklet, mono capture and browser band-limited resampling to 16 kHz. MediaStream tracks close before inference. Zipformer2 int8 runs in a dedicated Worker with ONNX Runtime WASM, single thread; no global COOP/COEP changes.
- The transcript is editable before sending it to the local LLM. The prompt includes recipe title, ingredients, exact instruction/action source slices, explicit current step, completed/remaining action IDs, revision, and previous utterance. Untrusted recipe/user text is data in the prompt.
- State lives in code, not in LLM conversation memory. `cookingState.ts` validates a strict structured proposal: recipe identity/content fingerprint, current revision, intent, known action IDs, unique changes, exact evidence substrings from the current utterance. Unknown fields/IDs, stale answers, invented prose, contradictory schema and unsupported evidence are rejected.
- **A structurally valid proposal is not semantic proof.** Every model-proposed update requires user review and explicit confirmation. Ambiguity requests clarification without applying changes. Corrections can reverse completion. A partial step leaves its other actions pending. Navigation does not mark actions complete. Missing earlier actions are described as *unreported*, not facts about what physically happened.
- Exact source slices are split on newlines, commas/semicolons and a conservative list of Hebrew infinitives after a conjunction. This is not a general Hebrew action parser: plural imperatives, shared ingredients and compound actions can remain together. Users must review the plan; an unsplittable partial report should be clarified or the lab source edited. Editing source/remounting or changing sample resets state and terminates in-flight work. Production requires a reviewed, stable action plan per real recipe.
- Spoken recipe instructions come only from deterministic source lookup. Model prose cannot introduce quantities, steps, temperatures or timings. Additional advice is explicitly labeled and disabled in this first experiment. Unspecified quantities remain unspecified.
- Speech synthesis uses **only** `SpeechSynthesisVoice.localService === true` and Hebrew (`he`/`iw`) language tags. No default/cloud voice fallback. Voice discovery handles `voiceschanged`. Speech blocks capture synchronously, capture blocks speech, there is a 700 ms speech-tail cooldown, no automatic re-listening, and cleanup cancels speech/capture/workers. This is half duplex, not acoustic echo cancellation certification.
- Download buttons show actual bytes against pinned manifest sizes; AbortController cancels network reads. Complete files may be reused, incomplete files are not marked ready. Delete waits for an in-flight write to settle, terminates workers, and removes all feature model revisions. Cache/memory/network errors preserve buttons/text.
- No remote transcription/LLM/TTS provider exists in this lab. Hugging Face receives anonymous model-file GETs only after download choice, with credentials omitted and no referrer. Subsequent inference reads cached files; the LLM's custom fetch fails closed to the pinned cache, including its library's `main` metadata alias. No user audio, prompt, transcript or progress is included in a request. Existing unrelated app services are outside this lab.

## Candidate evidence, checked 2026-11-10

Download sizes below are **the selected files**, not entire multi-format repositories. File lists, byte counts and pinned revisions are in `src/lib/voice/models.ts`.

| Candidate | License / provenance | Download and platform evidence | Decision |
| --- | --- | --- | --- |
| [ivrit.ai Zipformer2 66M streaming Hebrew](https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he/tree/ee769a2a13b887f91572eec349458bfb0fe79e7a) | **CC-BY-4.0**, developer **Yakov Kolani**, extra ONNX exports by ivrit.ai; base icefall Apache-2.0. Do not assume ivrit.ai's general model-license summary applies to this particular artifact. | Selected int8 encoder/decoder/joiner + config/tokens: **72,327,325 bytes**, 72.3 decimal MB. Model consumes 80-bin fbank/16 kHz mono, 1.28 s decode chunks. [Model card](https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he) documents WASM int8/browser use and weaker English/numeric normalization. | Working local adapter, pending representative kitchen recordings and physical-device assessment. |
| Local OS Hebrew voice | OS/provider terms; no model redistributed by app. [Web Speech localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService) distinguishes local/remote voices. | No app-managed weights; actual installed Hebrew voice varies by OS/device. Voice API presence alone does not establish Hebrew availability. | First optional TTS path, otherwise text. None available on test host. |
| [Pocket TTS](https://github.com/kyutai-labs/pocket-tts) | Runtime **MIT**; official [weights card](https://huggingface.co/kyutai/pocket-tts) **CC-BY-4.0** plus access/usage conditions. Distinguish code, weights, voice embeddings and community forks. | Official language list does **not** include Hebrew. Browser implementations are community ports, not an official compatibility guarantee. Publisher claims ~200 ms first audio and ~6x realtime on MacBook Air M4 are not our measurements. The pinned official weight manifest (`db04f0e653473e5c7333c69686ac92b7460b0c1d`) lists `languages/english/model.safetensors` at **219,029,196 bytes** and the January checkpoint at **235,738,732 bytes**; these are checkpoint-only sizes, excluding voice/codec/runtime assets. There is no verified official Hebrew download to size. No Pocket model was downloaded or benchmarked. RAM/latency for a Hebrew browser port therefore remain unverified. | Not selected as a Hebrew voice. An experimental Hebrew fork is not sufficient proof of released weights, license or quality. |
| [Qwen3 0.6B ONNX q4](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/tree/58ca03a5e7b354b480b1a82b34bde8dc7b854cc0) | **Apache-2.0**, Qwen; ONNX export by ONNX Community. | Selected model + tokenizer/config: **928,225,125 bytes**, 928.2 decimal MB; model alone 919,096,585. q4f16 alternative alone 569,789,750 bytes, not tested; it is not equivalent to q4 CPU. [Qwen's language list](https://qwenlm.github.io/blog/qwen3/) includes Hebrew but does not establish small-model cooking quality. | Experimental only; latency/quality gates below must pass before integration. |

Inference runtime code: [ONNX Runtime](https://github.com/microsoft/onnxruntime) MIT; [Transformers.js](https://github.com/huggingface/transformers.js) Apache-2.0. ASR runtime pinned to 1.30.0; Transformers.js 4.3.2 has its own pinned ONNX Web dependency in the lockfile. Each Worker self-hosts its matching JS/WASM pair. [ONNX deployment documentation](https://onnxruntime.ai/docs/tutorials/web/deploy.html) requires matching JS/WASM versions. Runtime binary downloads are additional to model sizes (roughly 14 MB ASR WASM and 27 MB LLM asyncify WASM in this Chromium run (other self-hosted WASM variants are also prepared for runtime selection) before HTTP compression, plus JS); they load on first engine use, not initial page render.

Browser scope: local WASM execution avoids requiring WebGPU. This still requires a secure context, Workers, WebAssembly/SIMD, Cache Storage, enough disk/RAM and, for recording, getUserMedia/AudioWorklet. Capability checks are an initial gate; initialization errors remain possible. Manual checkboxes/navigation/text responses work without these engines. Local-only native [SpeechRecognition.processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally) was investigated, not enabled: default browser SpeechRecognition can use a remote service; Hebrew on-device language-pack availability was not established. Safari/iOS, Android Chrome, Firefox and WebViews have not been tested here.

## Follow-up: alternatives discovered through community posts

The initial search was too narrow. The official Pocket TTS language list does not describe all community adapters. The following are **newly researched candidates, not new inference measurements**. Checked 2026-11-10 against publisher code/model metadata; see `voice-evidence/alternatives-research.json` for pinned revisions and exact file sizes. No new weights were downloaded and no application behavior was changed in this follow-up.

Discovery included the [BlueTTS developer announcement](https://www.reddit.com/r/LocalLLaMA/comments/1skiiog/introducing_bluetts/), community model catalogs and implementation discussions. Posts are useful leads, but their model version, license and performance claims must be checked against primary sources. In particular, the announcement's approximately 80 MB figure is not the current BlueTTS 2.5 bundle size.

| Candidate | Verified source evidence | Download scope / limitations | Next experiment |
| --- | --- | --- | --- |
| [thewh1teagle/pocket-tts-onnx](https://github.com/thewh1teagle/pocket-tts-onnx) | Released Hebrew IPA adapter, TypeScript package, browser Worker implementation and downloadable Hebrew voices `omer`/`liat`. The adapter repository/package and [model artifact](https://huggingface.co/thewh1teagle/pocket-tts-onnx) declare **CC-BY-4.0**, distinct from upstream Kyutai runtime MIT. ReNikud also CC-BY-4.0. | At revision `110f5251188e9407b4f724acdd8b0dfd0b20692a`, Hebrew `model.onnx` + `assets.json` + `manifest.json` + `renikud.onnx` total **199,267,914 bytes**, about **199.3 MB**. Voice cloning encoder adds **39,183,564 bytes** and is unnecessary for preset voices. Runtime WASM is additional; mixed Latin text can require ~18 MB espeak and its separate license obligations. | **First new TTS candidate.** Use preset Hebrew voices and self-host runtime assets. Test Hebrew quantities, fractions, food names and streamed cancellation. No voice cloning is needed. |
| [BlueTTS 2.5](https://github.com/maxmelichov/BlueTTS) | Publisher code and [ONNX bundle](https://huggingface.co/notmax123/BlueTTS2.5-onnx) declare **MIT**, explicitly include Hebrew. [TTS Lines documents its own browser implementation](https://www.ttslines.com/technology) using BlueTTS + ReNikud; this is evidence that a browser integration exists, not our independent validation of that service. ReNikud and the chosen voice references have separate attribution requirements. | At revision `95feb5d0cbfc8e5a95bffb067d03537cbf35be3e`, preset-voice inference graphs (`text_encoder`, `vector_estimator`, `vocoder`, `duration_predictor_style`) + required metadata/stats/unconditional embeddings + one voice total **263,174,095 bytes**. Adding the inspected ReNikud model gives **283,794,689 bytes**, about **283.8 MB**, before runtime/front-end assets. This describes the ReNikud browser path; the publisher's current Python quickstart uses RenikudPlus, whose download is not included in this total. | **Second TTS candidate.** Browser port needs sentence chunking and pronunciation/number tests; current card notes duration saturation near 16.5 seconds and possible clipping. |
| [DictaLM-3.0-1.7B-Instruct](https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Instruct) + [wllama](https://github.com/ngxson/wllama) | Dicta's model is trained further on Hebrew/English and instruction-tuned, initialized from Qwen3-1.7B-Base. **Apache-2.0**. A [community Q4_K_M GGUF conversion](https://huggingface.co/EMD123/DictaLM-3.0-1.7B-Instruct-Q4_K_M-GGUF) is available, also declaring Apache-2.0. wllama provides browser llama.cpp/WASM execution and WebGPU support; its package/license declare **MIT**. | Selected community GGUF `dictalm-3.0-1.7b-instruct-q4_k_m.gguf`, revision `2f41ecf9bdeb2d75ff4dd85266970402c59c14d8`: **1,107,404,704 bytes**, about **1.11 GB**, plus runtime and context memory. It is larger than the initial model and not certified for phones. Verify conversion/template fidelity, exact published engine version and real browser initialization before adoption. | **First Hebrew-specialized LLM candidate.** Run the six existing cooking cases plus unseen variants, measure cold/warm latency/RAM, and compare with the original Qwen model in GGUF on the same engine to separate engine cost from model quality. |

The Pocket browser publisher reports approximately 130 ms Hebrew startup / ~6x realtime on an M-series laptop, but these are **publisher measurements**, not ours, and not phone guarantees. Its own [web documentation](https://github.com/thewh1teagle/pocket-tts-onnx/blob/main/docs/WEB.md) explains the performance cost of single-thread execution when cross-origin isolation is absent. wllama likewise requires COOP/COEP for multithreading and recommends splitting large downloads. Do not add app-wide isolation headers without testing their effect on the existing app; first benchmark in the isolated lab.

RAM, Hebrew listening quality, browser compatibility on physical phones and end-to-end response latency remain unmeasured for these new candidates. The prior Qwen3 ONNX/WASM timeout does **not** establish that all local LLMs or other inference engines are too slow. The updated shortlist is Zipformer2 for STT, Pocket's Hebrew adapter or BlueTTS for TTS, and DictaLM/wllama for the next LLM comparison. None is a final production choice.

## Validation and measurement boundaries

- **Actual inference, virtual cloud host:** headless Chromium 156, Linux x86_64, browser reports 5 logical cores; inference forced to one WASM thread. Local fixture delivery populates Cache Storage; this does **not** measure real internet download latency. Models then run through the actual shipped Workers.
- Zipformer2 load: **2.73 s** in the prerecorded run. Three seconds of silence: **0.475 s**, empty transcript. A **7.44 s** public [Google FLEURS Hebrew test recording](https://huggingface.co/datasets/google/fleurs/tree/70bb2e84b976b7e960aa89f1c648e09c59f894dd/data/he_il) transcribed in **0.770 s**, RTF **0.103** (lower is faster). This clip contains a proper name and Latin acronym; a simple punctuation-stripped word edit rate was **7/11 = 63.6%**. One deliberately uncurated clip is **not a benchmark estimate** and does not substantiate the publisher's leaderboard scores or cooking accuracy. The browser result exactly matched a local sherpa-onnx 2.0.1 reference run on the same weights/audio (reference decode ~0.262 s, native CPU). See `voice-evidence/asr-chromium.json` and `hebrew-fixture.json`.
- Qwen loaded in **8.65 s** in the first run, but the first full-context Hebrew case did not finish within **180 s**. Renderer RSS sampled during this run was approximately **4.6 GiB**, including app/Workers/runtime; it is not peak model memory or total device RAM. A follow-up with explicit non-thinking template and a 192-token cap loaded in **6.20 s** and also failed to complete the first case within **180 s**. **Zero of the six planned LLM cases completed**, so Hebrew semantic accuracy is unknown, not a passing result. See `voice-evidence/llm-initial-chromium.json` and `llm-nonthinking-chromium.json`. The UI terminates an unanswered operation at 120 s and offers manual controls. This exact LLM/engine pairing fails the proposed latency gate; no final local LLM has been selected.
- **Simulated APIs/predictions:** unit tests supply model proposals, fake Workers/microphone/speech/cache/network. They verify Hebrew partial reports, corrections, clarification, gaps, recipe/source/revision changes, invented/duplicate/unsupported updates, local-only voice filtering, half duplex/cooldown, cancellation and cleanup, byte progress, partial-file handling and scoped deletion. They do not establish model accuracy, acoustic isolation or physical-device performance.
- **Actual browser UI, simulated unsupported device:** manual partial completion/correction, gap reporting, recipe reset, 390 px layout without horizontal overflow, disabled unavailable engine controls, usable alternatives. With ordinary manual use, no requests to external origins were observed. Model download UI tests can replay local fixtures; those are simulated network tests, not download-speed measurements.
- **Repository verification:** all **558 tests across 60 files** pass, including **16 new focused tests**; TypeScript and production build pass. The app builds `/voice-lab` as a static route. No forbidden-path edits were found.
- **Physical devices:** none. No microphone capture from a real room, human evaluation of Hebrew TTS, kitchen noise/accents, Bluetooth routing, mobile thermal/memory pressure, airplane-mode run on a phone, or background/resume test has occurred. No locally installed Hebrew voice was available in cloud Chromium, so TTS output latency/audio quality could not be measured. `tts:first-audio` in the lab measures the browser's start event when a real local voice exists, not acoustic onset.

## Integration gate and next measurements

Keep the lab isolated until a candidate meets all of: valid supported proposals for the six Hebrew fixtures and unseen variants; conservative clarification for ambiguity; corrections/partial actions without over-completion; zero unapproved egress; meaningful human transcription/voice evaluation; acceptable measured cold/warm latency and memory on a real target phone. A useful initial latency budget to validate with users is <=2 s final STT, <=3 s LLM response, <=0.5 s first speech after the device is warm. These are proposed targets, not achieved guarantees. Use at least 20 cooking utterances across speakers/noise, compare transcripts against references, and measure end-to-end cold/warm runs (including download rate, storage quota, RSS/WASM/native memory where tooling permits).

This prototype deliberately keeps explicit confirmation. Only consider automatic low-risk state updates after a representative evaluation, with correction/undo and stale-result guards retained. Evaluate a more efficient GGUF/WASM engine or a larger Hebrew-capable model with WebGPU on actual hardware before treating Qwen3-0.6B ONNX/WASM as the final choice.

## Proposed timer boundary (documentation only)

No `TimerContext`, `timerDB`, `lib/timers`, Capacitor, Android or iOS files were changed or imported by this feature. A future host-owned adapter could accept only a validated explicit request:

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

The host, not the language model, owns timer creation, deduplication and lifecycle. Missing/ambiguous duration requires clarification. There is no implemented timer connection in this proof of concept.
