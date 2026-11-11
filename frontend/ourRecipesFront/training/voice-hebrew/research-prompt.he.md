# פרומפט למחקר מקביל ב־Perplexity

העתק את הטקסט שלהלן ל־Perplexity. הוא כולל את ההקשר הדרוש; אין צורך לצרף קוד, פרטי חשבון או הקלטות.

---

Act as an AI/NLP researcher and an on-device inference engineer specializing in Hebrew. Research model choices for the specific product below. Search current primary sources and relevant developer discussions, then write your report **in Hebrew**, with direct source links and a clear recommendation. Use the actual research date. Distinguish verified facts, publisher claims, community anecdotes, and your engineering estimates.

## Our product and task

We are building a **Hebrew voice cooking guide** in Next.js + React, intended to work locally in desktop/mobile browsers:

**Hebrew speech-to-text → contextual language understanding → validated cooking-state proposal → Hebrew text-to-speech.**

STT and TTS already have experimental local implementations: ivrit.ai's Hebrew Zipformer2 and the community Hebrew Pocket TTS ONNX adapter, with an installed local Hebrew OS voice as another option. **The main research target is the language-understanding component.** Do not spend most of the report on unrelated ASR, TTS, diacritization, NER or morphology benchmarks. Use those results only when they provide relevant evidence for an encoder candidate.

At inference time the system supplies:
- The current recipe's exact ingredients, quantities if specified, instruction text and a reviewed list of action IDs/texts.
- Explicit code-owned cooking state: current step, completed actions, remaining actions and a revision/recipe identity.
- The user's current Hebrew report and, where relevant, recent dialogue/corrections.

The model should identify intent and propose **only supported changes to known recipe actions**, with polarity and preferably exact supporting text spans. Code validates the proposal and constructs the answer from the recipe. Uncertain/ambiguous reports must trigger clarification. During experimentation, updates require user confirmation.

Examples, assuming the corresponding actions exist in the recipe:
1. “שמתי קמח, מה עכשיו?” → report flour added, then find the next remaining action from code-owned state.
2. “הוספתי מים אבל עוד לא ערבבתי” → water added; mixing explicitly not completed. Do not mark the whole step complete.
3. “תיקון, לא שמתי קמח” after a prior flour-completed report → retract that completion.
4. “עשיתי את זה” with ambiguous reference → ask which action; do not guess.
5. “על איזה שלב דילגתי?” → inspect earlier unreported actions. Do not claim to know what physically happened.
6. “הוספתי רק חצי מכמות המים” → recognize incomplete/partial execution; do not treat the full action as completed. Clarify if the state representation cannot capture the amount.
7. “לא אמרתי שהוספתי מים” → distinguish negation of a previous statement from a straightforward report about adding water.
8. “כמה שמן להוסיף?” when oil or its amount is absent → say it is unspecified; do not invent a recipe quantity.

A new recipe must be handled from its supplied text; we cannot train separately for every recipe. We need a focused conversational guide with flexible phrasing, not an unrestricted recipe-generating chatbot. Exact navigation questions can be handled in code. Advice beyond the recipe must be clearly distinguished from recipe instructions.

## Constraints and current evidence

- Prefer fully local inference. No user audio, transcript or recipe-state data may be sent to an external provider by default.
- **Browser feasibility matters:** ONNX Runtime Web/WASM/SIMD and optionally WebGPU. Native Python, CUDA, MLX, desktop llama.cpp or Android-native performance is not evidence of browser/phone performance.
- Mobile browser RAM/storage, selected download size, tokenizer/runtime assets, first-load time, warm latency and cancellation matter. Manual controls remain available on unsupported devices.
- Training/fine-tuning may happen once on a cloud GPU such as a **T4 with 16 GB VRAM**, then export to local deployment. We can perform modest fine-tuning; we are not planning pretraining from scratch.
- We have a synthetic seed corpus of **720 conversations on 30 short recipes**: 480 train, 120 validation, 120 test. Recipes and exact utterances are split; some controlled report templates are shared. This is not a human-validated natural-conversation benchmark. More diverse, reviewed data may be needed.
- `dicta-il/dictabert-tiny` is our first supervised baseline, with a joint intent/action classifier. A **200-step pilot was undertrained and mostly abstained**. A longer pilot is being evaluated. **Do not conclude from this alone that the base model is unsuitable.**
- Small generative GGUF experiments with DictaLM 3.0 1.7B and Qwen3.5 2B had poor results on six diagnostic examples and CPU-browser replies taking tens of seconds on a cloud host. Those were limited configurations, not a definitive model ranking or phone benchmark.
- JSON grammar/schema constraints fixed syntax but did not guarantee correct action selection or negation understanding. One model used the generic word “תיקון” as evidence for an unrelated action. Semantic grounding must be evaluated separately.
- We have exported a tiny encoder to ONNX/INT8 and checked browser tensor inference using Python-pretokenized inputs. This does not certify browser tokenizer parity, physical phone performance or Hebrew cooking accuracy.

## Research questions

### 1. Choose the architecture for THIS task

Compare:
- A compact Hebrew/multilingual encoder trained as a cross-encoder over report + candidate action + context, with intent and done/not-done/not-mentioned labels.
- A joint token/span extractor or other compact encoder approach that can return action mentions, negation scope and exact evidence spans.
- A small generative/function-calling model returning a short structured proposal.
- A hybrid design if it materially improves correctness or latency.

Explain the tradeoffs for partial reports, corrections, ambiguity and unseen recipes. Explain where embedding similarity or keyword matching alone is insufficient, especially for negation. Do not assume one architecture wins without task-relevant evidence.

### 2. Verify encoder candidates, preferably under 300M parameters

Investigate **NeoDictaBERT, HeRo, newer DICTA/HeNLP/Israeli NLP releases, and suitable compact multilingual encoders**, alongside DictaBERT-tiny as a baseline.

Verify the exact released model names and Hugging Face IDs first. Do not assume a model exists, is recent, is compact or supports Hebrew because of its name. If NeoDictaBERT/HeRo refers to a paper without deployable weights, an older release, a larger model or a task-specific checkpoint, say so explicitly.

For each serious candidate, determine whether it needs supervised adaptation and whether its architecture/tokenizer/custom code can actually be exported and executed in browser WASM/WebGPU. Verify whether available quantized ONNX files are portable, or depend on native AVX/VNNI/CUDA kernels. A Python ONNX export alone is not enough.

### 3. Verify compact generative/function-calling alternatives

Consider suitable models around 0.5B–3B and any smaller specialist with credible evidence, including **DictaLM 3.0 1.7B, relevant Gemma/Qwen releases and FunctionGemma 270M**.

Separate general Hebrew fluency from reliable structured action extraction. Evaluate Hebrew token inflation, input processing/prefill cost, output length, instruction-template requirements, reasoning modes and state/memory footprint. State whether model-specific fine-tuning is required. Do not describe gated/custom-license models as unrestricted Apache/MIT models.

### 4. Evidence from benchmarks and practitioners

Search official model cards/papers/code, Hugging Face discussions, GitHub issues, Reddit (including r/LocalLLaMA), and Israeli communities such as MDLI.

Use community posts as leads, not as substitutes for verifying release files, licenses and technical claims. Cite concrete discussions and specify hardware/runtime/model quantization when quoting speed or memory. Do not transfer an English benchmark, NER score, advertised language list or Mac GPU result into a Hebrew browser-cooking accuracy claim.

If useful tokenization measurements exist, distinguish Hebrew/English token ratios, vocabulary size, and effects on cooking terms, inflection, numbers, fractions and mixed-language ingredient names.

## Required output

1. **An executive recommendation:** the first model/architecture to try, one backup, and whether we should continue fine-tuning DictaBERT-tiny before changing models.
2. **A comparison table of at most 6–8 serious candidates**, with:
   - Exact model/HF ID and source link; release/revision evidence.
   - Architecture, parameter count (including embeddings) and context limit.
   - Evidence for Hebrew understanding and task fit.
   - Base/task-specific status; necessary training and evidence-span support.
   - Selected deployable weight size/precision, plus tokenizer/runtime assets when known. Do not use the total size of a multi-format repository as the download size.
   - License, access gating, attribution/redistribution conditions for the exact artifact.
   - Browser runtime/export support and actual measured vs estimated RAM/latency.
   - Main limitation or reason to reject it for our product.
   Mark unverified fields **unknown**, rather than inventing numbers.
3. **A low-cost experiment plan for one T4:** training approach, initial data needs, validation metrics, export/quantization checks and a stop/continue rule. Treat LoRA as an adaptation technique, not an automatic inference-speed improvement. Explain when full encoder fine-tuning is simpler than LoRA.
4. **An evaluation protocol:** split by recipe and paraphrase family, include unseen formulations and realistic STT errors, and separately measure false state updates, action precision/recall, exact proposals, clarification coverage, corrections and negation. An always-clarify model must not count as successful. Include browser-tokenizer parity and physical-device cold/warm tests.
5. **A short list of unresolved questions** we should answer before full integration, with links to the primary sources that can settle them.

Make the report actionable for a developer doing a first fine-tuning project. Explain jargon briefly. Prefer a smaller evidence-backed shortlist and concrete next experiments over a broad catalogue or popularity ranking. State clearly which candidates you researched versus actually ran; do not claim to have benchmarked anything you did not execute.
