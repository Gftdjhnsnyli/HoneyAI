# Honey — Operation Plan (op.md)

## Current state
- Electron 33 + React 18 + Vite 5 + TS. Two windows: pet overlay (210×190) + hub chat (64×64 → 400×600).
- Offline regex brain (`brain.ts`) → cloud cascade (Gemini → OpenRouter → Pollinations) in `main/index.ts:askAI`.
- Allowlisted OS actions only: 4 folders, 4 apps, 3 web hosts. SAPI voice, media keys, screenshots to `Pictures/Honey`.
- Cineverse link removed. `.gitignore` in place. Unsigned NSIS installer via `npm run dist`.

## Phase 1 — No-model wins (START HERE)
1. **Custom folders:** replace hardcoded `FOLDERS = downloads/documents/desktop/pictures` with defaults + user settings (Movies/Videos, Music, + custom `name → path`, validated under user profile). Fixes "hey honey, open Movies folder".
2. **Command logger:** every chat line appends `{q, tool, args, ok, ts}` JSONL to `userData/logs/commands.jsonl`. Builds the dataset for Phase 2 transfer learning.
3. **Push-to-talk voice (scaffold):** mic button in Hub → `getUserMedia` + local Whisper `tiny.en` → text feeds existing regex brain. No wake-word yet.
4. **Typing assist (basic):** `nut.js` `keyboard.type()` + clipboard paste for dictation, gated by "say yes to confirm".
- Exit criteria: voice → "open Movies" works on your PC from installed build.

## Phase 2 — Transfer-train the small stuff
1. **Intent classifier:** fine-tune `MiniLM-L6`/`DistilBERT` (~250MB, ~20ms CPU) on 300–1,000 commands from Phase-1 logs (20 intents × 30 examples). Colab T4 ~15 min, freeze backbone.
2. **Ship as ONNX** (~30MB) via `onnxruntime-node`; replaces `runSkills()`. Confidence < 0.7 → regex → cloud LLM fallback. Version files (`intent-v3.onnx`).
3. **Voice personalization:** fine-tune Whisper on 30–60 min of your voice only if base mishears; wake-word "hey honey" via Porcupine enroll (`.ppn`), not from scratch.
4. **Skip:** LLM LoRA persona, voice cloning.
- Exit criteria: rephrased commands ("go to my films", "take me to movies") all map correctly, offline.

## Phase 3 — Local agent brain
1. **Ollama sidecar** (`qwen2.5-3b` / `phi-3-mini`) with function-calling over existing tools: `openFolder, launch, media, typeText, screenshot, sysinfo, notify`.
2. System prompt + tool schemas in `main/index.ts`; execution stays in current IPC handlers. Keep Gemini/Pollinations as chat-only fallback, never tool deciders.
3. **Safety:** allowlist + confirm for delete/type/send, log every tool call in chat, keep `contextIsolation` posture.
- Exit criteria: multi-command tasks ("open Movies and play davido") work with confirmation.

 True background auto-update needs electron-updater + a feed (GitHub Releases) added to package.json build config — I left that as a Phase-3 packaging task since it needs a repo to publish to. When you're ready, say the word and I'll wire it.
