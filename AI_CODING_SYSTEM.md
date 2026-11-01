# The VUX AI Coding System

How the Chat and Studio assistants work, what changed, and how to improve them.

---

## The honest starting point

The assistants call hosted services. **Those model weights cannot be fine-tuned
from inside this app.** Any plan that claims otherwise is a plan that will not
ship. The product presents one assistant, and the service that answered is
never named to the user.

What *does* move code quality is the system built around the model. A hosted
model with a good system around it beats a bigger model with a bad one, every
time. That system is what this document describes.

There is a second path, and it is real: the local **LoRA training pipeline**
in `training/`. You can fine-tune a small open model on your own approved
work and serve it. That pipeline is now wired end to end, with the dataset
loop and the evaluation loop that make it measurable. See `training/README.md`.

---

## The pipeline

```
user request
    │
    ▼
analyze          lib/codeIntent.js        what is being asked? which language?
    │
    ▼
select context   lib/codeContext.js       which workspace files matter?
    │
    ▼
build prompt     lib/promptBuilder.js     rules for the language + action contract
    │
    ▼
call provider    lib/providers.js         DeepSeek → HF → Gemini → Cloudflare
    │
    ▼
parse + validate lib/studioAgent.js       is this a safe, well-formed action?
    │
    ▼
action           { edit | create | delete | create_folder | delete_folder | answer }
    │
    ▼
user approves → filesystem → /api/training/collect → training data
```

Every step except the provider call is deterministic and unit tested.

---

## The language rules layer

`lib/languageProfiles.js` holds a curated ruleset for **24 languages**:
JavaScript, TypeScript, React/JSX, HTML, CSS, Python, Java, C, C++, C#,
Go, Rust, Ruby, PHP, Kotlin, Swift, Shell, SQL, Dart, Lua, Elixir, JSON,
YAML, Docker.

Each profile carries the conventions that models most often get wrong, plus
the toolchain commands for that ecosystem:

```js
{
  id: 'rust',
  label: 'Rust',
  extensions: ['.rs'],
  markers: ['rust', 'cargo', 'borrow checker'],
  rules: [
    'Model failure with Result and Option instead of panics; avoid unwrap and expect outside tests.',
    'Use ? for error propagation and keep error types meaningful with thiserror or anyhow.',
    // ...
  ],
  commands: { run: 'cargo run', test: 'cargo test', build: 'cargo build --release' },
}
```

The rules are short on purpose. A wall of rules dilutes attention; a dozen
sharp ones do not. Rules are selected by what the **user named**, then the
**open file**, then the **dominant workspace language** — so a Python file
gets Python rules even in a mixed repository.

---

## What was actually broken

### 1. The scrubber was corrupting every code response

`lib/identity.js` used to replace bare words anywhere in a response:

```js
/\b(?:internal|private|secret|credential|token|key)\b/gi  ->  'VUX AI'
```

The result, before this work:

```
IN : const token = jwt.sign(payload, secret);
OUT: const VUX AI = jwt.sign(payload, VUX AI);
```

That is a syntax error. **Every** code response that touched a token, key,
secret, credential, or password was destroyed before it reached the editor.
This was the single highest-impact defect in the assistant.

The fix is in `lib/secretScrubber.js`. It does two precise things instead of
word replacement:

- **Secret redaction** — removes values that actually look like credentials
  (`sk-…`, `hf_…`, JWTs, PEM blocks, `const password = "…"`), keeping the
  surrounding code valid.
- **Provider-claim scrubbing** — only fires inside a sentence that claims a
  provider identity ("I am powered by X"). A sentence that merely discusses a
  model by name is left alone.

Regression test: `tests/secret-scrubber.test.js`.

### 2. The Studio was sending the branding prompt to a coding model

Every request — including code edits — was prefixed with the full identity
prompt: team biographies, menu descriptions, privacy boilerplate. The
biographies are dead weight in a code answer, and the privacy rules
("never reveal passwords, secret keys, tokens") make the model hesitant to
write ordinary code that *handles* keys and tokens.

`routes/chat.js` now routes coding requests to a dedicated coding prompt and
leaves the identity prompt for brand and general questions.

### 3. The Studio assistant had no memory and no context

The old Studio sent a single message with the file list and the current file.
A follow-up like "now make it responsive" had nothing to refer to, and the
model could not find `login.js` when the user said "fix the login bug".

The agent now keeps conversation history, ranks workspace files by relevance,
and injects the most relevant ones within a character budget.

### 4. The prompt was one unreadable string in the UI

The Studio's instructions lived in a ~1,200 character template literal inside
`Studio.jsx`. It could not be tested, adapted, or evolved without touching
the UI. It now lives in `lib/promptBuilder.js`, assembled from parts.

---

## The model layer

`lib/aiProviders.js` is the single place that answers "which service serves
this". Every capability - text, coding, image, image edit, video, music,
speech in, speech out, embeddings - has one ordered list of providers, and
every attempt returns the same shape. A route never needs to know which
service answered.

Each provider file is named after the models it serves, so the file list
shows which models are in play.

| Module | Service | Models |
|---|---|---|
| `lib/cloudflare.js` | Workers AI | Llama 3.2 3B, Qwen 3.8 27B, Qwen 2.5 Coder 32B, FLUX.1 Schnell, SDXL, BGE-M3, Stable Video Diffusion, Music v2 |
| `lib/gemini-flash.js` | Google AI Studio | Gemini Flash, Gemma 4, Gemini Embedding 001, Gemini image |
| `lib/llama-whisper.js` | Groq | Qwen 3.8, Llama 3.3/3.4, GPT-OSS, Whisper-large-v3-turbo, PlayAI TTS |
| `lib/flux-sdxl.js` | fal.ai | FLUX.1 Schnell, FLUX.1 Pro Kontext, SDXL, Kling Video, Stable Audio, PlayHT TTS, Wizper |
| `lib/bge-m3-flux.js` | Hugging Face | Gemma 4 12B, DeepSeek-V3.2, FLUX.1 Krea Dev, BGE-M3, Qwen2.5-VL 7B |
| `lib/pollinations.js` | free speech only, no credential | Piper, Kokoro |
| `lib/hunyuan3d-2.js` | Hugging Face Space | Hunyuan3D-2, TRELLIS |

Two rules decide the order:

1. **A service that answers fast goes first.** A late answer is worth
   nothing to the person waiting.
2. **A service that needs no credential goes last** for speech. It is the
   safety net that catches the request when every other provider is out of
   quota.

Image generation has no free fallback any more. It runs on the configured
Cloudflare quality models first and the paid fallbacks after, and the render
carries the prompt with no branding, watermark, or badge.

A provider without a credential is skipped, not attempted. A provider that
is refused for a billing reason says so plainly, because "User is locked.
Reason: TOP_UP." is a different problem from a code fault.

Check the state of every provider with:

```bash
node tools/probe-providers.mjs
```

---

## Layout

| File | Responsibility |
|---|---|
| `lib/languageProfiles.js` | Per-language rules, detection, toolchain commands |
| `lib/codeIntent.js` | Intent classification, language detection, request analysis |
| `lib/codeContext.js` | File relevance ranking and budgeted context assembly |
| `lib/promptBuilder.js` | System and user prompt assembly |
| `lib/providers.js` | All provider calls and the fallback chain |
| `lib/studioAgent.js` | Action parsing, path/action validation, orchestration |
| `lib/secretScrubber.js` | Secret redaction and provider-leak defence |
| `lib/memory.js` | Remembering what the user asked to remember, and recalling it |
| `lib/memoryStore.js` | The memory index: words, keywords, and vectors on disk |
| `lib/hunyuan3d-2.js` | 3D models built by a Hugging Face Space |
| `routes/code.js` | `POST /api/code`, `POST /api/code/analyze` |
| `routes/chat.js` | General chat, now with a code-aware prompt |
| `routes/memory.js` | `GET /api/memory`, `DELETE /api/memory` |
| `routes/training.js` | Dataset management and the `/collect` loop |

---

## 3D generation

A model is built by whichever provider answers first:

1. **Tripo** - the paid service, the best result.
2. **A Hugging Face Space** - a Gradio app, so it is called with the Gradio
   client. The endpoint and its parameters are read from the Space itself
   instead of being hardcoded, so the same code works with a text-to-3D
   Space, an image-to-3D Space, or a Space that does both. It needs no
   credit balance, so it answers when Tripo cannot.
3. **Threestudio or Trellis** - a service running on your own machine.

The hosted Hunyuan3D-2 demo has text-to-3D switched off and answers with
"Text to 3D is disable". Name a Space that answers a prompt in
`HF_3D_TEXT_SPACE` and it is used for text; image-to-3D works on the hosted
demo as it is.

When no provider can answer, the reason of each one is reported together.
One reason is not enough to tell whether the problem is the credit balance
or the Space itself.

---

## Memory

The chat remembers what the user asks it to remember. There is no panel to
fill in and no button to press.

> "Remember these related words: quantum, photon, entropy"

The words are pulled out of the sentence, turned into embeddings, and stored
in `~/.vux-ai-studio/memory/memory.db` together with the keywords they were
indexed by. Later, a message that is close to one of those memories - by
meaning through the vector, or by keyword when no embedding service is
reachable - brings the memory back and hands it to the model as context.

Three rules keep this from becoming noise:

1. **A question is not an instruction.** "What did I ask you to remember?" asks
   about the memory; it does not create one.
2. **The embedding service is optional.** When it is over its daily limit or
   out of credits, the service is left alone for a while and the memory is
   matched by keyword instead. A chat answer is never held up by it.
3. **Everything can be forgotten.** `DELETE /api/memory` clears the index.

---

## API

### `POST /api/code`

```jsonc
{
  "request": "Fix the null check in login.js",
  "activeFile": "login.js",
  "files": { "login.js": "..." },
  "folders": ["src"],
  "history": [{ "role": "user", "content": "..." }],
  "mode": "auto"            // or "plan"
}
```

Response:

```jsonc
{
  "action": { "action": "edit", "filename": "login.js", "content": "..." },
  "meta": {
    "intent": "fix",
    "languages": ["javascript"],
    "contextFiles": ["login.js"],
    "provider": "primary"
  }
}
```

The action is **proposed**, never applied. The client asks the user to approve.

### `POST /api/code/analyze`

Reports the detected intent, languages, and framework without calling a
model. Useful for the UI and for debugging a prompt.

### `POST /api/training/collect`

Captures an approved edit as a training example, rebuilding the system and
user messages with the same prompt builder the agent uses.

---

## Safety

- Actions are validated server-side before they can touch the filesystem:
  absolute paths, `..` segments, protected directories, and unknown files are
  rejected, and the user is told the change was rejected.
- Deletions require a reason and still need user confirmation in the client.
- Content over 1 MB is refused.
- The provider never sees the workspace outside the files selected for it.

---

## Measuring it

```bash
npm run dev       # server on :3001
npm run eval      # score the live agent against the golden set
npm test          # 130+ unit tests
```

`training/evaluation/coding_tests.jsonl` is a golden set of 16 cases across 14
languages. Each case has a workspace fixture, a request, and assertions on
the expected action and the expected content. `npm run eval` runs the live
agent against it, reports a per-language pass rate, writes
`training/evaluation/results.jsonl`, and exits non-zero below the threshold so
it can gate a release.

This is the point of the whole system. Without a measurement, "the AI is
better now" is a feeling, and it will silently regress the next time someone
touches a prompt.

---

## Improving it

1. **Add a language.** Append a profile to `lib/languageProfiles.js` with
   `extensions`, `markers`, `rules`, and `commands`. `tests/language-profiles.test.js`
   checks the shape of every profile.
2. **Add a rule.** Rules are plain strings in a profile. Keep them sharp.
3. **Add an intent.** Add it to `INTENTS` in `lib/codeIntent.js` and give it
   guidance in `INTENT_GUIDANCE` in `lib/promptBuilder.js`.
4. **Add a golden case.** Append to `training/evaluation/coding_tests.jsonl`
   with the fixture, the request, and the assertions. Keep the coverage
   balanced across languages so one language cannot dominate the score.
5. **Measure before and after.** `npm run eval` before, change something,
   `npm run eval` after. Keep the better one.
