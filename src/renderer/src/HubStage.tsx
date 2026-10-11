import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaInfo } from '../../preload/index';
import {
  CHECKINS, DEFAULT_SETTINGS, GREETINGS, GUESS_WINS, JOKES, PRAISE_LINES, SCOLD_LINES,
  daypart, loadSettings, runSkills, saveSettings, situationalLine, varied,
  type MateSettings, type PetType
} from './brain';
import { CHANNELS, bus } from './PetStage';

interface Message { from: 'honey' | 'you'; text: string }
interface Scores { gw: number; w: number; l: number; d: number }

const SCORE_KEY = 'honey-scores-v1';
const NOTES_KEY = 'honey-notes-v1';
const LEGACY_SCORE_KEY = 'cinemate-scores-v1';
const LEGACY_NOTES_KEY = 'cinemate-notes-v1';

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
      ?? (key === SCORE_KEY ? localStorage.getItem(LEGACY_SCORE_KEY) : null);
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } as T : fallback;
  } catch {
    return fallback;
  }
};

const notes = () => {
  try {
    const p = JSON.parse(localStorage.getItem(NOTES_KEY) ?? localStorage.getItem(LEGACY_NOTES_KEY) ?? '[]');
    return Array.isArray(p) ? p.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
};

function updateLabel(u: { status: string; info?: string }): string {
  switch (u.status) {
    case 'checking': return 'Checking for updates…';
    case 'available': return 'Update found — downloading…';
    case 'downloading': return `Downloading update ${u.info || ''}`.trim();
    case 'ready': return 'Update ready — restart to install';
    case 'current': return 'You are up to date ✓';
    case 'error': return 'Update check failed';
    case 'dev': return 'Dev build — auto-update off';
    default: return 'Updates: automatic';
  }
}

function SaveBar({ dirty, showSaved, onSave, onDiscard, onReset }: {
  dirty: boolean; showSaved: boolean; onSave: () => void; onDiscard: () => void; onReset: () => void;
}) {
  return (
    <div className="form-footer">
      <button type="button" className="btn-primary" disabled={!dirty} onClick={onSave}>Save changes</button>
      <button type="button" className="btn-ghost" disabled={!dirty} onClick={onDiscard}>Discard</button>
      <button type="button" className="btn-danger" onClick={onReset}>Reset</button>
      {showSaved && <span className="saved-note">Saved ✓</span>}
    </div>
  );
}

export default function HubStage() {
  const [settings, setSettings] = useState<MateSettings>(loadSettings);
  const [draft, setDraft] = useState<MateSettings>(loadSettings);
  const [savedTick, setSavedTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'pet' | 'settings'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [pomoLeft, setPomoLeft] = useState(0);
  const [nowPlaying, setNowPlaying] = useState<MediaInfo | null>(null);
  const [voices, setVoices] = useState<Array<{ uri: string; name: string }>>([]);
  const [ghost, setGhost] = useState(false);
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState<{ status: string; info?: string }>({ status: 'idle' });
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pomoRef = useRef(0);
  pomoRef.current = pomoLeft;
  const timers = useRef<number[]>([]);
  const jokeLast = useRef(-1);
  const guessRef = useRef<{ target: number; tries: number; lastDiff: number } | null>(null);
  const rpsRef = useRef(false);
  const pickApps = useRef<Array<{ name: string; path: string }> | null>(null);
  const pickFiles = useRef<string[] | null>(null);
  const scoresRef = useRef<Scores>(loadJSON<Scores>(SCORE_KEY, { gw: 0, w: 0, l: 0, d: 0 }));
  const trackRef = useRef<string | null>(null);
  const idleSince = useRef(Date.now());

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const bump = (patch: Partial<Scores>) => {
    scoresRef.current = { ...scoresRef.current, ...patch };
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(scoresRef.current)); } catch { /* ignore */ }
  };

  useEffect(() => {
    saveSettings(settings);
    bus.emit('honey-config', { pet: settings.pet, petName: settings.petName });
    window.mate.setIdleAfter(settings.sleepMin <= 0 ? 0 : settings.sleepMin * 60_000);
  }, [settings]);

  // Chat skills commit instantly — keep the draft in sync with them.
  useEffect(() => { setDraft(settings); }, [settings]);

  // Live pet preview while editing the draft (persisted only on Save).
  useEffect(() => {
    bus.emit('honey-config', { pet: draft.pet, petName: draft.petName });
  }, [draft.pet, draft.petName]);

  useEffect(() => { void window.mate.getClickThrough().then(setGhost); }, []);
  useEffect(() => window.mate.onHubState(setOpen), []);
  useEffect(() => { void window.mate.getVersion().then(setVersion).catch(() => undefined); }, []);
  useEffect(() => window.mate.onUpdate(setUpdate), []);
  useEffect(() => {
    const g = varied(GREETINGS[daypart(new Date().getHours())], { current: -1 });
    const n = settingsRef.current.userName ? `, ${settingsRef.current.userName}` : '';
    setMessages([{ from: 'honey', text: `${g}${n} I am ${settingsRef.current.petName}. Type "help" for everything I can do.` }]);
  }, []);

  useEffect(() => {
    const defaults = ['Zira', 'Hazel', 'Susan', 'Sonia', 'Vicki', 'Libby', 'Aria', 'Jenny', 'Microsoft David'];
    setVoices(defaults.map((n) => ({ uri: n, name: n })));
  }, []);

  const speak = useCallback((text: string) => {
    if (!settingsRef.current.voice) return;
    window.mate.speak(text, settingsRef.current.voiceURI);
  }, []);

  const say = useCallback((text: string) => {
    setMessages((prev) => [...prev, { from: 'honey', text }]);
    speak(text);
  }, [speak]);
  const pokeSay = useCallback((text: string) => {
    bus.emit(CHANNELS.bubble, text);
  }, []);

  const fmtTime = (s?: number) => {
    if (s === undefined || s === null || !Number.isFinite(s) || s < 0) return '--:--';
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  const refreshPlaying = useCallback(() => {
    void window.mate.nowPlaying().then((info) => {
      setNowPlaying(info);
      const label = info ? (info.playing ? `${info.artist ? `${info.artist} — ` : ''}${info.title}` : `${info.title} (paused)`) : null;
      bus.emit(CHANNELS.now, label);
      if (info) trackRef.current = label;
    }).catch(() => setNowPlaying(null));
  }, []);

  const act = useCallback((action: string, value?: string | number) => {
    window.mate.log({ q: '', tool: 'media', args: value !== undefined ? `${action}:${value}` : action });
    window.mate.media(action, value);
    // Optimistic UI for instant-feeling controls.
    if (action === 'pause') setNowPlaying((p) => (p ? { ...p, playing: false } : p));
    else if (action === 'play') setNowPlaying((p) => (p ? { ...p, playing: true } : p));
    else if (action === 'mute') setNowPlaying((p) => (p ? { ...p, muted: true } : p));
    else if (action === 'unmute') setNowPlaying((p) => (p ? { ...p, muted: false } : p));
    else if (action === 'volumeset' && typeof value === 'number') setNowPlaying((p) => (p ? { ...p, volume: value, muted: false } : p));
    else if ((action === 'seekfwd' || action === 'seekback') && typeof value === 'number') {
      const d = action === 'seekfwd' ? value : -value;
      setNowPlaying((p) => (p && p.positionSec !== undefined ? { ...p, positionSec: Math.max(0, Math.min(p.durationSec ?? 99999, p.positionSec + d)) } : p));
    }
    window.setTimeout(refreshPlaying, 900);
  }, [refreshPlaying]);

  // Fast player refresh (progress/volume) while the chat is open; the 30s beat below stays for ambient awareness.
  useEffect(() => {
    if (!open || tab !== 'chat') return;
    refreshPlaying();
    const fast = window.setInterval(refreshPlaying, 5000);
    return () => window.clearInterval(fast);
  }, [open, tab, refreshPlaying]);

  // Local 1s ticker so the progress bar glides between 5s probes.
  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowPlaying((p) => {
        if (!p || !p.playing || p.positionSec === undefined || p.durationSec === undefined) return p;
        if (p.positionSec + 1 > p.durationSec) return p;
        return { ...p, positionSec: p.positionSec + 1 };
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  // Proactive: idle nudges, check-ins, and now-playing awareness.
  useEffect(() => {
    const beat = window.setInterval(() => {
      void window.mate.nowPlaying().then((info) => {
        setNowPlaying(info);
        const label = info ? (info.playing ? `${info.artist ? `${info.artist} — ` : ''}${info.title}` : `${info.title} (paused)`) : null;
        bus.emit(CHANNELS.now, label);
        if (!info) { trackRef.current = null; return; }
        if (trackRef.current !== null && trackRef.current !== label && !open) {
          bus.emit(CHANNELS.mood, 'curious');
        }
        trackRef.current = label;
      }).catch(() => setNowPlaying(null));

      if (idleSince.current && Date.now() - idleSince.current > 50 * 60_000) {
        window.mate.notify(settingsRef.current.petName, '50 minutes nonstop — stretch break!');
        pokeSay('50 min grind… stretch!');
        idleSince.current = Date.now();
      }
      if (!open && Math.random() < 0.5) {
        pokeSay(Math.random() < 0.5
          ? situationalLine({ nowPlaying, pomoLeft: pomoRef.current, hour: new Date().getHours(), petName: settingsRef.current.petName })
          : varied(CHECKINS, jokeLast));
      }
    }, 30000);
    return () => window.clearInterval(beat);
  }, [open, pokeSay]);

  useEffect(() => window.mate.onIdle((idle) => {
    if (idle) idleSince.current = Date.now();
    else {
      idleSince.current = 0;
      pokeSay(situationalLine({
        nowPlaying, pomoLeft: pomoRef.current, hour: new Date().getHours(),
        petName: settingsRef.current.petName
      }));
      bus.emit(CHANNELS.action, 'wake');
    }
  }), [pokeSay, nowPlaying]);

  useEffect(() => {
    if (pomoLeft <= 0) return;
    if (pomoLeft === 1) {
      window.mate.notify(settingsRef.current.petName, 'Pomodoro done — stretch!');
      say('Ding! Pomodoro complete. Proud of you.');
    }
    const t = window.setTimeout(() => setPomoLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [pomoLeft, say]);

  // UI edits land in the draft; Save commits them. Chat skills commit instantly.
  const patch = (p: Partial<MateSettings>) => setDraft((prev) => ({ ...prev, ...p }));
  const commitPatch = (p: Partial<MateSettings>) => setSettings((prev) => ({ ...prev, ...p }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const saveAll = () => {
    if (draft.login !== settingsRef.current.login) window.mate.setLogin(draft.login);
    setSettings(draft);
    setSavedTick((t) => t + 1);
  };
  const discardAll = () => setDraft(settingsRef.current);
  const resetAll = () => {
    const d: MateSettings = { ...DEFAULT_SETTINGS, customFolders: {} };
    if (settingsRef.current.login) window.mate.setLogin(false);
    setDraft(d);
    setSettings(d);
    setSavedTick((t) => t + 1);
  };

  const reply = (text: string) => {
    const raw = text.trim();
    if (!raw) return;
    const q = raw.toLowerCase();
    setMessages((prev) => [...prev, { from: 'you', text: raw }]);
    setInput('');
    window.mate.log({ q: raw, tool: 'query' });
    window.setTimeout(() => {
      const game = guessRef.current;
      if (game && !/(stop|quit|give up|play rock|score)/.test(q)) {
        const n = Number(q.match(/\b(\d{1,2})\b/)?.[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 20) {
          game.tries++;
          const diff = Math.abs(n - game.target);
          if (diff === 0) {
            guessRef.current = null;
            bump({ gw: scoresRef.current.gw + 1 });
            say(`${varied(GUESS_WINS, jokeLast)} In ${game.tries} tries!`);
            bus.emit(CHANNELS.mood, 'love');
            bus.emit(CHANNELS.action, 'dance');
          } else if (game.tries >= 6) {
            guessRef.current = null;
            say(`Out of tries — it was ${game.target}. Rematch?`);
          } else {
            const hint = diff < game.lastDiff ? 'Warmer' : diff > game.lastDiff ? 'Colder' : 'Same';
            game.lastDiff = diff;
            say(`${hint}. ${n < game.target ? 'Go higher' : 'Go lower'}. (${6 - game.tries} left)`);
          }
          return;
        }
      }
      if (rpsRef.current && /(rock|paper|scissors)/.test(q)) {
        rpsRef.current = false;
        const mine = (['rock', 'paper', 'scissors'] as const)[Math.floor(Math.random() * 3)];
        const pick = q.includes('rock') ? 'rock' : q.includes('paper') ? 'paper' : 'scissors';
        const beats: Record<string, string> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
        if (mine === pick) { bump({ d: scoresRef.current.d + 1 }); say(`${mine} both — draw!`); }
        else if (beats[pick] === mine) { bump({ w: scoresRef.current.w + 1 }); say(`I threw ${mine}. You win — graceful loser, me.`); bus.emit(CHANNELS.mood, 'sad'); }
        else { bump({ l: scoresRef.current.l + 1 }); say(`I threw ${mine} — victory is mine!`); bus.emit(CHANNELS.mood, 'love'); bus.emit(CHANNELS.action, 'dance'); }
        return;
      }
      if (!guessRef.current && !rpsRef.current) {
        const digit = q.match(/^(\d)$/);
        if (digit) {
          const i = Number(digit[1]) - 1;
          const app = pickApps.current?.[i];
          if (app) {
            pickApps.current = null;
            window.mate.log({ q: raw, tool: 'app-open', args: app.name });
            void window.mate.appOpen(app.path).then((r) => say(r === 'ok' ? `Opening ${app.name}.` : `Couldn't open ${app.name}.`));
            return;
          }
          const file = pickFiles.current?.[i];
          if (file) {
            pickFiles.current = null;
            window.mate.log({ q: raw, tool: 'file-reveal', args: file });
            void window.mate.fileReveal(file).then((r) => say(r === 'ok' ? 'Revealed in Explorer.' : 'That file is gone.'));
            return;
          }
        }
      }
      const dj = (action: string, value: string | number | undefined, lines: [string, string]) => { window.mate.log({ q: raw, tool: 'media', args: value !== undefined ? `${action}:${value}` : action }); window.mate.media(action, value); say(varied(lines, jokeLast)); };
      if (/(next|skip).*(song|track|music)/.test(q) || /^(next|skip)$/.test(q)) { dj('next', undefined, ['Skipped!', 'Next track, coming right up.']); return; }
      if (/(previous|rewind|last).*(song|track|music)/.test(q) || q === 'previous') { dj('prev', undefined, ['Rewinding.', 'Encore, please.']); return; }
      if (/\bpause\b/.test(q) && !/unpause|resume/.test(q)) { dj('pause', undefined, ['Paused.', 'Frozen in time.']); return; }
      if (/resume/.test(q) || /unpause/.test(q) || q === 'play' || /\bresume (the )?music\b/.test(q)) { dj('play', undefined, ['Playing.', 'Back to the beat.']); return; }
      if (/(forward|skip ahead|jump ahead|seek forward)(\s+(\d+))?/.test(q)) { const s = Number(q.match(/(\d+)/)?.[1] ?? 10); dj('seekfwd', s, [`Skipped ahead ${s}s.`, 'Jumped forward.']); return; }
      if (/(back|rewind|go back|seek back)(\s+(\d+))?/.test(q) && /(song|track|music|sec|second)/.test(q)) { const s = Number(q.match(/(\d+)/)?.[1] ?? 10); dj('seekback', s, [`Back ${s}s.`, 'Rewound a touch.']); return; }
      if (/\bshuffle\b/.test(q)) { dj('shuffle', undefined, ['Shuffled.', 'Chaos mode: on.']); return; }
      if (/\brepeat\b|\bloop\b/.test(q)) { dj('repeat', undefined, ['Repeat cycled.', 'Loop mode switched.']); return; }
      if (/stop.*(music|song|spotify|play)/.test(q)) { dj('stop', undefined, ['Stopped.', 'Silence.']); return; }
      const volSet = q.match(/(?:volume|vol)(?: set)?(?: to)?\s+(\d{1,3})\b/) || q.match(/^set (?:volume|vol) (\d{1,3})$/) || q.match(/^(\d{1,3})\s*(?:percent|%)\s*volume$/);
      if (volSet) { const v = Math.max(0, Math.min(100, Number(volSet[1]))); dj('volumeset', v, [`Volume ${v}%.`, `Set to ${v}.`]); return; }
      if (/(volume up|louder|turn it up)/.test(q)) { dj('volup', undefined, ['Louder!', 'Turning it up.']); return; }
      if (/(volume down|quieter|turn it down|lower the volume)/.test(q)) { dj('voldown', undefined, ['Softer.', 'Cozy volume.']); return; }
      if (/\bunmute\b/.test(q)) { dj('unmute', undefined, ['Sound is back.', 'Unmuted.']); return; }
      if (/\bmute\b/.test(q)) { dj('mute', undefined, ['Shhh.', 'Muted.']); return; }

      if (/(what'?s playing|what song|now playing|current (song|track)|what music)/.test(q)) {
        void window.mate.nowPlaying().then((info) => {
          if (!info) say('Nothing is playing that Windows can see right now.');
          else {
            const pos = info.positionSec !== undefined && info.durationSec ? ` [${fmtTime(info.positionSec)}/${fmtTime(info.durationSec)}]` : '';
            say(`${info.playing ? 'Now playing' : 'Paused'}: ${info.artist ? `${info.artist} — ` : ''}${info.title} (via ${info.app})${pos}.`);
          }
        });
        return;
      }
      const playObj = q.match(/^play\s+(.+)/);
      if (playObj && !/(rock|paper|scissors|game|guess|number)/.test(playObj[1])) {
        const target = playObj[1].replace(/\s+on\s+(spotify|youtube)$/, '').trim();
        if (/youtube/.test(playObj[1])) window.mate.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(target)}`);
        else window.mate.spotifySearch(target);
        say(`Queued “${target}” on ${/youtube/.test(playObj[1]) ? 'YouTube' : 'Spotify'} — pick and play.`);
        return;
      }
      if (/(open|play|start) spotify/.test(q)) { window.mate.spotify('open'); say('Opening Spotify and hitting play.'); return; }
      if (/(close|quit|kill|exit|stop) spotify/.test(q)) { window.mate.spotify('close'); say('Spotify closed.'); return; }
      if (/(google|search)(?: for)?\s+(.+)/.test(q)) { window.mate.openUrl(`https://www.google.com/search?q=${encodeURIComponent(q.replace(/^(google|search)(?: for)?\s+/, ''))}`); say('Googling it.'); return; }
      const yt = q.match(/^youtube\s+(.+)/);
      if (yt) { window.mate.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(yt[1])}`); say('YouTube it is.'); return; }
      const customNames = Object.keys(settingsRef.current.customFolders || {});
      const customHit = customNames.find((n) => q.includes(`open ${n}`) || q.includes(`open my ${n}`) || q.includes(`open ${n} folder`));
      if (customHit) {
        const dir = settingsRef.current.customFolders[customHit];
        window.mate.log({ q: raw, tool: 'open-custom', args: customHit });
        void window.mate.openCustom(dir).then((r) => say(r === 'ok' ? `Opening ${customHit}.` : r === 'not-folder' ? `${customHit} is a file, not a folder.` : `Can't open ${customHit} — check the path in Settings.`));
        return;
      }
      const folder = q.match(/open(?: my)? (downloads|documents|desktop|pictures|videos?|music|movies?|films?)(?: folder)?/);
      if (folder) { window.mate.log({ q: raw, tool: 'open-folder', args: folder[1] }); window.mate.openFolder(folder[1]); say(`Opening ${folder[1]}.`); return; }
      const typeCmd = q.match(/^type(?: out)?\s+(.+)/);
      if (typeCmd) { window.mate.log({ q: raw, tool: 'type', args: typeCmd[1].slice(0, 60) }); window.mate.typeText(typeCmd[1]); say(`Typed it into the focused window.`); return; }
      const appCmd = q.match(/^(?:open|launch|start)\s+(.+?)(?:\s+app)?$/);
      if (appCmd && !/(notepad|calculat|paint|terminal|spotify|notes?|timer|pomodoro|remind|sing|song|dance|sleep|wake|time|date|day|today|help|joke|funny|game|guess|rock|paper|scissors|voice|music)/.test(appCmd[1])) {
        const target = appCmd[1].trim();
        pickApps.current = null;
        window.mate.log({ q: raw, tool: 'app-find', args: target });
        void window.mate.appFind(target).then((hits) => {
          if (!hits.length) {
            say(/youtube|google|gmail|maps/.test(target)
              ? `No app matching “${target}” — try “youtube …” or “google …” to search the web.`
              : `No app matching “${target}”.`);
            return;
          }
          if (hits.length === 1 || hits[0].score >= hits[1].score + 30) {
            const hit = hits[0];
            window.mate.log({ q: raw, tool: 'app-open', args: hit.name });
            void window.mate.appOpen(hit.path).then((r) => say(r === 'ok' ? `Opening ${hit.name}.` : `Found ${hit.name} but couldn't open it.`));
          } else {
            pickApps.current = hits.slice(0, 3).map((h) => ({ name: h.name, path: h.path }));
            say(`Which one? ${pickApps.current.map((h, i) => `${i + 1}. ${h.name}`).join(' · ')}`);
          }
        });
        return;
      }
      const findCmd = q.match(/^(?:find|locate|where is|search (?:my |for )?files? for)\s+(.+)/);
      if (findCmd) {
        const target = findCmd[1].trim();
        pickFiles.current = null;
        window.mate.log({ q: raw, tool: 'file-find', args: target });
        say('Searching…');
        void window.mate.fileFind(target).then((files) => {
          if (!files.length) { say(`Nothing named like “${target}”.`); return; }
          if (files.length === 1) {
            window.mate.log({ q: raw, tool: 'file-reveal', args: files[0] });
            void window.mate.fileReveal(files[0]).then(() => say('Revealed in Explorer.'));
          } else {
            pickFiles.current = files.slice(0, 5);
            say(`Found ${files.length}: ${pickFiles.current.map((f, i) => `${i + 1}. ${f.split(/[\\/]/).pop()}`).join(' · ')} — reply with the number.`);
          }
        });
        return;
      }
      if (/lock (?:my |the )?(?:pc|computer|screen|windows)/.test(q)) { window.mate.lock(); say('Locking up.'); return; }
      if (/(minimi[sz]e|hide) (?:this|the|my)? ?window/.test(q)) { window.mate.window('minimize'); say('Tucked away.'); return; }
      if (/(close|quit|kill|exit) (?:this|the|my)? ?window/.test(q)) { window.mate.window('close'); say('Closed. Gone but not forgotten.'); return; }
      if (/(maximi[sz]e|full ?screen) (?:this|the)? ?window/.test(q)) { window.mate.window('maximize'); say('Big screen energy.'); return; }
      if (/(what|which) (?:window|app) am i using/.test(q)) { window.mate.window('list'); say('Checked the focused window.'); return; }
      if (/(battery|power|how much (?:ram|memory)|system status|pc status|performance)/.test(q)) {
        void window.mate.sysinfo().then((info) => {
          const b = info.match(/BATTERY=(\d+)/)?.[1] ?? '?';
          const mem = info.match(/MEMORY=([\d.]+)\/([\d.]+)/)?.[0]?.replace('MEMORY=', '') ?? '?';
          const cpu = info.match(/CPU=(\d+)/)?.[1];
          say(`Battery ${b}%. Memory free ${mem} GB.${cpu ? ` CPU ${cpu}%.` : ''}`);
        });
        return;
      }
      if (/(screenshot|screen ?shot|snap\b|capture (?:my )?screen)/.test(q)) {
        void window.mate.screenshot().then((f) => say(f ? 'Snapped — saved in Pictures.' : 'Screenshot failed.'));
        return;
      }
      const note = q.match(/^(?:note|remember|jot down)(?: that)?\s+(.+)/);
      if (note) {
        const list = [...notes(), note[1].trim()];
        try { localStorage.setItem(NOTES_KEY, JSON.stringify(list.slice(-50))); } catch { /* ignore */ }
        say(`Noted (${list.length} on the pad). "my notes" to recap.`);
        return;
      }
      if (/^(my notes|show notes|list notes|read my notes)/.test(q)) {
        const list = notes();
        say(list.length ? `Pad: ${list.map((n, i) => `${i + 1}. ${n}`).join(' ')}` : 'Pad is empty.');
        return;
      }
      if (/^(clear|forget|delete)(?: all)? notes/.test(q)) {
        try { localStorage.setItem(NOTES_KEY, '[]'); } catch { /* ignore */ }
        say('Wiped clean.');
        return;
      }
      if (/(play|start).*(guess|number game)|guessing game/.test(q)) {
        pickApps.current = null;
        pickFiles.current = null;
        guessRef.current = { target: 1 + Math.floor(Math.random() * 20), tries: 0, lastDiff: 99 };
        say('Number between 1 and 20. Six guesses. Go!');
        return;
      }
      if (q.includes('rock paper') || (q.includes('play') && q.includes('scissors'))) { pickApps.current = null; pickFiles.current = null; rpsRef.current = true; say('Rock, paper, or scissors?'); return; }
      if (/(score|record|trophy|wins)/.test(q)) {
        const s = scoresRef.current;
        say(`Trophies: ${s.gw} guessing wins · RPS ${s.w}W/${s.l}L/${s.d}D.`);
        return;
      }
      if (/(laugh|joke|funny|haha)/.test(q)) {
        bus.emit(CHANNELS.mood, 'laugh');
        say(`Ha! ${varied(JOKES, jokeLast)}`);
        return;
      }
      if (/(read (?:this|it|aloud|my clipboard|clipboard)|read to me)/.test(q)) {
        void (async () => {
          try {
            const t = (await navigator.clipboard.readText()).trim().slice(0, 300);
            say(t ? `Clipboard: “${t}”` : 'Clipboard is empty.');
          } catch {
            say('Cannot read the clipboard — paste it here instead.');
          }
        })();
        return;
      }
      const skill = runSkills(q, { petName: settingsRef.current.petName, userName: settingsRef.current.userName, pomoLeft: pomoRef.current });
      if (skill) {
        if (skill.setting) commitPatch(skill.setting);
        if (skill.pomodoro !== undefined) setPomoLeft(skill.pomodoro < 0 ? 0 : skill.pomodoro * 60);
        if (skill.reminder) {
          const { mins, what } = skill.reminder;
          window.setTimeout(() => window.mate.notify(`${settingsRef.current.petName} reminder`, what), mins * 60000);
        }
        if (skill.action === 'dance') bus.emit(CHANNELS.action, 'dance');
        else if (skill.action === 'sing') bus.emit(CHANNELS.action, 'sing');
        else if (skill.action === 'sleep') bus.emit(CHANNELS.action, 'sleep');
        else if (skill.action === 'wake') bus.emit(CHANNELS.action, 'wake');
        if (/notepad/.test(q)) window.mate.launch('notepad');
        if (/calculat/.test(q)) window.mate.launch('calculator');
        if (/paint/.test(q)) window.mate.launch('paint');
        if (/terminal/.test(q)) window.mate.launch('terminal');
        if (skill.mood === 'love') { say(varied(PRAISE_LINES, jokeLast)); bus.emit(CHANNELS.mood, 'love'); bus.emit(CHANNELS.action, 'dance'); return; }
        if (skill.mood === 'sad') { say(varied(SCOLD_LINES, jokeLast)); bus.emit(CHANNELS.mood, 'sad'); return; }
        if (skill.text) { say(skill.text); bus.emit(CHANNELS.bubble, skill.text.slice(0, 60)); }
        return;
      }
      setTyping(true);
      window.mate.log({ q: raw, tool: 'ai-fallback' });
      bus.emit(CHANNELS.thinking, true);
      const system = `You are ${settingsRef.current.petName}, a tiny desktop robot pet living on the user's Windows screen. Cheerful, playful, a little cheeky. Reply in 1-2 short sentences, plain text, no emojis. The user's name is ${settingsRef.current.userName || 'human'}. Never claim to browse the web or run code.`;
      void window.mate.ask(raw, system, settingsRef.current.geminiKey, settingsRef.current.routerKey)
        .then((cloud) => say(cloud || (settingsRef.current.geminiKey || settingsRef.current.routerKey
          ? 'My brain could not reach the AI service just now — try again in a moment.'
          : 'No AI key configured. Add a free Gemini key in Settings and I will think properly. Until then I still do music, games, folders and reminders.')))
        .catch(() => say('Brain unreachable. Local tricks still work.'))
        .finally(() => { setTyping(false); bus.emit(CHANNELS.thinking, false); });
    }, 260);
  };

  const park = useCallback((text: string) => {
    bus.emit(CHANNELS.bubble, text);
  }, []);

  // Push-to-talk: offline Windows desktop speech recognition (no cloud, no keys).
  const voiceInput = () => {
    say('Listening… speak a short command.');
    bus.emit(CHANNELS.thinking, true);
    void window.mate.listen()
      .then((t) => {
        if (t) { say(`Heard: “${t}”`); reply(t); }
        else say('Did not catch that — quiet room and short commands work best.');
      })
      .catch(() => say('Mic unavailable — check Windows microphone privacy settings.'))
      .finally(() => bus.emit(CHANNELS.thinking, false));
  };

  const nowPlayingLine = useMemo(
    () => (nowPlaying ? `${nowPlaying.playing ? '♪' : '❚❚'} ${nowPlaying.artist ? `${nowPlaying.artist} — ` : ''}${nowPlaying.title}` : null),
    [nowPlaying]
  );

  if (!open) {
    return (
      <div className="stage hub-collapsed">
        <button type="button" className="hub-fab" onClick={() => window.mate.hubToggle(true)} aria-label="Open Honey chat" title="Open Honey chat">
          <span aria-hidden="true"><i /><i /><i /></span>
        </button>
      </div>
    );
  }

  return (
    <div className="stage hub-open">
      <section className="chat" aria-label={`Chat with ${settings.petName}`}>
        <header className="dragzone" onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const ox = e.screenX - e.clientX;
          const oy = e.screenY - e.clientY;
          const move = (ev: PointerEvent) => window.mate.moveHub(ev.screenX - ox, ev.screenY - oy);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}>
          <span className="chat-dot" aria-hidden="true" />
          <div>
            <strong>{settings.petName}</strong>
            <small>{nowPlayingLine ?? (pomoLeft > 0 ? `focus ${Math.floor(pomoLeft / 60)}:${String(pomoLeft % 60).padStart(2, '0')}` : 'screen companion')}</small>
          </div>
          <button type="button" className="icon-btn" onClick={() => window.mate.hubToggle(false)} aria-label="Collapse chat">–</button>
        </header>
        <nav className="tabs" aria-label="Panels">
          {(['chat', 'pet', 'settings'] as const).map((t) => (
            <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        {tab === 'chat' && (
          <>
            <div className="player" aria-label="Media controls">
              <div className="player-track">
                <span className="player-state" aria-hidden="true">{nowPlaying ? (nowPlaying.playing ? '♪' : '❚❚') : '○'}</span>
                <div>
                  <strong>{nowPlaying ? nowPlaying.title : 'Nothing playing'}</strong>
                  <small>{nowPlaying ? `${nowPlaying.artist ? `${nowPlaying.artist} — ` : ''}via ${nowPlaying.app}${nowPlaying.album ? ` · ${nowPlaying.album}` : ''}` : 'Start something on Spotify or YouTube'}</small>
                </div>
                <button type="button" className="icon-btn" onClick={refreshPlaying} aria-label="Refresh now playing" title="Refresh">↻</button>
              </div>
              {nowPlaying && nowPlaying.durationSec !== undefined && nowPlaying.durationSec > 0 && (
                <div className="player-progress">
                  <span>{fmtTime(nowPlaying.positionSec)}</span>
                  <input
                    type="range" min={0} max={nowPlaying.durationSec} step={1}
                    value={Math.min(nowPlaying.positionSec ?? 0, nowPlaying.durationSec)}
                    onChange={(e) => act('seek', Number(e.target.value))}
                    aria-label="Seek"
                  />
                  <span>{fmtTime(nowPlaying.durationSec)}</span>
                </div>
              )}
              <div className="player-btns">
                <button type="button" onClick={() => act('seekback', 10)} aria-label="Back 10 seconds" title="Back 10s">↩</button>
                <button type="button" onClick={() => act('prev')} aria-label="Previous track">⏮</button>
                <button type="button" onClick={() => act(nowPlaying?.playing ? 'pause' : 'play')} aria-label="Play or pause">{nowPlaying?.playing ? '⏸' : '▶'}</button>
                <button type="button" onClick={() => act('next')} aria-label="Next track">⏭</button>
                <button type="button" onClick={() => act('seekfwd', 10)} aria-label="Forward 10 seconds" title="Forward 10s">↪</button>
                <button type="button" onClick={() => act('stop')} aria-label="Stop">⏹</button>
              </div>
              <div className="player-btns player-sub">
                <button type="button" className={nowPlaying?.shuffle === 'On' ? 'toggled' : ''} onClick={() => act('shuffle')} aria-label="Toggle shuffle" title={`Shuffle${nowPlaying?.shuffle ? `: ${nowPlaying.shuffle}` : ''}`}>🔀</button>
                <button type="button" className={nowPlaying?.repeat && nowPlaying.repeat !== 'Off' ? 'toggled' : ''} onClick={() => act('repeat')} aria-label="Cycle repeat" title={`Repeat${nowPlaying?.repeat ? `: ${nowPlaying.repeat}` : ''}`}>🔁{nowPlaying?.repeat === 'One' ? '1' : ''}</button>
                <button type="button" onClick={() => act(nowPlaying?.muted ? 'unmute' : 'mute')} aria-label="Mute or unmute">{nowPlaying?.muted ? '🔈' : '🔇'}</button>
              </div>
              <div className="player-vol">
                <span aria-hidden="true">🔉</span>
                <input
                  type="range" min={0} max={100} step={1}
                  value={nowPlaying?.volume ?? 50}
                  onChange={(e) => act('volumeset', Number(e.target.value))}
                  aria-label="System volume"
                />
                <span>{nowPlaying?.muted ? 'muted' : `${nowPlaying?.volume ?? '--'}%`}</span>
              </div>
            </div>
            <div className="log" role="log" aria-live="polite">
              {messages.map((m, i) => <p key={i} className={m.from}>{m.text}</p>)}
              {typing && <p className="honey typing" aria-label="thinking"><span /><span /><span /></p>}
            </div>
            <div className="chips">
              {['What is playing', 'Pomodoro 25', 'Help', 'Tell me a joke'].map((c) => (
                <button key={c} type="button" onClick={() => reply(c)}>{c}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); reply(input); }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask ${settings.petName}…`} autoComplete="off" aria-label="Ask" />
              <button type="button" className="icon-btn" onClick={voiceInput} aria-label="Voice input" title="Push to talk">🎤</button>
              <button type="submit" className="send-btn" aria-label="Send">Send</button>
            </form>
          </>
        )}
        {tab === 'pet' && (
          <div className="panel">
            <label>Pet name<input value={draft.petName} maxLength={16} onChange={(e) => patch({ petName: e.target.value.trim() || 'Honey' })} /></label>
            <label>Your name<input value={draft.userName} maxLength={20} placeholder="so I greet you" onChange={(e) => patch({ userName: e.target.value.trim() })} /></label>
            <span className="row-label">Species</span>
            <div className="seg">{(['robot', 'cat', 'blob'] as PetType[]).map((p) => (
              <button key={p} type="button" className={draft.pet === p ? 'active' : ''} onClick={() => { patch({ pet: p }); park(`I am a ${p} now!`); }}>{p}</button>
            ))}</div>
            <span className="row-label">Glow</span>
            <div className="swatches">{(['gold', 'cyan', 'pink', 'green'] as const).map((t) => (
              <button key={t} className={`sw ${t}${draft.theme === t ? ' active' : ''}`} onClick={() => patch({ theme: t })} aria-label={`${t} glow`} />
            ))}</div>
            <span className="row-label">Size</span>
            <div className="seg">{(['S', 'M', 'L'] as const).map((s) => (
              <button key={s} type="button" className={draft.size === s ? 'active' : ''} onClick={() => patch({ size: s })}>{s}</button>
            ))}</div>
            <SaveBar dirty={dirty} showSaved={savedTick > 0 && !dirty} onSave={saveAll} onDiscard={discardAll} onReset={resetAll} />
          </div>
        )}
        {tab === 'settings' && (
          <div className="panel">
            <label>Sleep after idle
              <select value={draft.sleepMin} onChange={(e) => patch({ sleepMin: Number(e.target.value) })}>
                <option value={0}>Never</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={30}>30 min</option>
              </select>
            </label>
            <label>Gemini API key <small>free · aistudio.google.com/apikey</small>
              <input type="password" value={draft.geminiKey} placeholder="paste free key for real AI chat" onChange={(e) => patch({ geminiKey: e.target.value.trim() })} />
            </label>
            <label>OpenRouter key <small>optional fallback</small>
              <input type="password" value={draft.routerKey} placeholder="optional" onChange={(e) => patch({ routerKey: e.target.value.trim() })} />
            </label>
            <label className="check"><input type="checkbox" checked={draft.voice} onChange={(e) => patch({ voice: e.target.checked })} /> Voice replies (female preferred)</label>
            {draft.voice && voices.length > 0 && (
              <label>Voice
                <select value={draft.voiceURI} onChange={(e) => patch({ voiceURI: e.target.value })}>
                  <option value="">Auto (female preferred)</option>
                  {voices.map((v) => <option key={v.uri} value={v.uri}>{v.name}</option>)}
                </select>
              </label>
            )}
            <label className="check"><input type="checkbox" checked={ghost} onChange={(e) => { setGhost(e.target.checked); window.mate.setClickThrough(e.target.checked); }} /> Ghost mode (pet never blocks clicks · Ctrl+Alt+M)</label>
            <label className="check"><input type="checkbox" checked={draft.login} onChange={(e) => patch({ login: e.target.checked })} /> Start with Windows</label>
            <span className="row-label">Custom folders (name → full path, any local drive)</span>
            <div className="folders">
              {Object.entries(draft.customFolders || {}).map(([n, p]) => (
                <div key={n} className="folder-row">
                  <span>{n} → {p}</span>
                  <button type="button" onClick={() => patch({ customFolders: Object.fromEntries(Object.entries(draft.customFolders).filter(([k]) => k !== n)) })} aria-label={`Remove ${n}`}>✕</button>
                </div>
              ))}
              <div className="folder-add">
                <input value={newFolderName} maxLength={24} placeholder="movies" onChange={(e) => setNewFolderName(e.target.value.toLowerCase().trim())} aria-label="Folder nickname" />
                <input value={newFolderPath} placeholder="C:\Users\you\Videos\Movies" onChange={(e) => setNewFolderPath(e.target.value.trim())} aria-label="Folder path" />
                <button type="button" onClick={() => {
                  if (!newFolderName || !newFolderPath) return;
                  patch({ customFolders: { ...(draft.customFolders || {}), [newFolderName]: newFolderPath } });
                  setNewFolderName(''); setNewFolderPath('');
                }}>Add</button>
              </div>
            </div>
            <SaveBar dirty={dirty} showSaved={savedTick > 0 && !dirty} onSave={saveAll} onDiscard={discardAll} onReset={resetAll} />
            <span className="row-label">About</span>
            <div className="folders">
              <div className="folder-row"><span>Honey v{version || '…'}</span></div>
              <div className="folder-row"><span>{updateLabel(update)}</span></div>
            </div>
            <div className="folder-add">
              <button type="button" onClick={() => window.mate.updateCheck()}>Check for updates</button>
              {update.status === 'ready' && <button type="button" onClick={() => window.mate.updateInstall()}>Restart to update</button>}
            </div>
            <button type="button" className="quit" onClick={() => window.mate.quit()}>Quit Honey</button>
          </div>
        )}
      </section>
    </div>
  );
}