# AI Training Toolkit (basic, fast, local-first)

This is a lightweight training layer for Vux AI Studio. It keeps all datasets,
checkpoints and adapters **server-side/private** (stored in `~/.vux-ai-studio/ai-training`,
never served by the web app) and exposes only job status via `/api/training`.

## Files

- `python/validate_jsonl.py` - validate JSONL datasets.
- `python/train_coding.py` - LoRA SFT (CPU works for tiny models; GPU recommended).
- `python/evaluate.py` - run fixed prompt set, append results.
- `python/test_generation.py` - smoke test an adapter.
- `python/update_knowledge.py` - safe daily-update scheduler skeleton.
- `python/router.py` - task router demo.
- `config/coding.yaml` - sample config.

## Quick start (local CPU)

```bash
cd training
python -m pip install -r requirements-cpu.txt   # or requirements.txt on GPU machine
cd ..
python training/python/validate_jsonl.py data/train/coding.jsonl data/validation/coding.jsonl
python training/python/train_coding.py
BASE_MODEL=Qwen/Qwen2.5-0.5B-Instruct ADAPTER_DIR=outputs/coding/adapter python training/python/test_generation.py
```

## Using the backend API

```bash
# start server
npm run dev
# upload a dataset
curl -X POST http://127.0.0.1:3001/api/training/datasets \
  -H 'Content-Type: application/json' \
  -d '{"name":"coding.jsonl","content":"...jsonl..."}'
# validate
curl -X POST http://127.0.0.1:3001/api/training/validate -H 'Content-Type: application/json' -d '{"name":"coding.jsonl"}'
# start training
curl -X POST http://127.0.0.1:3001/api/training/jobs -H 'Content-Type: application/json' \
  -d '{"baseModel":"Qwen/Qwen2.5-0.5B-Instruct","trainFile":"coding.jsonl","validFile":"coding.jsonl","epochs":1}'
# status / log
curl http://127.0.0.1:3001/api/training/jobs
curl http://127.0.0.1:3001/api/training/jobs/<id>/log
```

Training files are never exposed over HTTP: datasets/adapters live outside the
static roots and there is no download endpoint.

## No GPU? Free options

- **Google Colab**: free T4 GPU (12-15h). Use `training/requirements.txt` and upload datasets. Save adapters to Google Drive.
- **Kaggle Notebooks**: 30h/week free GPU. Same scripts.
- **Hugging Face Spaces (ZeroGPU)**: free GPU for demos/inference; not for long training.
- **Lightning AI / Modal free tiers**: limited free GPU hours.
- **CPU fallback**: use 0.5B models, seq length 256-512, batch size 1, 1 epoch.
  Good for proving the pipeline works; not enough for strong assistants.
- **API fine-tuning** (no GPU needed): OpenAI/Together/Hugging Face AutoTrain handle compute;
  you upload JSONL and receive an adapter/endpoint. Cost-based, not free tiers mostly.

Recommendation: validate your pipeline on CPU locally, then run real training in
Colab/Kaggle, then move adapters back into the server-side artifact store.
