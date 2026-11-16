---
language: he
license: cc-by-4.0
base_model: dicta-il/neodictabert
library_name: pytorch
tags: [hebrew, decision, multiple-choice, classification, calibration, distillation]
datasets: [AmazonScience/massive, allenai/cosmos_qa, clinc/clinc_oos, PolyAI/banking77, google-research-datasets/go_emotions, nyu-mll/multi_nli, google/boolq, Davlan/sib200, yoavipo/hebrew-intent-emotion]
---

# Nativ (נתיב)

**The best open Hebrew decision model for commercial use (as of October 2026).** Nativ v2 matches or beats
OpenAI's Decisions API on 6 of the 9 tests below and is within 5 points on two more.
It beats Laya multilingual on all 9 (the leading commercially licensed open alternative).
Runs on a laptop CPU.

Give it any Hebrew text, a question and the options, and it returns a probability
for every option in a single forward pass. No generation, no prompt parsing, no GPU.

נתיב (nativ) is Hebrew for "path": the model chooses which way a request should go.

| | |
|---|---|
| Size | 364M parameters ([`dicta-il/neodictabert`](https://huggingface.co/dicta-il/neodictabert) + an option scorer) |
| Speed | ~70 ms per decision on a laptop CPU |
| Output | a probability per option, with its calibration error reported for every task |
| Options | any Hebrew text, 2 to 7 per question |
| License | CC BY 4.0, commercial use allowed |
| Benchmark | [`nativ-bench`](https://huggingface.co/datasets/yoavipo/nativ-bench) |
| Training data | [`hebrew-intent-emotion`](https://huggingface.co/datasets/yoavipo/hebrew-intent-emotion) (translated part) |

## Usage

`decider.py` is included in this repo (requires torch, transformers, safetensors).

```python
from decider import HebrewDecider

nativ = HebrewDecider.from_pretrained("path/to/nativ-he-decision")
nativ.decide(
    state="שלום, ההזמנה שלי הייתה אמורה להגיע ביום שלישי ועדיין לא קיבלתי אותה. אפשר לבדוק מה קורה?",
    question="לאיזו מחלקה להעביר את הפנייה?",
    options=["משלוחים", "החזרות והחלפות", "חיובים ותשלומים", "תמיכה טכנית"],
)
# one probability per option, in the order given
```

- Options are free Hebrew text. Short descriptions work better than label names
  ("לקבוע שעון מעורר" rather than "alarm_set").
- `decide_many` takes a list of `{"state", "question", "options"}` dicts.
- The input is limited to 1,024 tokens. Long states are truncated; the question and options are kept.

## Versions

| version | changes |
|---|---|
| **v2** (October 2026, this one) | new training data: topic, inference (MultiNLI), yes / no questions (BoolQ), Belebele-style reading questions, more policy arithmetic. SIB-200 0.755 → 0.858, HebNLI 0.476 → 0.808, Belebele 0.551 → 0.588|
| v1 (October 2026) | first release; still available as revision `v1` |

To keep using v1, download it with
`huggingface_hub.snapshot_download("yoavipo/nativ-he-decision", revision="v1")`.

## Results

The two nativ-bench tests ([`nativ-bench`](https://huggingface.co/datasets/yoavipo/nativ-bench)) were written for
this benchmark: their messages and thresholds never appear in Nativ's training data. The other seven are public Hebrew test sets.
* 🟢 - marks the tests where Nativ scores highest (or ties).
* Which test datasets each model trained on: Nativ trained on the train splits of MASSIVE, HeQ, OnlpLab and SIB-200
  (the 66 train sentences that are not part of Belebele), and on MultiNLI, which the HebNLI test was translated from
  (every premise in the HebNLI test was left out); never on a validation or test file. Laya-Hebrew trained on HebNLI,
  HeQ and Hebrew sentiment data, among others. OpenAI Decisions and Laya multilingual have not published their
  training data.

### Accuracy (higher is better)

The share of questions answered correctly, from 0 to 1: 0.95 means 95 of every 100 answers are right.

| test (dataset) | **Nativ v2** | OpenAI Decisions | Laya multilingual | Laya-Hebrew | DeepSeek V4 Flash |
|---|---|---|---|---|---|
| what does the user want, 4 options (MASSIVE) | **0.965** 🟢 | 0.925 | 0.644 | 0.887 | 0.905 |
| does the paragraph answer the question (HeQ) | **0.855** 🟢 | 0.737 | 0.582 | 0.694 | 0.847 |
| sentiment of a comment (OnlpLab) | **0.905** 🟢 | 0.865 | 0.680 | 0.822 | 0.838 |
| personal information in a message (nativ-bench) | **0.954** 🟢 | 0.593 | 0.566 | 0.848 | 0.890 |
| does one sentence follow from another (HebNLI) | **0.808** 🟢 | 0.734 | 0.480 | 0.606 | 0.577 |
| topic of a sentence, 7 options (SIB-200) | **0.858** 🟢 | **0.858** | 0.583 | 0.789 | **0.858** |
| request vs policy (nativ-bench) | 0.926 | **0.970** | 0.298 | 0.406 | 0.624 |
| positive / negative / neutral (HebrewSentiment) | 0.656 | 0.699 | 0.429 | **0.830** | 0.611 |
| reading comprehension, 4 options (Belebele) | 0.588 | **0.910** | 0.318 | 0.758 | 0.883 |

### Calibration error (lower is better)

How far the model's confidence is from how often it is actually right, from 0 to 1. When a well-calibrated model
says 0.9, it is right about 90% of the time; an error of 0.10 means its confidence is off by about 10 points on
average. Low error means the probabilities can be trusted as thresholds, for example "send to a person below 0.8".

| test (dataset) | **Nativ v2** | OpenAI Decisions | Laya multilingual | Laya-Hebrew | DeepSeek V4 Flash |
|---|---|---|---|---|---|
| what does the user want (MASSIVE) | **.011** 🟢 | **.011** | .085 | .028 | .050 |
| does the paragraph answer the question (HeQ) | **.019** 🟢 | .140 | .338 | .061 | .096 |
| sentiment of a comment (OnlpLab) | **.009** 🟢 | .076 | .062 | .064 | .132 |
| personal information in a message (nativ-bench) | .078 | .285 | .356 | **.028** | .069 |
| does one sentence follow from another (HebNLI) | .089 | **.062** | .191 | .114 | .242 |
| topic of a sentence (SIB-200) | .072 | **.058** | .112 | .096 | .109 |
| request vs policy (nativ-bench) | .060 | **.038** | .373 | .365 | .311 |
| positive / negative / neutral (HebrewSentiment) | .105 | .128 | .146 | **.062** | .282 |
| reading comprehension (Belebele) | .133 | **.016** | .229 | .026 | .086 |

The models compared:
- [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions) (`gpt-6-luna`, public beta):
  closed, API only, $0.10 per million input tokens. OpenAI has not published its size or training data. Run on the
  full test sets in October 2026.
- [Laya multilingual](https://huggingface.co/convaiinnovations/laya-multilingual): 322M, Apache 2.0. Its training
  data is not published.
- [Laya-Hebrew](https://huggingface.co/RoeiG/laya-hebrew): 378M, CC BY-NC-SA (non-commercial). Trained on HebNLI,
  HeQ, Hebrew sentiment data, GoEmotions, CLINC150, Banking77, RACE, BoolQ and other datasets.
- DeepSeek V4 Flash: a large LLM, zero-shot through an API, scored by the probability of each option's letter. A
  reference point, not a model that runs on a CPU.

Two MIT-licensed zero-shot classifiers were also tested,
[mDeBERTa-v3-xnli](https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7) and
[bge-m3-zeroshot-v2.0-c](https://huggingface.co/MoritzLaurer/bge-m3-zeroshot-v2.0-c), and scored below Nativ on every
test they ran (for example, intent: 0.542 and 0.754).

Speed (lower is better), one decision at a time, fp32 on an Apple M2 Pro CPU: Nativ 70 ms for a short message,
130 ms for a paragraph · Laya-Hebrew 77 / 160 ms.

## What to use it for

| use | question | options |
|---|---|---|
| route a support message | לאיזו מחלקה להעביר את הפנייה? | משלוחים / החזרות / חיובים / תמיכה טכנית |
| catch personal details before logging | האם ההודעה מכילה מידע מזהה אישי? | כן / לא |
| check a request against a policy | האם הבקשה עומדת במדיניות? | עומדת / לא עומדת / חסר מידע |
| check a retrieved passage (RAG) | האם הקטע עונה על השאלה? | כן / לא |
| tag a topic or an intent | מה הנושא של הטקסט? | your own list |
| sentiment of reviews and comments | מה הסנטימנט של התגובה? | חיובית / שלילית / לא קשורה |

A low top probability is a useful signal to hand the case to a person.

## Training

The encoder reads `[CLS] state [SEP] question [SEP] option1 [SEP] option2 [SEP] ...` in one pass; each option is
scored from the [CLS] vector and the mean of its tokens, and a softmax gives the probabilities.

Nativ was distilled (Hinton et al., 2015) from several teachers: a fine-tuned
[DictaLM-3.0-1.7B-Instruct](https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Instruct) (Apache-2.0) for routing,
sentiment, grounded and personal information;
[DeepSeek V4 Flash](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash) (MIT) for intent, emotion, 3-way
sentiment, yes / no questions, topic and the generated reading questions; and DictaLM-3.0-24B-Thinking for the rest
of the reading data. Inference and policy are learned from their gold labels (policy labels are computed in code).
Part of the data was generated, translated or checked by
[DictaLM-3.0-24B-Thinking](https://huggingface.co/dicta-il/DictaLM-3.0-24B-Thinking) and DeepSeek V4 Flash.
During training every item's question and options are reworded at random, so the model learns to read the options.

| task | data | license |
|---|---|---|
| routing | MASSIVE he-IL train (11.5k), Hebrew descriptions of the 60 intents, some labels corrected by hand | CC BY 4.0 |
| sentiment | OnlpLab Hebrew-Sentiment-Data, deduplicated (5.9k) | MIT |
| grounded | HeQ v1.1 train, answerable and unanswerable questions, balanced (15k) | CC BY 4.0 |
| personal information | ~5k template messages rewritten by the 24B, ~2k messages written by the 24B | generated |
| policy | ~21k rule / request pairs, labels computed in code, each rewritten by the 24B or DeepSeek V4 Flash | generated |
| reading | CosmosQA translated to Hebrew (24.8k), questions on HeQ paragraphs (5.1k), questions written by DeepSeek V4 Flash on BoolQ's Hebrew paragraphs (6k) | CC BY 4.0 / CC BY-SA 3.0 / generated |
| inference | MultiNLI train translated to Hebrew by DeepSeek V4 Flash, human labels (19.8k) | OANC / CC BY 3.0 / CC BY-SA 3.0 / MIT |
| yes / no questions | BoolQ translated to Hebrew by DeepSeek V4 Flash (6.9k) | CC BY-SA 3.0 |
| topic | SIB-200 heb_Hebr train (66 sentences) and 10.1k sentences from the sources above, labelled by DeepSeek V4 Flash over 18 topics | CC BY-SA 4.0 / as the sources |
| intent | CLINC150 (11.9k) and Banking77 (10k), translated to Hebrew; 2 to 7 options per item from 228 intents | CC BY 3.0 / CC BY 4.0 |
| emotion | GoEmotions single-label comments, translated to Hebrew (5.8k); 2 to 7 options from 28 emotions | Apache 2.0 |
| sentiment with neutral | 12k texts from the sources above, labelled positive / negative / neutral by DeepSeek V4 Flash | as the sources |

Generated and translated data were filtered for answer shortcuts, changed facts and broken translations. The Hebrew
translations of CLINC150, Banking77 and GoEmotions are published as
[`hebrew-intent-emotion`](https://huggingface.co/datasets/yoavipo/hebrew-intent-emotion).

## Limitations
- Reading comprehension is the weakest task - this comes partly from the size limit of the model and partly from
  how little reading data is licensed for commercial use.
- Whether something counts as personal information depends on the application (order numbers, for example).
  Adjust the threshold or the options.
- The current version supports Hebrew only (text with a little English in it is fine).

## License
CC BY 4.0, as [`dicta-il/neodictabert`](https://huggingface.co/dicta-il/neodictabert). Training data: MASSIVE
(Amazon, CC BY 4.0), HeQ (NNLP-IL, CC BY 4.0), OnlpLab Hebrew-Sentiment-Data (MIT), CosmosQA (AllenAI, CC BY 4.0),
CLINC150 (CC BY 3.0), Banking77 (PolyAI, CC BY 4.0), GoEmotions (Google, Apache 2.0), MultiNLI (NYU; OANC, CC BY 3.0,
CC BY-SA 3.0 and MIT), BoolQ (Google, CC BY-SA 3.0), SIB-200 train (CC BY-SA 4.0), and data generated with DictaLM-3.0
models (Dicta, Apache-2.0) and DeepSeek V4 Flash (MIT). Belebele (Meta, CC BY-SA 4.0), HebrewSentiment, HebNLI and
the SIB-200 test were used for evaluation only.
