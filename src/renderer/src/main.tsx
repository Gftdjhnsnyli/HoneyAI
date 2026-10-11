import React from 'react';
import ReactDOM from 'react-dom/client';
import HubStage from './HubStage';
import PetStage from './PetStage';
import './mate.css';

// Renderer error surface: a crash used to mean a silent invisible window.
// Now it logs (smoke-test tripwire included) and shows a reload card.
function reportCrash(kind: string, message: string): void {
  try {
    window.mate?.log({ q: message.slice(0, 200), tool: 'renderer-error', args: kind });
  } catch {
    // bridge unavailable
  }
  const root = document.getElementById('root');
  if (root && !root.dataset.crashed) {
    root.dataset.crashed = '1';
    root.textContent = '';
    const card = document.createElement('div');
    card.style.cssText = 'margin:8px;padding:12px;border-radius:12px;background:#1a1d23;color:#f0ece4;font:12px system-ui;border:1px solid rgba(255,255,255,.12)';
    const title = document.createElement('strong');
    title.textContent = 'Honey hit a snag';
    const sub = document.createElement('p');
    sub.style.cssText = 'opacity:.7;overflow-wrap:break-word';
    sub.textContent = message.slice(0, 160) || 'Something went wrong rendering this window.';
    const btn = document.createElement('button');
    btn.textContent = 'Reload';
    btn.style.cssText = 'margin-top:8px;padding:6px 14px;border-radius:8px;border:0;background:#d6b35a;color:#191510;font-weight:700;cursor:pointer';
    btn.addEventListener('click', () => window.location.reload());
    card.append(title, sub, btn);
    root.appendChild(card);
  }
}
window.addEventListener('error', (e) => reportCrash('error', String((e as ErrorEvent).message || (e as ErrorEvent).error || 'unknown')));
window.addEventListener('unhandledrejection', (e) => {
  const r = (e as PromiseRejectionEvent).reason as { message?: unknown } | null;
  reportCrash('rejection', String(r?.message || r || 'unknown'));
});

const root = document.getElementById('root')!;
const mode = new URLSearchParams(window.location.search).get('mode') || window.mate?.mode || 'pet';

ReactDOM.createRoot(root).render(
  <React.StrictMode>{mode === 'hub' ? <HubStage /> : <PetStage />}</React.StrictMode>
);
