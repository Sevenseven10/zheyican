// TEMP VIEWPORT DIAGNOSTIC OVERLAY — remove after iPhone acceptance.
// READ-ONLY: never modifies layout, CSS variables, or viewport height.

const MAX = 10;
let collapsed = true;
let events: string[] = [];
let box: HTMLDivElement;
let hdr: HTMLDivElement;
let pre: HTMLDivElement;
let evtPre: HTMLDivElement;

function pad(n: number) { return String(n).padStart(2, '0'); }
function ms(n: number) { return String(n).padStart(3, '0'); }
function tick(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms(d.getMilliseconds())}`;
}

function probe(prop: string, val: string): string {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;visibility:hidden;width:0;${prop}:${val};`;
  document.body.appendChild(el);
  const cs = getComputedStyle(el) as unknown as Record<string, string>;
  const v = cs[prop === 'padding-bottom' ? 'paddingBottom' : 'height'];
  document.body.removeChild(el);
  return v ?? 'N/A';
}

function snapshot(): string {
  const vv = window.visualViewport;
  const root = document.getElementById('root');
  const rr = root?.getBoundingClientRect();
  const online = navigator.onLine;
  return [
    `EVENT:   ${currentEvt}`,
    `ONLINE:  ${online}`,
    ``,
    `window.innerHeight:       ${window.innerHeight}`,
    `window.outerHeight:       ${window.outerHeight}`,
    ``,
    `visualViewport.height:    ${vv?.height ?? 'N/A'}`,
    `visualViewport.offsetTop: ${vv?.offsetTop ?? 'N/A'}`,
    `visualViewport.pageTop:   ${vv?.pageTop ?? 'N/A'}`,
    ``,
    `documentElement.clientHeight: ${document.documentElement.clientHeight}`,
    `documentElement.scrollHeight: ${document.documentElement.scrollHeight}`,
    ``,
    `body.clientHeight: ${document.body.clientHeight}`,
    `body.scrollHeight: ${document.body.scrollHeight}`,
    ``,
    `#root.clientHeight:       ${root?.clientHeight ?? 'N/A'}`,
    `#root.scrollHeight:       ${root?.scrollHeight ?? 'N/A'}`,
    `#root.getBoundingClientRect().height: ${rr?.height ?? 'N/A'}`,
    ``,
    `100vh:  ${probe('height', '100vh')}`,
    `100dvh: ${probe('height', '100dvh')}`,
    `100svh: ${probe('height', '100svh')}`,
    `100lvh: ${probe('height', '100lvh')}`,
    ``,
    `safe-area-inset-bottom: ${probe('padding-bottom', 'env(safe-area-inset-bottom)')}`,
  ].join('\n');
}

let currentEvt = 'initial';

function log(evt: string) {
  currentEvt = evt;
  const vv = window.visualViewport;
  events.unshift(
    `${tick()} ${evt} ih=${window.innerHeight} vv=${vv?.height ?? '?'} ch=${document.documentElement.clientHeight} vh=${probe('height', '100vh')} dvh=${probe('height', '100dvh')} sab=${probe('padding-bottom', 'env(safe-area-inset-bottom)')}`
  );
  if (events.length > MAX) events.length = MAX;
  paint();
}

function paint() {
  hdr.textContent = `TEMP VIEWPORT DEBUG ${collapsed ? '\u25b6' : '\u25bc'} E:${currentEvt} O:${navigator.onLine ? 'ON' : 'OFF'}`;
  if (collapsed) { pre.textContent = ''; evtPre.textContent = ''; return; }
  pre.textContent = `\n${snapshot()}`;
  evtPre.textContent = `\n--- EVENTS (last ${MAX}) ---\n${events.join('\n')}`;
}

export function startViewportDebug() {
  if (typeof document === 'undefined' || !document.body) return;

  box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:rgba(0,0,0,.88);color:#0f0;font:9px/1.3 monospace;padding:4px 6px;max-width:100vw;max-height:80vh;overflow:auto;white-space:pre;pointer-events:auto;-webkit-user-select:text;user-select:text';

  hdr = document.createElement('div');
  hdr.style.cssText = 'cursor:pointer;font-size:10px;font-weight:bold;color:#0f0;padding:2px 0';
  hdr.addEventListener('click', () => { collapsed = !collapsed; paint(); });
  box.appendChild(hdr);

  pre = document.createElement('div');
  pre.style.cssText = 'margin:4px 0 0;white-space:pre-wrap;word-break:break-all';
  box.appendChild(pre);

  evtPre = document.createElement('div');
  evtPre.style.cssText = 'margin:8px 0 0;white-space:pre-wrap;word-break:break-all;border-top:1px solid #333;padding-top:4px;font-size:8px';
  box.appendChild(evtPre);

  document.body.appendChild(box);

  log('initial');

  window.addEventListener('resize', () => log('resize'));
  window.visualViewport?.addEventListener('resize', () => log('vv.resize'));
  window.addEventListener('online', () => log('online'));
  window.addEventListener('offline', () => log('offline'));
  document.addEventListener('visibilitychange', () => log(`vis:${document.visibilityState}`));
  window.addEventListener('pageshow', ((e: PageTransitionEvent) => log(`pageshow${e.persisted ? '.bfc' : ''}`)) as EventListener);
  window.addEventListener('pagehide', ((e: PageTransitionEvent) => log(`pagehide${e.persisted ? '.bfc' : ''}`)) as EventListener);
  window.addEventListener('focus', () => log('focus'));
  window.addEventListener('blur', () => log('blur'));

  setInterval(() => { if (!collapsed) paint(); }, 2000);
}
