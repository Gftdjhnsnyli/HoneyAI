# HoneyAI — Session Dialogue

> Exported: 2026-10-10. Full Q&A transcript of this session.

---

## 1. Prepare a gitignore file

**User:** preppare a gitignore file and put anything that is not necessary in pushing github

**Assistant:** Created `.gitignore` for the Electron + Vite + TypeScript project.

Ignored (won't be pushed):
- `node_modules/` (was untracked, now ignored)
- `out/` (electron-vite build output)
- `release/`, `dist/` + `*.exe`, `*.msi`, `*.dmg`, etc. (electron-builder output)
- Logs (`*.log`, `npm-debug.log*`), `*.tsbuildinfo`, `.cache/`, `coverage/`
- Secrets: `.env`, `.env.*`, `*.pem`, `*.key`
- OS junk: `.DS_Store`, `Thumbs.db`, `Desktop.ini`
- IDE: `.vscode/` (except extensions.json), `.idea/`, `*.code-workspace`
- Temp: `*.tmp`, `*.swp`

Kept (will be pushed) — verified with `git check-ignore`:
- `src/`, `assets/` (PS1 scripts + images are runtime `extraResources`), `build/*.ico` (installer icon), `scripts/`, `package.json`, `package-lock.json`, configs

Note: `op.md` looked like scratch AI notes — offered to ignore/delete it before first push.

---

## 2. Checkout the code and list functionalities

**User:** now checkout the codes and tell me what are the functionalities?

**Assistant summary:** Honey is a Windows Electron desktop companion (Electron 33 + React 18 + Vite 5 + TS, no native modules, PowerShell 5.1 helpers in `assets/*.ps1`).

- **Two-window shell** (`src/main/index.ts`, `main.tsx`): transparent always-on-top pet (210×190) + hub chat (64×64 FAB → 400×600 chat), ghost/click-through mode, `Ctrl+Alt+M`, tray, `prefs.json`.
- **Animated pet** (`PetStage.tsx` + `mate.css`): robot/cat/blob, 4 glows, 3 sizes, moods/overlays, cursor-tracked gaze, wander, idle life, `BroadcastChannel` bus pet ↔ chat. Polite mode tucks away on typing/fullscreen; movie-joke mode on fullscreen video.
- **Chat brain** (`HubStage.tsx` + `brain.ts`): offline regex skills (sing/dance/sleep/wake, rename, theme/species/size, time/date, pomodoro, reminders, voice toggle, help) → cloud AI fallback (Gemini 2.0 Flash → OpenRouter llama-3.1-8b:free → Pollinations keyless).
- **OS/media integration** (`main/index.ts` + `preload/index.ts`): media DJ (`media-probe/control.ps1`), Spotify protocol + web fallback, allowlisted web (`open.spotify.com/www.youtube.com/www.google.com`), PC actions (open 4 folders, launch notepad/calc/mspaint/wt.exe, window minimize/maximize/close, lock, screenshot to `Pictures/Honey`, notify), SAPI voice (`speak.ps1`), ambient `watch.ps1` (`WIN=/TYPING=/FULLSCREEN=`), 50-min stretch nudge.
- **Assets/tooling:** `assets/honey.png` + PS1 scripts as `extraResources`, `build/honey.ico`, `scripts/make-icon.cjs` zero-dep PNG→ICO generator, `npm run dev / build / typecheck / dist` (unsigned NSIS).

---

## 3. All embedded links, APIs, third-party tokens

**User:** spot out all the link embedded, all the api and any third-party tokenin the codes, i wanna be aware with them

**Assistant findings:**

Hardcoded links (app behavior):
| Where | URL / protocol | Use |
|---|---|---|
| `src/main/index.ts:357` | `https://ourcineverse.web.app/` | `mate:open-site` (later removed) |
| `src/main/index.ts:381` | `spotify:search:{query}` | installed Spotify app search |
| `src/main/index.ts:386` | `https://open.spotify.com/search/{query}` | fallback if protocol fails |
| `src/main/index.ts:467` | `spotify:` | launch Spotify + autoplay |
| `HubStage.tsx:211,220` | `https://www.youtube.com/results?search_query={q}` | `play X on youtube` / `youtube X` |
| `HubStage.tsx:218` | `https://www.google.com/search?q={q}` | `google/search …` |
| `HubStage.tsx:408` label | `aistudio.google.com/apikey` | hint text only, not fetched |

Gate: `URL_HOSTS = ['open.spotify.com','www.youtube.com','www.google.com']` — `mate:open-url` allows only `https:` + those hosts.

Network APIs:
- `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={geminiKey}` — primary brain, user key in query, 30s timeout.
- `POST https://openrouter.ai/api/v1/chat/completions` (`meta-llama/llama-3.1-8b-instruct:free`, `Bearer {routerKey}`) — second brain.
- `GET https://text.pollinations.ai/{prompt}?model=openai|openai-fast&private=true&seed=` — keyless fallback. Renderer copy in `brain.ts` (+`mistral`); CSP `connect-src 'self' https://text.pollinations.ai` in `index.html:5` permits it.
- `package-lock.json` `https://registry.npmjs.org/…` = build-time npm only.

Tokens/secrets: **none hardcoded.** Keys are runtime user input (Settings → `localStorage` `honey-settings-v1` `geminiKey`/`routerKey`, plaintext) sent per-message via `window.mate.ask()`. Pollinations puts prompt in URL. No `.env` file.

---

## 4. What each link does

**User:** explain what does each link respond to? like what are their function or necessity ?

**Assistant:**
1. `ourcineverse.web.app` — `cineverse` / `open site` → opens Cine-Verse site. Low necessity, legacy (removed below).
2. `spotify:search:{q}` — `play <song>` → deep-link into Spotify desktop app. Core DJ path.
3. `open.spotify.com/search/{q}` — same command fallback when app missing. Compatibility shim.
4. `spotify:` — `open/play/start spotify` → launch + autoplay after 2.5s.
5. `youtube.com/results?search_query=` — `play X on youtube` / `youtube X` → browser search.
6. `google.com/search?q=` — `google …` → browser search.
7. `generativelanguage…gemini-2.0-flash` — unmatched chat with Gemini key → primary cloud brain (main process, no CORS).
8. `openrouter.ai…` — same unmatched chat with OpenRouter key → second brain.
9. `text.pollinations.ai…` — same unmatched chat, keyless last resort. Why Honey talks with zero setup.

---

## 5. Remove the cineverse link

**User:** remove the cineverse link

**Assistant:** Deleted 4 code spots, typecheck passed:
- `src/main/index.ts:357` — `mate:open-site` handler + URL
- `src/preload/index.ts` — `openSite` in `MateApi` + implementation
- `src/renderer/src/brain.ts` — `cineverse / open site` skill branch
- `src/renderer/src/HubStage.tsx` — `openSite()` call

**User:** yes (confirm removing README mention)

**Assistant:** `README.md:3` reworded from "Standalone Electron app (separate from the `cine-verse` web project)." → "Standalone Electron Windows desktop companion." Zero `cineverse` references remain.

---

## 6. Does the app act like an agent? All functionalities

**User:** does this app act like agent helper too? tell me its all functionalities

**Assistant:** No — scripted companion + command dispatcher, not an autonomous agent. One line → one regex → one fixed action. No planning, looping, arbitrary code/file/web access. The "AI" returns text only.

Full list:
1. **Presence:** overlay pet + hub, cursor eyes, drag, wander, idle sleep, ghost mode, tray, autostart, single-instance.
2. **Chat brain:** offline regex skills + cloud cascade (Gemini → OpenRouter → Pollinations).
3. **Productivity:** pomodoro, reminders, notes (50 cap), clipboard read, battery/RAM/CPU.
4. **System (allowlist):** launch 4 apps, open 4 folders, window min/max/close, lock, screenshot, toast.
5. **Media DJ:** Spotify search/open/close, now-playing probe, play/pause/next/prev/stop/vol/mute, mood commentary.
6. **Web shortcuts:** google/youtube (allowlisted hosts only).
7. **Fun/personalization:** species/glows/sizes, names, moods, jokes, number-hunt + RPS + trophies, SAPI voice, quips, app-aware reactions, movie mode, stretch nudges, greetings.
8. **Can't do:** file editing, free terminal, web fetching, multi-step tasks, memory beyond names/notes/scores.

---

## 7. Upgrade options (own model, PC navigation, voice, typing assist)

**User:** do i have an option to create a separate model and intergrate it here? tell me the options i have if i wanna upgrade it to have more funtions like navigate through my computer, listen to my voice and perform the tasks like "hey honey, open Movies folder" or even assist me on task like typing.

**Assistant options:**
- **A — No model (quick win):** `FOLDERS` allowlist is why "open Movies" fails. Add `videos`/custom folders setting + `shell.openPath`, `nut.js` keystroke injection. Touch `main/index.ts`, `preload/index.ts`, `HubStage.tsx`.
- **B — Local model + voice (private, recommended):** Ollama sidecar (`phi-3-mini/qwen2.5-3b/llama-3.1-8b`) with function-calling → existing `window.mate.*` tools. Hear: `getUserMedia` + local Whisper (`whisper.cpp`/`transformers.js`); wake-word later via Porcupine/openWakeWord. Speak: keep SAPI or upgrade to Piper. ~2–4GB RAM, ~1–2s CPU latency, no bills.
- **C — Cloud agent:** OpenAI/Claude/Gemini tool_use in `askAI()`, Deepgram/Whisper-API STT. Smartest typing assist, costs $/min + mic goes to cloud.
- **D — Custom trained model:** fine-tune small intent classifier (see §8), not a full LLM.
- Recommendation: A now → push-to-talk + Whisper-tiny → Ollama tools + `nut.js` + file search, with confirm step for destructive actions. Offered to implement step 1 or draft Ollama design.

---

## 8. Transfer learning a model

**User:** what if i do transfer training in a certain model?

**Assistant:**
1. **Intent classifier (best ROI):** fine-tune DistilBERT/MiniLM (~250MB, ~20ms CPU) on 300–1,000 of your commands (20 intents × 30 examples). Colab T4 ~15 min, freeze backbone + train head. Export ONNX → `onnxruntime-node`/`transformers.js`, replaces `runSkills()` with `{intent, confidence}` (<0.7 → regex/LLM fallback).
2. **Voice personalization:** fine-tune Whisper tiny/base on 30–60 min of your voice; wake-word via Porcupine enroll (3 samples → `.ppn`) or openWakeWord (~100 pos + 500 neg clips).
3. **Chat LLM LoRA (usually skip):** needs 5k–50k pairs, 12GB+ VRAM, ~2–4GB ship, forgetting risk — system prompt already covers persona.
4. **Voice cloning:** Piper/XTTS on ~5 min audio — fun, low task value.
- Plug-in: `mic → wake-word.onnx → whisper-ft → intent.onnx → window.mate.* tools / askAI()`. Add a command logger (`{q, tool}` JSONL) now to build the dataset; version models (`intent-v3.onnx`).
- Offered to add the logger + ONNX scaffold.
