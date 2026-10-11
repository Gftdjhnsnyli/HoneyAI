import { contextBridge, ipcRenderer } from 'electron';

export interface CursorState {
  cursor: { x: number; y: number };
  winPos: { x: number; y: number };
  area: { x: number; y: number; width: number; height: number };
}

export interface MediaInfo {
  app: string;
  title: string;
  artist: string;
  playing: boolean;
  album?: string;
  state?: string;
  positionSec?: number;
  durationSec?: number;
  shuffle?: string;
  repeat?: string;
  volume?: number;
  muted?: boolean;
}

const modeArg = process.argv.find((a) => a.startsWith('--mate-mode='));

export interface MateApi {
  mode: 'pet' | 'hub';
  move: (x: number, y: number) => void;
  moveHub: (x: number, y: number) => void;
  setLogin: (value: boolean) => void;
  hubToggle: (force?: boolean) => void;
  onHubState: (cb: (open: boolean) => void) => () => void;
  setClickThrough: (value: boolean) => void;
  setGhostMode: (value: boolean) => void;
  getClickThrough: () => Promise<boolean>;
  setIdleAfter: (ms: number) => void;
  launch: (app: string) => void;
  media: (action: string, value?: string | number) => void;
  spotify: (action: 'open' | 'close') => void;
  nowPlaying: () => Promise<MediaInfo | null>;
  speak: (text: string, voice: string) => void;
  openUrl: (url: string) => void;
  openFolder: (kind: string) => void;
  openCustom: (dir: string) => Promise<string>;
  log: (entry: { q: string; tool: string; args?: string }) => void;
  typeText: (text: string) => void;
  lock: () => void;
  window: (action: string) => void;
  sysinfo: () => Promise<string>;
  screenshot: () => Promise<string | null>;
  notify: (title: string, body: string) => void;
  menu: () => void;
  quit: () => void;
  onCursor: (cb: (state: CursorState) => void) => () => void;
  onIdle: (cb: (idle: boolean) => void) => () => void;
  onContext: (cb: (title: string) => void) => () => void;
  onActivity: (cb: (a: { typing: boolean; fullscreen: boolean }) => void) => () => void;
  ask: (prompt: string, system: string, geminiKey: string, routerKey: string) => Promise<string | null>;
  spotifySearch: (query: string) => void;
  getVersion: () => Promise<string>;
  updateCheck: () => void;
  updateInstall: () => void;
  onUpdate: (cb: (s: { status: string; info?: string }) => void) => () => void;
  listen: () => Promise<string | null>;
  appFind: (query: string) => Promise<Array<{ score: number; name: string; path: string }>>;
  appOpen: (path: string) => Promise<string>;
  fileFind: (query: string) => Promise<string[]>;
  fileReveal: (path: string) => Promise<string>;
}

const api: MateApi = {
  mode: modeArg?.includes('hub') ? 'hub' : 'pet',
  move: (x, y) => ipcRenderer.send('mate:move', x, y),
  moveHub: (x, y) => ipcRenderer.send('hub:move', x, y),
  setLogin: (v) => ipcRenderer.send('mate:login', v),
  hubToggle: (force) => ipcRenderer.send('hub:toggle', force),
  onHubState: (cb) => {
    const l = (_e: unknown, open: boolean) => cb(open);
    ipcRenderer.on('hub:state', l as never);
    return () => ipcRenderer.removeListener('hub:state', l as never);
  },
  setClickThrough: (v) => ipcRenderer.send('mate:click-through', v),
  setGhostMode: (v) => ipcRenderer.send('mate:ghost-mode', v),
  getClickThrough: () => ipcRenderer.invoke('mate:click-through-state'),
  setIdleAfter: (ms) => ipcRenderer.send('mate:idle-after', ms),
  launch: (name) => ipcRenderer.send('mate:launch', name),
  media: (action, value) => ipcRenderer.send('mate:media', action, value ?? ''),
  spotify: (action) => ipcRenderer.send('mate:spotify', action),
  nowPlaying: () => ipcRenderer.invoke('mate:now-playing'),
  speak: (text, voice) => ipcRenderer.send('mate:speak', text, voice),
  openUrl: (url) => ipcRenderer.send('mate:open-url', url),
  openFolder: (kind) => ipcRenderer.send('mate:open-folder', kind),
  openCustom: (dir) => ipcRenderer.invoke('mate:open-custom', dir),
  log: (entry) => ipcRenderer.send('mate:log', entry),
  typeText: (text) => ipcRenderer.send('mate:type', text),
  lock: () => ipcRenderer.send('mate:lock'),
  window: (action: string) => ipcRenderer.send('mate:window', action),
  sysinfo: () => ipcRenderer.invoke('mate:sysinfo'),
  screenshot: () => ipcRenderer.invoke('mate:screenshot'),
  notify: (title, body) => ipcRenderer.send('mate:notify', title, body),
  menu: () => ipcRenderer.send('mate:menu'),
  quit: () => ipcRenderer.send('mate:quit'),
  onCursor: (cb) => {
    const l = (_e: unknown, s: CursorState) => cb(s);
    ipcRenderer.on('mate:cursor', l as never);
    return () => ipcRenderer.removeListener('mate:cursor', l as never);
  },
  onIdle: (cb) => {
    const l = (_e: unknown, idle: boolean) => cb(idle);
    ipcRenderer.on('mate:idle', l as never);
    return () => ipcRenderer.removeListener('mate:idle', l as never);
  },
  onContext: (cb) => {
    const l = (_e: unknown, title: string) => cb(title);
    ipcRenderer.on('mate:context', l as never);
    return () => ipcRenderer.removeListener('mate:context', l as never);
  },
  onActivity: (cb) => {
    const l = (_e: unknown, a: { typing: boolean; fullscreen: boolean }) => cb(a);
    ipcRenderer.on('mate:activity', l as never);
    return () => ipcRenderer.removeListener('mate:activity', l as never);
  },
  ask: (prompt, system, geminiKey, routerKey) => ipcRenderer.invoke('ai:ask', prompt, system, geminiKey, routerKey),
  spotifySearch: (query) => ipcRenderer.send('mate:spotify-search', query),
  getVersion: () => ipcRenderer.invoke('mate:version'),
  updateCheck: () => ipcRenderer.send('mate:update-check'),
  updateInstall: () => ipcRenderer.send('mate:update-install'),
  onUpdate: (cb) => {
    const l = (_e: unknown, s: { status: string; info?: string }) => cb(s);
    ipcRenderer.on('mate:update', l as never);
    return () => ipcRenderer.removeListener('mate:update', l as never);
  },
  listen: () => ipcRenderer.invoke('mate:listen'),
  appFind: (query) => ipcRenderer.invoke('mate:app-find', query),
  appOpen: (path) => ipcRenderer.invoke('mate:app-open', path),
  fileFind: (query) => ipcRenderer.invoke('mate:file-find', query),
  fileReveal: (path) => ipcRenderer.invoke('mate:file-reveal', path),
};

contextBridge.exposeInMainWorld('mate', api);