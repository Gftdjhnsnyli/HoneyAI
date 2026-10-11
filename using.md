Since you installed from release\Honey Setup 1.0.0.exe:
Starting it
1. Start menu → "Honey" (the installer created a shortcut with that name). No desktop icon by default.
2. On first launch Windows SmartScreen will warn (unsigned build) → click More info → Run anyway.
3. Nothing opens in the taskbar — that's normal. Both windows use skipTaskbar. Look for:
- Pet (bottom-right): small robot with a speech bubble.
- Chat button (top-right): small glowing ··· circle.
- Tray icon: ^ system tray → Honey icon. Click = open/close chat.

To run on login later: open chat → Settings → Start with Windows (or right-click pet → menu).
Using it (30-second tour)
- Drag the pet anywhere by holding it. Right-click it = menu (Open chat, Click-through, Start with Windows, Quit).
- Click the ··· circle (top-right) to open the chat → 3 tabs: chat / pet / settings.
- Ghost mode: when ON, the pet never blocks your clicks — it only becomes grabbable when your cursor is right on it. 

Toggle in Settings or Ctrl+Alt+M. If the pet "won't drag", ghost mode is on — move your cursor onto it first.
Try these in chat (Phase 1 trial checklist)
help
open movies folder        ← new alias (videos folder)
open music folder         ← new built-in
what's playing
play davido               ← opens Spotify search
take a screenshot
type hello world          ← new: types into the focused window
tell me a joke
pomodoro 25
note buy milk  →  my notes


- Custom folder: Settings → Custom folders → e.g. name movies, path C:\Users\you\Videos\Movies → Add. Then open movies folder opens exactly that.
- 🎤 button (next to Send): voice input scaffold — speaks/listens via browser API if available, else tells you Whisper comes in Phase 2.
- Pet tab: rename pet + yourself, species (robot/cat/blob), glow, size.
- Settings tab: idle-sleep timer, Gemini/OpenRouter keys for real AI chat, voice replies on/off, ghost mode.
Where your trial data goes
- Logs (every command): %AppData%\Honey\logs\commands.jsonl — keep this file, it's the Phase-2 training dataset.
- Prefs: %AppData%\Honey\prefs.json. Screenshots: Pictures\Honey.
Stopping it
Right-click pet → Quit Honey, or Settings → Quit. Installing a newer build later just runs over the old one — settings survive.
If the pet doesn't appear after launch, check the tray icon (it may be hidden under ^) — single-instance lock means a second launch just silently exits.