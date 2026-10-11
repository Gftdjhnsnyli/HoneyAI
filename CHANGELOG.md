# HoneyAI — Session Changelog (v1.0.0 → v1.1.0)

Everything changed this session, newest last. Reinstall `release\Honey Setup 1.1.0.exe` to get it all.

## Project setup
- **`.gitignore` (new)** — covers `node_modules/`, `out/`, `release/`, `dist/`, installers (`*.exe`…), logs, `.env`/secrets, OS junk, IDE dirs, coverage, temp files. Source, `assets/`, `build/*.ico`, `scripts/`, configs all still tracked.
- **`dialogue.md` (new)** — full Q&A transcript of the session.

## Cleanup
- **Cineverse link removed** — deleted the `mate:open-site` handler + `https://ourcineverse.web.app/` (`src/main/index.ts`), `openSite` from the preload bridge (`src/preload/index.ts`), the `cineverse / open site` skill (`src/renderer/src/brain.ts`), its call site (`HubStage.tsx`), and reworded the `README.md` mention. Zero `cineverse` references remain in code/docs.
- Leftover `cine.png` / `cine.ico` files and legacy `cinemate-*` localStorage keys intentionally kept (harmless, backward compatible).

## Critical bug fixes
- **Invisible app — missing build config (the ghosting bug).** The project had no `electron.vite.config.ts`, so the React plugin never loaded and the bundle shipped classic `React.createElement` calls with no React in scope → both windows crashed blank (`ReferenceError: React is not defined`, caught in the flight log). Created `electron.vite.config.ts` (react plugin + `externalizeDepsPlugin`); verified the bundle now uses `react-jsx-runtime`.
- **Ghost-mode sync bug (caught by the new smoke test).** `getClickThrough()` used `invoke` against an `ipcMain.on` handler — every call rejected. Now a proper `ipcMain.handle`, so the Settings checkbox reflects reality.
- **Media false positive.** The probe treated *any* browser tab as "now playing" (your `heisbaed/cine-mate at master` GitHub tab showed up as music with ♪). `assets/media-probe.ps1` now only counts browser titles with playback markers (youtube, spotify, music, video, radio, podcast, …). Verified: returns `NONE` with nothing playing.

## Visibility & rescue (from the ghosting saga)
- `src/main/index.ts`: force-`show()` + `moveTop()` on launch, first-run auto-open chat + "Honey is running" toast, **`Ctrl+Alt+H` reveal** (re-anchors pet bottom-right, opens chat), tray right-click menu (Open chat / Find Honey / Quit).
- Diagnostics: `logs/startup.log` flight recorder (boot, load, visibility audit, updater errors) + `HONEY_OPAQUE=1` framed-window debug mode + `scripts/measure-eye.cjs` tooling.

## Phase 1 — local power features
- **Custom folders** — built-ins extended to `videos`/`music` + aliases (`movies/films→videos`, `songs→music`, `photos→pictures`); user-defined `name → path` list in Settings; `mate:open-custom` validation (was home-dir-only, now **any existing folder on any drive**, incl. `D:\`); files rejected with a clear message.
- **Command logger** — every query + tool hit appended to `%AppData%\Honey\logs\commands.jsonl` (the Phase-2 training dataset).
- **Typing assist** — `type <text>` command types into the focused window via SendKeys (500-char cap, special keys escaped).
- **Voice** — 🎤 push-to-talk now drives the offline Windows desktop speech recognizer (`assets/listen.ps1`, System.Speech, confidence-gated, no cloud/keys). Echoes what it heard, then runs it.

## Pet behavior (now pinned bottom-right)
- **No automatic movement, period.** Deleted the 24s wander, the typing tuck-away, and all return-home trips (verified: zero `move` calls left except your drags). Typing/fullscreen only dims it ("resting here — click me anytime").
- **Click = poke + chat.** Plain click (no drag) plays a squash-and-stretch *boing*, shows a poke line, and opens chat — even in quiet mode.
- **Alive gestures** (transform-only, position never changes): wave on app-switch (+ curious look), shimmy on hype songs, hearts/tears overlays on love/sad songs, random wave/bounce/shimmy every ~26s when calm. Sleep `zzz`, thinking lean, dance/sing modes kept.

## Minion pet + eye tracking
- Your `assets/stu.png` (a JPEG in disguise) → converted + white background keyed to transparent via new `scripts/key-pet.ps1` → `assets/pet.png` (76% transparent, verified cutout). Robot species renders the photo (cat/blob unchanged, CSS robot kept as load-failure fallback).
- **Live pupil**: lens position pixel-measured (`scripts/measure-eye.cjs`, center 53.8%/29.9%) and verified against a debug render; brown pupil follows the cursor with eased glide; lid-yellow closed eye when sleeping; pupil widens when dancing/singing/excited; mood tints (sad desat, hype boost, spooky shift, love warmth).

## Chat UI (professional redesign)
- Layered dark card, compact header with ellipsis, segmented tabs, proper Honey/you bubbles, filled inputs with gold focus rings, solid gold Send, ghost mic button, styled scrollbars, readable dropdowns, custom-folder rows, and a media **mini-player** (now-playing card + ⏮ ▶/⏸ ⏭ 🔉 🔊 🔇 + refresh, auto-refreshes after each tap).
- **Settings save model**: Pet + Settings tabs edit a draft with live pet preview; **Save changes** commits (+ `Saved ✓`), **Discard** reverts, **Reset** restores defaults. Start-with-Windows applies on Save. Chat commands still apply instantly. About section shows version + update status.

## v1.1.0 platform work
- **Auto-update** (`electron-updater`, GitHub Releases provider — set `build.publish` owner/repo to go live): background check/download, toast + Settings status, `Check for updates` / `Restart to update`. Version bumped to 1.1.0, shown in Settings + boot log.
- **Smoke test** (`npm run smoke` → `scripts/smoke.cjs`): boots the packaged build with `--smoke-test`, asserts both renderers load with no errors, exits PASS/FAIL. Failing state would have caught both historic bugs.
- **Renderer error surface** (`main.tsx`): crashes log + show a Reload card instead of a silent invisible window.
- **Fuzzy app launcher** (`assets/app-find.ps1`): `open chrome`, `launch vscode` — Start Menu + System32 fuzzy search, top-hit opens, top-3 number-pick, opens restricted to safe roots/`.lnk`/`.exe`.
- **File finder** (`assets/file-find.ps1`): `find invoice`, `where is stu` — Desktop/Documents/Downloads + `D:\` (depth-limited), reveals matches in Explorer with number-pick.

## Still open / not started
- `build.publish` owner/repo placeholder → fill in + publish once for live auto-updates.
- Dead `cine.*` files + `wander` dormant setting: remove or keep (your call).
- Debug scaffolding (`HONEY_OPAQUE`, `startup.log` console capture): keep as permanent diagnostics or remove.
- Next candidates discussed: clipboard manager, persistent reminders/presets, custom routines, window-manager pro, dictation typing with confirm step.
