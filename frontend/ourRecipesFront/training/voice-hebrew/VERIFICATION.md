# What was actually verified

Checked 2026-11-11 on the cloud Linux workspace. This is a **training material package**, not a released cooking model.

- **10 stdlib unit tests:** recipe/exact-utterance split leaks, synthetic provenance, invalid state/IDs/evidence, partial/correction labels, ambiguous and prior-recipe examples, confidence abstention, over-completion metrics, task-specific masks, human-review import and Python syntax/unexecuted state of notebook cells.
- **Actual pinned DictaBERT weights, CPU:** two optimizer steps using PyTorch 2.6.0+cpu / Transformers 4.48.3 / Python 3.12.14. Forced interruption after the first completed checkpoint and resumption produced exactly the same safetensors SHA-256 as an uninterrupted two-step run. `verification/cpu-resume.json` records the source and corpus hashes. This is a mechanics test, not a useful trained model.
- **Actual native ONNX export:** 179,151,172 B FP32, 44,973,125 B reduced-range INT8, plus tokenizer/runtime. Four tensor batches, ten queries, dynamic batch/sequence axes. FP32 numerical parity and task-masked label agreement on these fixtures. Full semantic quality must be evaluated after a real training run.
- **Actual browser graph inference:** headless cloud Chromium 156, ORT Web 1.30.0 WASM, one thread. On the tested INT8 artifact, load ~191 ms and tensor batches of 1–4 queries ~27–55 ms. These are cached/local server measurements on an undertrained model; not download time, tokenizer time, full recipe conversation latency, or physical phone measurements.
- **Native vs browser:** zero label/confidence-decision disagreements in the fixtures. FP32 max logit drift ~1.23e-7. INT8 max drift ~0.0039, despite matching decisions. Different native/WASM quantized kernels can differ numerically; the harness records drift and checks decisions. This small check does not certify all input shapes or semantic accuracy. The browser used Python-pretokenized inputs, so browser tokenizer parity remains untested.
- **Real native INT8 validation plumbing:** 120 validation conversations were scored. After only two training steps, the selected conservative threshold resulted in **zero proposed updates and zero update recall**. It is not usable. This confirms the reports do not confuse an abstain-on-everything model with a successful assistant. The 120 held-out **test** conversations were not used for these checks.
- **Modal:** SDK 1.6.3 import/decorator validation and CLI argument help were checked locally. No account authentication, image build, remote CPU/GPU call, credit use or provider billing measurement. The launcher's CPU prefetch and GPU/Volume behavior still require the first explicit account run.
- **Colab:** notebook JSON and all Python cells were inspected/parsed; no stored outputs or execution counts. The official `google-colab-cli` 0.8.0 was installed, its official operator skill read, and OAuth completed with the user’s Google authorization. Read-only `sessions` and `usage` calls succeeded. Credentials are stored owner-only outside the repository; no identity, token or account balance is included in this package. No Colab VM, Drive mount or GPU job was started; free GPU availability is unverified.
- No production application, timer, Capacitor or native mobile file was modified. No user recordings or production recipe records were collected. Only public model weights were downloaded locally for the CPU checks.

Raw compact evidence is in `verification/materials.json`, `cpu-resume.json`, `browser.json`, and `export.json`. Model weights/checkpoints are deliberately excluded from Git and from the training-material ZIP. The export report is emitted before the separate browser harness; `browser.json` is the later browser evidence, not a claim that the exporter itself ran a browser.

Reproduce local checks (from this folder):

```sh
python3 -m unittest discover -s tests -v
# Optional real-weights mechanics test, after installing CPU torch + requirements:
python tests/ml_smoke.py /tmp/voice-training-smoke-new
python export.py /tmp/voice-training-smoke-new/full
python evaluate.py /tmp/voice-training-smoke-new/full --split validation --onnx
# From frontend/ourRecipesFront, after npm run voice:prepare:
node training/voice-hebrew/browser-smoke.mjs /tmp/voice-training-smoke-new/full/onnx
```

Use fresh output directories. Published package prices are estimates/configuration inputs, not measured charges. Corpus examples are synthetic and not human-reviewed; adding independent Hebrew examples and physical-device testing is necessary before making a usability claim.
