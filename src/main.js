'use strict';
// Lychee: a real Chromium browser (Electron) with a custom dark UI.
const {
  app, BrowserWindow, WebContentsView, ipcMain, session, protocol, net,
  Menu, shell, dialog, clipboard, nativeTheme, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const safety = require('./safety');
const Themes = require('./shared/themes');
const { Updater } = require('./updater');
let updater = null;

const SRC = __dirname;
const PAGES = path.join(SRC, 'pages');
const SHARED = path.join(SRC, 'shared');
const HOME = 'lychee://home/';
// the active theme decides the window/background colours
const activeTheme = () => Themes.resolve(settings ? settings.data.theme : 'auto');
const themeBg = () => activeTheme().palette.bg;
const RAIL_W = 52;
// the left sidebar can be hidden (Win+Shift+Caps Lock, or Settings > Appearance)
const railW = () => (settings && settings.data.railHidden ? 0 : RAIL_W);
const STRIP_H = 40;
const TOOLBAR_H = 46;
const FIND_H = 42;
const SELFTEST = process.argv.includes('--selftest');
const SHOTS_ARG = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS_DIR = SHOTS_ARG ? SHOTS_ARG.slice(8) : null;

app.setName('Lychee');
const IS_MAC = process.platform === 'darwin';
if (process.platform === 'win32') app.setAppUserModelId('com.lychee.browser');

// Portable mode (Windows zip build): keep the profile in a "Profile" folder next to Lychee.exe,
// so settings/logins travel on a USB stick and nothing is left on the PC.
// The installed (NSIS) version has "Uninstall Lychee.exe" beside it, so that's how we tell them apart.
const EXE_DIR = path.dirname(process.execPath);
const IS_PORTABLE = app.isPackaged && process.platform === 'win32' && !fs.existsSync(path.join(EXE_DIR, 'Uninstall Lychee.exe'));
if (IS_PORTABLE && !process.argv.includes('--selftest')) app.setPath('userData', path.join(EXE_DIR, 'Profile'));
if (SELFTEST) app.setPath('userData', path.join(app.getPath('temp'), 'lychee-selftest'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'lychee', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ---------------------------------------------------------------- storage
function store(name, fallback) {
  const file = path.join(app.getPath('userData'), name + '.json');
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = structuredClone(fallback); }
  let timer = null;
  return {
    get data() { return data; },
    set data(v) { data = v; this.save(); },
    // throttled, not debounced: a busy page (YouTube retitles itself constantly) must not keep pushing the write back
    save() { if (!timer) timer = setTimeout(() => this.flush(), 500); },
    flush() {
      clearTimeout(timer);
      timer = null;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(data));
        fs.renameSync(file + '.tmp', file);
      } catch (e) { console.error('save failed', name, e); }
    },
  };
}

const ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
};

// DNS-over-HTTPS providers. IP-literal templates so the DoH server itself never needs a plain DNS lookup.
const DNS_PROVIDERS = {
  cloudflare: { name: 'Cloudflare', servers: ['https://1.1.1.1/dns-query', 'https://1.0.0.1/dns-query'] },
  google: { name: 'Google', servers: ['https://8.8.8.8/dns-query', 'https://8.8.4.4/dns-query'] },
  quad9: { name: 'Quad9', servers: ['https://9.9.9.9/dns-query', 'https://149.112.112.112/dns-query'] },
  adguard: { name: 'AdGuard (blocks ads)', servers: ['https://94.140.14.14/dns-query', 'https://94.140.15.15/dns-query'] },
};

const DEFAULT_SETTINGS = {
  searchSkin: true,
  ytTheme: true,
  ytAds: true,
  ytAmbient: true,
  ytHD: true,
  railHidden: false,
  autoUpdate: true,
  theme: 'lychee',
  lastAutoTheme: '',
  effects: true,
  effectAmount: 'normal',
  effectsOnSearch: true,
  wallpaper: 'theme',
  wallpaperDim: 35,
  wallpaperFile: '',
  wallpaperRev: 0,
  panicKey: 'Backquote',
  panicUrl: 'https://classroom.google.com/',
  disguise: 'none',
  confirmClose: false,
  historyPaused: false,
  clearOnExit: { history: false, cookies: false, cache: false },
  httpsOnly: true,
  uaPreset: 'default',
  dnsProvider: 'cloudflare',
  dnsStrict: false,
  dnsCustom: '',
  searchEngine: 'duckduckgo',
  accent: '#ff6b8b',
  adblock: true,
  restoreTabs: true,
  showClock: true,
  askDownload: false,
  proxy: '',
  sitePermissions: {},
  shortcuts: [
    { title: 'YouTube', url: 'https://www.youtube.com/' },
    { title: 'Google', url: 'https://www.google.com/' },
    { title: 'Reddit', url: 'https://www.reddit.com/' },
    { title: 'GitHub', url: 'https://github.com/' },
    { title: 'Wikipedia', url: 'https://en.wikipedia.org/' },
    { title: 'Discord', url: 'https://discord.com/app' },
  ],
};

const isBool = (v) => typeof v === 'boolean';
const SETTING_RULES = {
  searchEngine: (v) => typeof v === 'string' && !!ENGINES[v],
  accent: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
  adblock: isBool,
  restoreTabs: isBool,
  showClock: isBool,
  askDownload: isBool,
  proxy: (v) => typeof v === 'string' && v.length < 300,
  dnsProvider: (v) => typeof v === 'string' && (v === 'off' || v === 'custom' || !!DNS_PROVIDERS[v]),
  dnsStrict: isBool,
  searchSkin: isBool,
  ytTheme: isBool,
  ytAds: isBool,
  ytAmbient: isBool,
  ytHD: isBool,
  railHidden: isBool,
  autoUpdate: isBool,
  theme: (v) => v === 'auto' || (typeof v === 'string' && !!Themes.THEMES[v]),
  effects: isBool,
  effectAmount: (v) => /^(light|normal|heavy)$/.test(v),
  effectsOnSearch: isBool,
  wallpaper: (v) => v === 'theme' || v === 'none' || (v === 'custom' && !!settings.data.wallpaperFile),
  wallpaperDim: (v) => Number.isFinite(v) && v >= 0 && v <= 85,
  panicKey: (v) => typeof v === 'string' && /^((Ctrl|Alt|Shift)\+){0,3}[A-Za-z0-9]{1,20}$/.test(v) && !/(^|\+)F8$/.test(v),
  panicUrl: (v) => typeof v === 'string' && v.length < 500 && /^https?:\/\/\S+$/i.test(v),
  disguise: (v) => typeof v === 'string' && !!safety.DISGUISES[v],
  confirmClose: isBool,
  historyPaused: isBool,
  clearOnExit: (v) => !!v && typeof v === 'object' && ['history', 'cookies', 'cache'].every((k) => isBool(v[k])) && Object.keys(v).length === 3,
  httpsOnly: isBool,
  uaPreset: (v) => typeof v === 'string' && /^(default|edge|firefox|safari|android|iphone)$/.test(v),
  dnsCustom: (v) => typeof v === 'string' && v.length < 600 &&
    v.split(/[\s,]+/).filter(Boolean).every((s) => /^https:\/\/[^\s]+$/i.test(s)),
  shortcuts: (v) => Array.isArray(v) && v.length <= 48 && v.every((s) =>
    s && typeof s.title === 'string' && s.title.length < 80 &&
    typeof s.url === 'string' && /^(https?|lychee):\/\//i.test(s.url)),
};

let settings, history, bookmarks, stats, favicons, sessionStore, downloadStore;

// ---------------------------------------------------------------- state
// Every window ("W") has its own tab order, active tab and UI; tabs live in one shared map and
// point at their window (t.w), so a tab can move between windows.
// W = { id, win, ui, order, activeId, topInset, htmlFullscreen, findOpen, closeConfirmed, prompt, anchor }
const wins = new Map();
let lastW = null;
const tabs = new Map();
let nextTabId = 1;
const closedStack = [];
let blocker = null;
let blockerOn = false;
let panic = null; // { tabId, prev, muted: [ids] } while the panic screen is up
const httpExceptions = new Set(); // hosts the user let load over plain HTTP this run
const certExceptions = new Set(); // hosts the user chose to visit despite a bad certificate this run
const extraSessions = new Map(); // 'private' | 'tor' -> Session
let baseUA = '';
let exitCleaned = false;
let quitting = false;

// the window the user is working in (focused, else the last one that was)
function curW() {
  const f = BrowserWindow.getFocusedWindow();
  if (f && wins.has(f.id)) return wins.get(f.id);
  if (lastW && wins.has(lastW.id)) return lastW;
  return wins.values().next().value || null;
}
const allW = () => [...wins.values()];
const wOfUi = (wc) => allW().find((W) => W.ui === wc) || null;
const sendAllUi = (ch, data) => { for (const W of wins.values()) W.ui.send(ch, data); };

const tor = new safety.Tor((st) => {
  sendAllUi('tor', st);
  broadcastPages('tor', st);
  if (st.state === 'ready') {
    // tabs waiting on the "connecting to Tor" page can go now
    for (const t of tabs.values()) {
      const u = t.wc.getURL();
      if (t.kind === 'tor' && u.startsWith('lychee://tor')) {
        const next = new URL(u).searchParams.get('next');
        if (next) t.wc.loadURL(next).catch(() => {});
      }
    }
  }
});

// ---------------------------------------------------------------- helpers
const engine = () => ENGINES[settings.data.searchEngine] || ENGINES.duckduckgo;
const searchUrl = (q) => engine().url.replace('%s', encodeURIComponent(q));

function resolveInput(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^(lychee|https?|file):/i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) return 'http://' + t;
  if (!/\s/.test(t) && /^[^\s/?#]+\.[a-z][a-z0-9-]{1,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
  return searchUrl(t);
}

function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }
function originOf(url) { try { return new URL(url).origin; } catch { return ''; } }
const strip = (u) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

function realUrl(url) {
  if (url && url.startsWith('lychee://error')) {
    try { return new URL(url).searchParams.get('url') || url; } catch { return url; }
  }
  return url;
}

function internalPage(url) {
  const m = /^lychee:\/\/([a-z-]+)/i.exec(url || '');
  return m ? m[1].toLowerCase() : null;
}

function isInternalSender(e) {
  const u = e.senderFrame && e.senderFrame.url;
  return typeof u === 'string' && u.startsWith('lychee://');
}

// ---------------------------------------------------------------- protocol
function registerProtocol(ses) {
  ses.protocol.handle('lychee', async (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname);
    let root, file;
    if (rel === '/' || rel === '') { root = PAGES; file = path.join(PAGES, u.hostname + '.html'); }
    else if (rel === '/userdata/wallpaper') {
      // the user's own wallpaper image, copied into the profile by "Choose image"
      const f = settings.data.wallpaperFile && path.join(app.getPath('userData'), settings.data.wallpaperFile);
      if (f && fs.existsSync(f)) return net.fetch(pathToFileURL(f).toString());
      return new Response('', { status: 404 });
    }
    else if (rel.startsWith('/shared/')) { root = SHARED; file = path.join(SHARED, rel.slice(8)); }
    else { root = PAGES; file = path.join(PAGES, rel); }
    const resolved = path.resolve(file);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) {
      return new Response('<h1 style="font-family:sans-serif;color:#ccc;background:#0f0a0b">Not found</h1>',
        { status: 404, headers: { 'content-type': 'text/html' } });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}

// ---------------------------------------------------------------- sessions
// normal tabs share the persistent default session; private and Tor tabs each get an
// in-memory session (no "persist:" prefix) that is wiped when Lychee closes.
function setupSession(ses, kind) {
  ses.setUserAgent(currentUA());
  ses.setSpellCheckerEnabled(true);
  registerProtocol(ses);
  wirePermissions(ses);
  wireDownloads(ses);
  googleHeaders(ses);
  if (kind === 'tor') ses.setProxy({ proxyRules: `socks5://127.0.0.1:${tor.port}`, proxyBypassRules: '<-loopback>' });
  else if (settings.data.proxy.trim()) ses.setProxy({ proxyRules: settings.data.proxy.trim(), proxyBypassRules: '<local>' });
  if (blocker && blockerOn) blockIn(ses);
}

function sessionFor(kind) {
  if (kind !== 'private' && kind !== 'tor') return session.defaultSession;
  let ses = extraSessions.get(kind);
  if (!ses) {
    ses = session.fromPartition(`lychee-${kind}`);
    setupSession(ses, kind);
    extraSessions.set(kind, ses);
  }
  return ses;
}

const allSessions = () => [session.defaultSession, ...extraSessions.values()];

function currentUA() {
  const presets = safety.uaPresets(baseUA);
  return (presets[settings.data.uaPreset] || presets.default).ua;
}

// ---------------------------------------------------------------- Google sign-in
// Google blocks sign-in from "embedded" Chromium (Electron) with "This browser or app may not be
// secure". It does allow Firefox, so on Google's sign-in host only, Lychee presents itself as Firefox:
// Firefox UA + no Chromium client hints on the wire, and navigator matches (see preload-page.js).
const GOOGLE_AUTH_RE = /^https:\/\/accounts\.google\.com\//i;
const firefoxUA = () => safety.uaPresets(baseUA).firefox.ua;

function googleHeaders(ses) {
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*'] }, (d, cb) => {
    const h = d.requestHeaders;
    for (const k of Object.keys(h)) if (/^user-agent$|^sec-ch-ua/i.test(k)) delete h[k];
    h['User-Agent'] = firefoxUA();
    cb({ requestHeaders: h });
  });
}

// keep navigator.userAgent in step with the headers while a tab/popup is on the sign-in pages
function googleUA(wc) {
  let on = false;
  // Switch right away when a navigation starts, so the new page's navigator.userAgent matches.
  // Changing the UA synchronously inside a *redirect* event crashes Electron, so redirects defer a
  // tick (their request headers are already handled by googleHeaders).
  const apply = (want) => {
    if (wc.isDestroyed()) return;
    try { wc.setUserAgent(want ? firefoxUA() : currentUA()); } catch {}
  };
  const sync = (url, deferred) => {
    const want = GOOGLE_AUTH_RE.test(url || '');
    if (want === on) return;
    on = want;
    if (deferred) setImmediate(() => apply(want)); else apply(want);
  };
  wc.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) sync(url, false); });
  wc.on('did-redirect-navigation', (e, url, isInPlace, isMainFrame) => { if (isMainFrame) sync(url, true); });
  sync(wc.getURL(), true);
}

function applyUA() {
  const ua = currentUA();
  app.userAgentFallback = ua;
  for (const s of allSessions()) s.setUserAgent(ua);
  for (const t of tabs.values()) t.wc.setUserAgent(ua);
}

// ---------------------------------------------------------------- https-only
function needsUpgrade(url) {
  if (!settings.data.httpsOnly || !/^http:\/\//i.test(url)) return false;
  const host = hostOf(url);
  return !safety.isLocalHost(host) && !httpExceptions.has(host);
}
const toHttps = (url) => url.replace(/^http:/i, 'https:');

function loadInTab(t, url) {
  if (isDuckAi(url)) url = blockedAiPage(url);
  if (needsUpgrade(url)) { t.upgradedFrom = url; url = toHttps(url); }
  t.wc.loadURL(url).catch(() => {});
}

// ---------------------------------------------------------------- site skins
// Restyles DuckDuckGo to look like Lychee by injecting a stylesheet (only inside Lychee).
const DDG_RE = /^https:\/\/([a-z0-9-]+\.)*duckduckgo\.com\//i;
const YT_RE = /^https:\/\/(www\.|m\.|music\.)?youtube\.com\//i;
// each skin: which stylesheets to inject (depending on settings), an optional isolated-world script,
// optional config handed to that script, and whether theme effects fall over the page
const SKINS = [
  {
    match: DDG_RE,
    css: () => (settings.data.searchSkin ? ['duckduckgo'] : []),
    script: () => (settings.data.searchSkin ? 'duckduckgo.js' : null),
    fx: () => settings.data.searchSkin,
  },
  {
    match: YT_RE,
    css: () => [settings.data.ytTheme && 'youtube', settings.data.ytAds && 'youtube-ads', settings.data.ytAmbient && 'youtube-ambient'].filter(Boolean),
    script: () => ((settings.data.ytAds || settings.data.ytAmbient) ? 'youtube.js' : null),
    config: () => `window.__lycheeYT = ${JSON.stringify({ ads: settings.data.ytAds, ambient: settings.data.ytAmbient })};`,
    fx: () => false, // no snow over videos
    // main world: the player's quality API isn't reachable from an isolated world
    main: () => 'youtube-quality.js',
    mainConfig: () => `window.__lycheeHDOn = ${!!settings.data.ytHD};`,
  },
];
const skinCache = {};
let skinFont = null;
let logoData = null;
const lycheeLogo = () => (logoData ||= 'data:image/png;base64,' + fs.readFileSync(path.join(SHARED, 'icon.png')).toString('base64'));
const isLycheeSearch = (url) => settings.data.searchSkin && DDG_RE.test(url || '');
// with the skin on, DuckDuckGo is presented as "Lychee Search" (credited in Settings > About)
const engineName = (k = settings.data.searchEngine) =>
  (k === 'duckduckgo' && settings.data.searchSkin ? 'Lychee Search' : (ENGINES[k] || ENGINES.duckduckgo).name);

function skinCss(name) {
  if (!skinFont) {
    const f = path.join(SHARED, 'fonts', 'google-sans-flex-latin-wght-normal.woff2');
    skinFont = 'data:font/woff2;base64,' + fs.readFileSync(f).toString('base64');
  }
  if (!skinCache[name]) skinCache[name] = fs.readFileSync(path.join(SRC, 'skins', name + '.css'), 'utf8');
  const accent = settings.data.accent;
  const n = parseInt(accent.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  const pal = activeTheme().palette;
  return skinCache[name]
    .replace(/\{\{P\.(\w+)\}\}/g, (m, k) => pal[k] || m)
    .replaceAll('{{ACCENT}}', accent)
    .replaceAll('{{INK}}', lum > 0.45 ? '#1c0a0f' : '#ffffff')
    .replaceAll('{{FONT}}', skinFont)
    .replaceAll('{{LOGO}}', lycheeLogo());
}

async function applySkin(t) {
  const gen = (t.skinGen = (t.skinGen || 0) + 1);
  for (const k of t.skinKeys || []) t.wc.removeInsertedCSS(k).catch(() => {});
  t.skinKeys = [];
  const url = t.wc.getURL() || '';
  const skin = SKINS.find((s) => s.match.test(url));
  if (!skin) return;
  for (const name of skin.css()) {
    try {
      const key = await t.wc.insertCSS(skinCss(name));
      if (gen !== t.skinGen) { t.wc.removeInsertedCSS(key).catch(() => {}); return; } // superseded meanwhile
      t.skinKeys.push(key);
    } catch {}
  }
  // the skin's script (renaming, image sidebar, ad skipping, ambient light) runs in an isolated
  // world: it shares the DOM, but the site's own scripts can't see or touch it
  const script = skin.script();
  if (gen !== t.skinGen) return;
  if (skin.config) t.wc.executeJavaScriptInIsolatedWorld(1999, [{ code: skin.config() }]).catch(() => {});
  if (script) {
    if (!skinCache[script]) skinCache[script] = fs.readFileSync(path.join(SRC, 'skins', script), 'utf8');
    t.wc.executeJavaScriptInIsolatedWorld(1999, [{ code: skinCache[script] }]).catch(() => {});
  }
  if (skin.main) {
    const m = skin.main();
    if (!skinCache[m]) skinCache[m] = fs.readFileSync(path.join(SRC, 'skins', m), 'utf8');
    t.wc.executeJavaScript(skin.mainConfig() + skinCache[m]).catch(() => {});
  }
  // theme effects (snow, leaves...) over the search page; the canvas ignores the mouse
  if (skin.fx()) {
    if (!skinCache.fx) skinCache.fx = fs.readFileSync(path.join(SHARED, 'effects.js'), 'utf8');
    const th = activeTheme();
    const on = settings.data.effects && settings.data.effectsOnSearch && th.effect !== 'none';
    const amount = (on ? 0.6 : 0) * ({ light: 0.5, normal: 1, heavy: 2.2 }[settings.data.effectAmount] || 1);
    const code = `${skinCache.fx};(() => {
      let c = document.getElementById('lychee-fx');
      if (!c && ${on}) {
        c = document.createElement('canvas');
        c.id = 'lychee-fx';
        c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;opacity:.9';
        document.documentElement.appendChild(c);
        window.__lycheeFx = window.LycheeEffects.start(c, {});
      }
      if (window.__lycheeFx) window.__lycheeFx.set({ type: ${JSON.stringify(on ? th.effect : 'none')}, amount: ${amount} });
    })()`;
    t.wc.executeJavaScriptInIsolatedWorld(1999, [{ code }]).catch(() => {});
  }
}

const reskinAll = () => { for (const t of tabs.values()) applySkin(t); };

// FOR NOW (see FOR NOW.md): AI chat (Duck.ai) is switched off. Set to false to undo.
const BLOCK_DUCK_AI = true;
function isDuckAi(url) {
  if (!BLOCK_DUCK_AI) return false;
  try {
    const u = new URL(url);
    if (/(^|\.)duck\.ai$/i.test(u.hostname)) return true;
    if (/(^|\.)duckduckgo\.com$/i.test(u.hostname)) {
      return /^\/(chat|aichat|duckchat)\b/i.test(u.pathname) || /^(chat|aichat|duckchat)$/i.test(u.searchParams.get('ia') || '');
    }
  } catch {}
  return false;
}
const blockedAiPage = (url) => `lychee://error/?code=ai-off&desc=${encodeURIComponent('AI chat is turned off')}&url=${encodeURIComponent(url)}`;

// search results page of the current engine -> the search terms (shown in the address bar instead of the URL)
function searchQuery(url) {
  if (!isLycheeSearch(url)) return null;
  try { const q = new URL(url).searchParams.get('q'); return q && q.trim() ? q : null; } catch { return null; }
}

// ---------------------------------------------------------------- panic + disguise
function matchesPanic(input) {
  const parts = String(settings.data.panicKey || '').split('+');
  const code = parts.pop();
  if (!code || input.code !== code) return false;
  return !!input.control === parts.includes('Ctrl') && !!input.alt === parts.includes('Alt') && !!input.shift === parts.includes('Shift');
}

function togglePanic() {
  if (panic) { exitPanic(); return; }
  const W = curW();
  if (!W) return;
  const prev = W.activeId;
  const muted = [];
  for (const t of tabs.values()) if (!t.wc.isAudioMuted()) { t.wc.setAudioMuted(true); muted.push(t.id); }
  if (W.htmlFullscreen) { const t = activeTab(W); if (t) t.wc.executeJavaScript('document.exitFullscreen && document.exitFullscreen()').catch(() => {}); }
  if (W.findOpen) W.ui.send('find-close');
  hidePrompt(W);
  // every other window disappears until the panic screen is closed
  const hidden = [];
  for (const o of wins.values()) if (o !== W && o.win.isVisible()) { o.win.hide(); hidden.push(o.id); }
  const pt = createTab(settings.data.panicUrl, { w: W });
  panic = { tabId: pt.id, prev, muted, wid: W.id, hidden };
  sendTabs(W);
}

function exitPanic() {
  const p = panic;
  panic = null;
  if (!p) return;
  for (const id of p.muted) { const t = tabs.get(id); if (t) t.wc.setAudioMuted(false); }
  if (tabs.has(p.tabId)) closeTab(p.tabId, { silent: true });
  if (tabs.has(p.prev)) activate(p.prev);
  for (const id of p.hidden) { const o = wins.get(id); if (o) o.win.showInactive(); }
  sendTabs();
}

let disguiseImg = null;
async function applyDisguise() {
  const key = settings.data.disguise;
  disguiseImg = key === 'none' ? null : await safety.disguiseIcon(key);
  if (IS_MAC) { if (app.dock) app.dock.setIcon(disguiseImg || path.join(SHARED, 'icon.png')); }
  else for (const W of wins.values()) W.win.setIcon(disguiseImg || path.join(SHARED, 'icon.png'));
  sendTabs();
}

// ---------------------------------------------------------------- window
// opts.bounds places the window (a tab dragged out lands under the cursor)
function createWindow(opts = {}) {
  const b = opts.bounds || {};
  const win = new BrowserWindow({
    width: b.width || 1360, height: b.height || 860,
    ...(b.x != null && b.y != null ? { x: b.x, y: b.y } : {}),
    minWidth: 640, minHeight: 420,
    backgroundColor: themeBg(),
    title: 'Lychee',
    icon: disguiseImg || path.join(SHARED, 'icon.png'),
    // Windows: our own tab strip with Windows' min/max/close drawn on top (overlay).
    // Mac: the traffic lights sit at the top left, over the rail.
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 16, y: 13 } }
      : { titleBarOverlay: { color: themeBg(), symbolColor: activeTheme().palette.muted, height: STRIP_H } }),
    show: false,
    webPreferences: {
      preload: path.join(SRC, 'preload-ui.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  const W = {
    id: win.id, win, ui: win.webContents, order: [], activeId: null,
    topInset: STRIP_H + TOOLBAR_H, htmlFullscreen: false, findOpen: false, closeConfirmed: false,
    prompt: null, anchor: null, dying: false,
  };
  wins.set(W.id, W);
  if (!lastW) lastW = W;
  W.ui.on('before-input-event', onKey);
  win.loadFile(path.join(SRC, 'ui', 'index.html'));
  win.once('ready-to-show', () => { if (!SELFTEST) win.show(); });
  win.on('focus', () => { lastW = W; });
  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, () => layout(W));
  win.on('close', (e) => {
    if (W.dying) return; // emptied because its last tab moved to another window
    const lastOne = wins.size === 1;
    if (settings.data.confirmClose && !W.closeConfirmed && !SELFTEST && !quitting) {
      e.preventDefault();
      const n = W.order.length;
      dialog.showMessageBox(win, {
        type: 'question', buttons: [lastOne ? 'Close Lychee' : 'Close window', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
        title: lastOne ? 'Close Lychee?' : 'Close window?',
        message: `Close ${lastOne ? 'Lychee' : 'this window'} with ${n} tab${n === 1 ? '' : 's'} open?`,
      }).then((r) => { if (r.response === 0 && !win.isDestroyed()) { W.closeConfirmed = true; win.close(); } });
      return;
    }
    if (lastOne) { saveSession(); flushAll(); }
  });
  win.on('closed', () => {
    wins.delete(W.id);
    if (lastW === W) lastW = null;
    // the window's tabs close with it
    const kinds = new Set();
    for (const id of W.order) {
      const t = tabs.get(id);
      if (!t) continue;
      tabs.delete(id);
      kinds.add(t.kind);
      dropPrompts(t);
      try { t.wc.close(); } catch {}
    }
    W.order = [];
    for (const k of kinds) if (k !== 'normal' && ![...tabs.values()].some((x) => x.kind === k)) wipeSession(k);
    if (panic && panic.wid === W.id) {
      for (const id of panic.muted) { const t = tabs.get(id); if (t) t.wc.setAudioMuted(false); }
      for (const id of panic.hidden) { const o = wins.get(id); if (o) o.win.showInactive(); }
      panic = null;
    }
    if (wins.size && !quitting) saveSessionSoon();
  });
  return W;
}

function layout(W) {
  if (!W) { for (const x of wins.values()) layout(x); return; }
  if (W.win.isDestroyed()) return;
  const [w, h] = W.win.getContentSize();
  const b = W.htmlFullscreen
    ? { x: 0, y: 0, width: w, height: h }
    : { x: railW(), y: W.topInset, width: Math.max(0, w - railW()), height: Math.max(0, h - W.topInset) };
  for (const id of W.order) { const t = tabs.get(id); if (t) t.view.setBounds(b); }
  placePrompt(W);
}

function newWindow(url = HOME, opts = {}) {
  const W = createWindow(opts);
  createTab(url, { w: W, focusOmnibox: url === HOME, kind: opts.kind });
  return W;
}

// ---------------------------------------------------------------- tabs
function createTab(url = HOME, opts = {}) {
  const parent = opts.afterId != null ? tabs.get(opts.afterId) : null;
  const W = opts.w || (parent && parent.w) || curW() || createWindow();
  const kind = opts.kind === 'private' || opts.kind === 'tor' ? opts.kind : 'normal';
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(SRC, 'preload-page.js'),
      contextIsolation: true,
      sandbox: true,
      session: sessionFor(kind),
    },
  });
  view.setBackgroundColor(themeBg());
  const id = nextTabId++;
  const tab = { id, kind, view, wc: view.webContents, title: 'New tab', favicon: null, loading: true, url, blocked: 0, w: W };
  if (kind === 'tor') {
    // keep WebRTC from leaking the real IP around the proxy
    tab.wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    if (tor.state !== 'ready') {
      url = `lychee://tor/?next=${encodeURIComponent(url)}`;
      tor.start();
    }
  }
  tabs.set(id, tab);
  const after = parent && parent.w === W ? W.order.indexOf(opts.afterId) : -1;
  if (after >= 0) {
    // keep tabs opened from the same parent in order, like Chrome
    let i = after + 1;
    while (i < W.order.length && tabs.get(W.order[i]).openerId === opts.afterId) i++;
    tab.openerId = opts.afterId;
    W.order.splice(i, 0, id);
  } else W.order.push(id);
  W.win.contentView.addChildView(view);
  view.setVisible(false);
  wireTab(tab);
  layout(W);
  // opened in the background (middle click etc.): videos wait until the tab is first opened, like Chrome
  if (opts.activate === false) holdMedia(tab);
  loadInTab(tab, url);
  if (opts.activate !== false) activate(id, { focusOmnibox: opts.focusOmnibox });
  else { sendTabsSoon(); raisePrompt(W); }
  saveSessionSoon();
  return tab;
}

// ---- background tabs: hold autoplay until the tab is shown
// The script runs in an isolated world, so pages can't see or undo it. Media events don't bubble,
// but a capturing listener on the document still sees every play().
const HOLD_JS = `(() => {
  if (window.__lycheeHold) { window.__lycheeHold.on = true; return; }
  const H = window.__lycheeHold = { on: true, paused: new Set() };
  const stop = (e) => { const m = e.target; if (H.on && m instanceof HTMLMediaElement) { H.paused.add(m); m.pause(); } };
  document.addEventListener('play', stop, true);
  document.addEventListener('playing', stop, true);
  for (const m of document.querySelectorAll('video, audio')) if (!m.paused) { H.paused.add(m); m.pause(); }
})()`;
const RELEASE_JS = `(() => { const H = window.__lycheeHold; if (!H) return; H.on = false;
  for (const m of H.paused) if (m.isConnected) m.play().catch(() => {}); H.paused.clear(); })()`;
const MEDIA_WORLD = 1998;

function toggleMute(t) {
  // a held background tab is muted by Lychee but shown as unmuted, so clicking mute keeps it muted for real
  if (t.holdMuted) t.holdMuted = false;
  else t.wc.setAudioMuted(!t.wc.isAudioMuted());
  sendTabsSoon();
}
function holdMedia(t) {
  t.holdMedia = true;
  if (!t.wc.isAudioMuted()) { t.wc.setAudioMuted(true); t.holdMuted = true; } // no sound blip before the script lands
}
function injectHold(t) {
  if (t.holdMedia) t.wc.executeJavaScriptInIsolatedWorld(MEDIA_WORLD, [{ code: HOLD_JS }]).catch(() => {});
}
function releaseMedia(t) {
  if (!t.holdMedia) return;
  t.holdMedia = false;
  if (t.holdMuted) { t.holdMuted = false; t.wc.setAudioMuted(false); }
  t.wc.executeJavaScriptInIsolatedWorld(MEDIA_WORLD, [{ code: RELEASE_JS }]).catch(() => {});
}

function activate(id, opts = {}) {
  const t = tabs.get(id);
  if (!t) return;
  const W = t.w;
  releaseMedia(t);
  if (W.activeId !== id && W.findOpen) { const old = tabs.get(W.activeId); if (old) old.wc.stopFindInPage('clearSelection'); }
  W.activeId = id;
  for (const x of W.order) { const o = tabs.get(x); if (o) o.view.setVisible(x === id); }
  sendTabs(W);
  saveSessionSoon();
  refreshPrompt(W);
  if (opts.focusOmnibox) focusOmnibox(W);
  else if (!opts.keepFocus) t.wc.focus();
}

function closeTab(id, opts = {}) {
  const t = tabs.get(id);
  if (!t) return;
  const W = t.w;
  if (panic && panic.tabId === id && !opts.silent) { exitPanic(); return; }
  const idx = W.order.indexOf(id);
  const url = realUrl(t.wc.getURL() || t.url);
  // private/Tor tabs leave no trace, not even in "reopen closed tab"
  if (!opts.silent && t.kind === 'normal') {
    closedStack.push({ url, index: idx });
    if (closedStack.length > 30) closedStack.shift();
  }
  W.order.splice(idx, 1);
  tabs.delete(id);
  for (const x of tabs.values()) if (x.openerId === id) x.openerId = null;
  dropPrompts(t);
  W.win.contentView.removeChildView(t.view);
  try { t.wc.close(); } catch {}
  if (t.kind !== 'normal' && ![...tabs.values()].some((x) => x.kind === t.kind)) wipeSession(t.kind);
  if (!W.order.length) {
    // last tab of a window: the window goes too, unless it's the only one left
    if (wins.size > 1) { W.dying = true; W.win.close(); saveSessionSoon(); return; }
    createTab(HOME, { focusOmnibox: true, w: W });
    return;
  }
  if (W.activeId === id) {
    const opener = t.openerId && tabs.has(t.openerId) && tabs.get(t.openerId).w === W ? t.openerId : null;
    activate(opener || W.order[Math.min(idx, W.order.length - 1)]);
  } else sendTabs(W);
  saveSessionSoon();
}

function reopenTab(W = curW()) {
  const c = closedStack.pop();
  if (!c) return;
  const t = createTab(c.url, { w: W });
  const i = t.w.order.indexOf(t.id);
  t.w.order.splice(i, 1);
  t.w.order.splice(Math.min(c.index, t.w.order.length), 0, t.id);
  sendTabs(t.w);
}

function moveTab(id, toIndex) {
  const t = tabs.get(id);
  if (!t) return;
  const order = t.w.order;
  const i = order.indexOf(id);
  if (i < 0) return;
  order.splice(i, 1);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, id);
  sendTabs(t.w);
  saveSessionSoon();
}

// a tab dropped onto another window's tab strip (or dragged out into a new window)
function moveTabToWindow(id, W2, index) {
  const t = tabs.get(id);
  if (!t || !W2 || W2.win.isDestroyed()) return;
  const W1 = t.w;
  if (W1 === W2) { if (index != null) moveTab(id, index); return; }
  if (panic && panic.tabId === id) return;
  const i = W1.order.indexOf(id);
  W1.order.splice(i, 1);
  W1.win.contentView.removeChildView(t.view);
  t.w = W2;
  t.openerId = null;
  for (const x of tabs.values()) if (x.openerId === id) x.openerId = null;
  const at = index == null ? W2.order.length : Math.max(0, Math.min(index, W2.order.length));
  W2.order.splice(at, 0, id);
  W2.win.contentView.addChildView(t.view);
  layout(W2);
  activate(id);
  if (!W2.win.isVisible() && !SELFTEST) W2.win.show();
  if (!SELFTEST) W2.win.focus();
  // the window it came from
  if (!W1.order.length) { W1.dying = true; W1.win.close(); }
  else {
    if (W1.activeId === id) activate(W1.order[Math.min(i, W1.order.length - 1)], { keepFocus: true });
    else sendTabs(W1);
    refreshPrompt(W1);
  }
  saveSessionSoon();
}

// drag a tab off the strip and let go: it becomes its own window under the cursor, like Chrome
function detachTab(id, at) {
  const t = tabs.get(id);
  if (!t) return null;
  const W1 = t.w;
  const nb = W1.win.getNormalBounds();
  const p = at || screen.getCursorScreenPoint();
  // the dragged tab lands roughly under the cursor (tabs start right of the rail)
  const bounds = { x: Math.round(p.x - railW() - 90), y: Math.round(p.y - 16), width: nb.width, height: nb.height };
  if (W1.order.length === 1) {
    // it's the window's only tab: just move the window there
    if (W1.win.isMaximized()) W1.win.unmaximize();
    W1.win.setBounds(bounds);
    return W1;
  }
  const W2 = createWindow({ bounds });
  moveTabToWindow(id, W2, 0);
  return W2;
}

function moveToNewWindow(id) {
  const t = tabs.get(id);
  if (!t || t.w.order.length < 2) return;
  const nb = t.w.win.getNormalBounds();
  const W2 = createWindow({ bounds: { x: nb.x + 40, y: nb.y + 40, width: nb.width, height: nb.height } });
  moveTabToWindow(id, W2, 0);
}

const activeTab = (W = curW()) => (W ? tabs.get(W.activeId) : undefined);

// last private/Tor tab closed: throw away everything that session collected
function wipeSession(kind) {
  const ses = extraSessions.get(kind);
  if (!ses) return;
  ses.clearStorageData().catch(() => {});
  ses.clearCache().catch(() => {});
  ses.clearAuthCache().catch(() => {});
  ses.clearHostResolverCache().catch(() => {});
  if (kind === 'tor') tor.stop();
}

function tabState(t) {
  const wc = t.wc;
  const raw = wc.getURL() || t.url;
  const url = realUrl(raw);
  const nav = wc.navigationHistory;
  return {
    id: t.id,
    title: t.title,
    favicon: t.favicon,
    loading: t.loading,
    url,
    page: internalPage(raw),
    canBack: nav.canGoBack(),
    canFwd: nav.canGoForward(),
    blocked: t.blocked,
    audible: wc.isCurrentlyAudible(),
    muted: wc.isAudioMuted() && !t.holdMuted,
    zoom: Math.round(wc.getZoomFactor() * 100),
    bookmarked: bookmarks.data.some((b) => b.url === url),
    secure: url.startsWith('https://'),
    kind: t.kind,
    query: searchQuery(url),
  };
}

function sendTabs(W) {
  if (!W) { for (const x of wins.values()) sendTabs(x); return; }
  if (W.win.isDestroyed()) return;
  W.ui.send('tabs', {
    tabs: W.order.map((id) => tabState(tabs.get(id))), activeId: W.activeId,
    adblock: settings.data.adblock && blockerOn,
    panicTabId: panic && panic.wid === W.id ? panic.tabId : null,
    tor: tor.state,
  });
  const t = activeTab(W);
  if (!t) return;
  const d = safety.DISGUISES[settings.data.disguise];
  if (d && d.title) W.win.setTitle(d.title);
  else if (t.kind !== 'normal') W.win.setTitle(t.kind === 'tor' ? 'Lychee (Tor)' : 'Lychee (Private)');
  else W.win.setTitle(t.title ? `${t.title} - Lychee` : 'Lychee');
}
let tabsTimer = null;
function sendTabsSoon() {
  if (tabsTimer) return;
  tabsTimer = setTimeout(() => { tabsTimer = null; sendTabs(); }, 16);
}

const PAGE_TITLES = { home: 'Home', history: 'History', bookmarks: 'Bookmarks', downloads: 'Downloads', settings: 'Settings', error: 'Error', tor: 'Connecting to Tor' };

function wireTab(t) {
  const wc = t.wc;
  wc.on('before-input-event', onKey);
  wc.on('did-start-loading', () => { t.loading = true; sendTabsSoon(); });
  wc.on('did-stop-loading', () => { t.loading = false; sendTabsSoon(); });
  const tracked = () => t.kind === 'normal' && !(panic && panic.tabId === t.id);
  wc.on('page-title-updated', (e, title) => {
    t.title = title;
    if (tracked()) updateHistoryTitle(wc.getURL(), title);
    sendTabsSoon();
  });
  wc.on('page-favicon-updated', (e, favs) => {
    t.favicon = favs && favs[0] ? favs[0] : null;
    if (t.favicon && isLycheeSearch(wc.getURL())) t.favicon = lycheeLogo();
    if (tracked()) recordFavicon(wc.getURL(), t.favicon);
    sendTabsSoon();
  });
  googleUA(wc);
  // sign-in popups ("Sign in with Google" windows) get the same treatment
  wc.on('did-create-window', (w) => googleUA(w.webContents));
  wc.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) { t.blocked = 0; t.favicon = null; dropPrompts(t); sendTabsSoon(); }
    // catches every way into AI chat: links, redirects, in-page (pushState) routing
    if (isMainFrame && isDuckAi(url)) setImmediate(() => wc.loadURL(blockedAiPage(url)).catch(() => {}));
  });
  wc.on('did-redirect-navigation', (e, url, isInPlace, isMainFrame) => {
    if (isMainFrame && isDuckAi(url)) setImmediate(() => wc.loadURL(blockedAiPage(url)).catch(() => {}));
  });
  // site skins: a new document drops old inserted CSS, so inject on every dom-ready
  wc.on('did-navigate', () => { t.skinKeys = []; });
  wc.on('dom-ready', () => { injectHold(t); applySkin(t); });
  wc.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) setImmediate(() => injectHold(t)); });
  wc.on('media-started-playing', () => injectHold(t));
  wc.on('did-navigate', (e, url) => {
    t.url = url;
    if (!url.startsWith('lychee://error')) t.upgradedFrom = null;
    const page = internalPage(url);
    if (page) t.title = PAGE_TITLES[page] || 'Lychee';
    if (tracked()) addHistory(url, wc.getTitle());
    sendTabsSoon();
    saveSessionSoon();
  });
  wc.on('did-navigate-in-page', (e, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (isDuckAi(url)) { wc.loadURL(blockedAiPage(url)).catch(() => {}); return; }
    t.url = url;
    if (tracked()) addHistory(url, wc.getTitle());
    sendTabsSoon();
    saveSessionSoon();
  });
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith('lychee://')) return;
    // an auto-upgraded http:// site that has no working https://
    if (t.upgradedFrom && url === toHttps(t.upgradedFrom)) {
      const orig = t.upgradedFrom;
      t.upgradedFrom = null;
      wc.loadURL(`lychee://error/?code=https-only&desc=${encodeURIComponent(desc)}&url=${encodeURIComponent(orig)}`).catch(() => {});
      return;
    }
    wc.loadURL(`lychee://error/?code=${code}&desc=${encodeURIComponent(desc)}&url=${encodeURIComponent(url)}`).catch(() => {});
  });
  // HTTPS-only: upgrade link clicks and redirects that would drop to plain http://
  const upgradeNav = (e, url, isMainFrame) => {
    if (isMainFrame === false || !needsUpgrade(url)) return false;
    e.preventDefault();
    if (t.upgradedFrom === url) {
      // the https version redirected straight back to http: it doesn't really do https
      t.upgradedFrom = null;
      wc.loadURL(`lychee://error/?code=https-only&desc=${encodeURIComponent('Redirects back to HTTP')}&url=${encodeURIComponent(url)}`).catch(() => {});
    } else loadInTab(t, url);
    return true;
  };
  wc.on('will-redirect', (e, url, isInPlace, isMainFrame) => upgradeNav(e, url, isMainFrame));
  wc.on('render-process-gone', (e, d) => {
    if (d.reason === 'clean-exit') return;
    const url = realUrl(wc.getURL() || t.url);
    wc.loadURL(`lychee://error/?code=crash&desc=${encodeURIComponent('The page crashed (' + d.reason + ')')}&url=${encodeURIComponent(url)}`).catch(() => {});
  });
  // websites may not navigate themselves into lychee:// pages
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith('lychee://') && !(wc.getURL() || '').startsWith('lychee://')) { e.preventDefault(); return; }
    upgradeNav(e, url, true);
  });
  wc.on('audio-state-changed', sendTabsSoon);
  wc.on('zoom-changed', (e, dir) => zoom(dir === 'in' ? 1 : -1, t));
  wc.on('enter-html-full-screen', () => { t.w.htmlFullscreen = true; layout(t.w); });
  wc.on('leave-html-full-screen', () => { t.w.htmlFullscreen = false; layout(t.w); });
  wc.on('found-in-page', (e, r) => {
    if (t.id === t.w.activeId) t.w.ui.send('found', { active: r.activeMatchOrdinal, total: r.matches });
  });
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (/^javascript:/i.test(url)) return { action: 'deny' };
    if (url.startsWith('lychee://') && !(wc.getURL() || '').startsWith('lychee://')) return { action: 'deny' };
    if (disposition === 'new-window') {
      // real popups (OAuth sign-in windows etc.) need their opener, so keep them as windows
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true, backgroundColor: '#ffffff', icon: path.join(SHARED, 'icon.png'),
          // preload-page.js gives websites nothing; it's here for the Google sign-in fix
          webPreferences: { contextIsolation: true, sandbox: true, session: sessionFor(t.kind), preload: path.join(SRC, 'preload-page.js') },
        },
      };
    }
    createTab(url, { activate: disposition !== 'background-tab', afterId: t.id, kind: t.kind });
    return { action: 'deny' };
  });
  wc.on('context-menu', (e, p) => pageMenu(t, p));
  if (SELFTEST) {
    wc.on('console-message', (e, ...rest) => {
      const level = e.level ?? rest[0];
      const msg = e.message ?? rest[1];
      if (level === 'error' || level === 3) console.log(`[tab ${t.id} console error] ${msg}`);
    });
  }
}

function pageMenu(t, p) {
  const wc = t.wc;
  const items = [];
  const sep = () => items.push({ type: 'separator' });
  if (p.linkURL && !/^javascript:/i.test(p.linkURL)) {
    items.push(
      { label: 'Open link in new tab', click: () => createTab(p.linkURL, { activate: false, afterId: t.id, kind: t.kind }) },
      { label: 'Open link in private tab', visible: t.kind !== 'private', click: () => createTab(p.linkURL, { afterId: t.id, kind: 'private' }) },
      { label: 'Open link in Tor tab', visible: t.kind !== 'tor', click: () => createTab(p.linkURL, { afterId: t.id, kind: 'tor' }) },
      { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) },
    );
    sep();
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: 'Open image in new tab', click: () => createTab(p.srcURL, { activate: false, afterId: t.id, kind: t.kind }) },
      { label: 'Save image', click: () => wc.downloadURL(p.srcURL) },
      { label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) },
      { label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) },
    );
    sep();
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL && /^https?:/.test(p.srcURL)) {
    items.push(
      { label: `Open ${p.mediaType} in new tab`, click: () => createTab(p.srcURL, { activate: false, afterId: t.id, kind: t.kind }) },
      { label: `Save ${p.mediaType}`, click: () => wc.downloadURL(p.srcURL) },
    );
    sep();
  }
  if (p.isEditable) {
    if (p.misspelledWord && p.dictionarySuggestions.length) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      sep();
    }
    items.push(
      { label: 'Undo', enabled: p.editFlags.canUndo, click: () => wc.undo() },
      { label: 'Redo', enabled: p.editFlags.canRedo, click: () => wc.redo() },
    );
    sep();
    items.push(
      { label: 'Cut', enabled: p.editFlags.canCut, click: () => wc.cut() },
      { label: 'Copy', enabled: p.editFlags.canCopy, click: () => wc.copy() },
      { label: 'Paste', enabled: p.editFlags.canPaste, click: () => wc.paste() },
      { label: 'Select all', click: () => wc.selectAll() },
    );
    sep();
  } else if (p.selectionText && p.selectionText.trim()) {
    const s = p.selectionText.trim().replace(/\s+/g, ' ');
    const short = s.length > 28 ? s.slice(0, 28) + '…' : s;
    items.push(
      { label: 'Copy', click: () => wc.copy() },
      { label: `Search ${engineName()} for "${short}"`, click: () => createTab(searchUrl(s), { afterId: t.id, kind: t.kind }) },
    );
    sep();
  }
  const nav = wc.navigationHistory;
  items.push(
    { label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack() },
    { label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward() },
    { label: 'Reload', click: () => reload(t) },
  );
  sep();
  items.push({ label: 'Inspect', click: () => { wc.inspectElement(p.x, p.y); } });
  // trim doubled separators
  const clean = items.filter((it, i, a) => !(it.type === 'separator' && (i === 0 || a[i - 1].type === 'separator')));
  Menu.buildFromTemplate(clean).popup({ window: t.w.win });
}

function tabMenu(id) {
  const t = tabs.get(id);
  if (!t) return;
  const W = t.w;
  const order = W.order;
  const idx = order.indexOf(id);
  const others = allW().filter((o) => o !== W);
  Menu.buildFromTemplate([
    { label: 'New tab to the right', click: () => createTab(HOME, { afterId: id, focusOmnibox: true }) },
    { type: 'separator' },
    { label: 'Reload', click: () => reload(t) },
    { label: 'Duplicate', click: () => createTab(realUrl(t.wc.getURL()), { afterId: id, kind: t.kind }) },
    { label: t.wc.isAudioMuted() && !t.holdMuted ? 'Unmute tab' : 'Mute tab', click: () => { toggleMute(t); } },
    { type: 'separator' },
    { label: 'Move tab to new window', enabled: order.length > 1, click: () => moveToNewWindow(id) },
    {
      label: 'Move tab to another window', visible: others.length > 0,
      submenu: others.map((o, i) => {
        const a = activeTab(o);
        return { label: `${a && a.title ? a.title : 'Window ' + (i + 1)} (${o.order.length} tab${o.order.length === 1 ? '' : 's'})`, click: () => moveTabToWindow(id, o) };
      }),
    },
    { type: 'separator' },
    { label: 'Close tab', click: () => closeTab(id) },
    { label: 'Close other tabs', enabled: order.length > 1, click: () => order.filter((x) => x !== id).forEach((x) => closeTab(x)) },
    { label: 'Close tabs to the right', enabled: idx < order.length - 1, click: () => order.slice(idx + 1).forEach((x) => closeTab(x)) },
    { type: 'separator' },
    { label: 'Reopen closed tab', enabled: closedStack.length > 0, click: () => reopenTab(W) },
  ]).popup({ window: W.win });
}

function reload(t = activeTab(), hard = false) {
  if (!t) return;
  const url = t.wc.getURL();
  if (url.startsWith('lychee://error')) { t.wc.loadURL(realUrl(url)).catch(() => {}); return; }
  hard ? t.wc.reloadIgnoringCache() : t.wc.reload();
}

function navigate(text, t = activeTab()) {
  const url = resolveInput(text);
  if (!url || !t) return;
  loadInTab(t, url);
  t.wc.focus();
}

const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
function zoom(dir, t = activeTab()) {
  if (!t) return;
  const cur = t.wc.getZoomFactor();
  let next = 1;
  if (dir > 0) next = ZOOMS.find((z) => z > cur + 0.001) ?? 5;
  else if (dir < 0) next = [...ZOOMS].reverse().find((z) => z < cur - 0.001) ?? 0.25;
  t.wc.setZoomFactor(next);
  sendTabsSoon();
}

function focusOmnibox(W = curW()) {
  if (!W) return;
  W.ui.focus();
  W.ui.send('focus-omnibox');
}

// opts.newTab (keyboard, like Chrome): never reuse the current tab, just switch to or open the page's tab
function openPage(name, W = curW(), opts = {}) {
  if (!W) return;
  const url = `lychee://${name}/`;
  const existing = W.order.map((id) => tabs.get(id)).find((t) => internalPage(t.wc.getURL()) === name);
  if (existing) { activate(existing.id); return; }
  const t = activeTab(W);
  if (!opts.newTab && t && internalPage(t.wc.getURL()) === 'home') { t.wc.loadURL(url).catch(() => {}); return; }
  createTab(url, { afterId: W.activeId, w: W });
}

function toggleBookmark(t = activeTab()) {
  if (!t) return;
  const url = realUrl(t.wc.getURL());
  if (!/^https?:/.test(url)) return;
  const i = bookmarks.data.findIndex((b) => b.url === url);
  if (i >= 0) bookmarks.data.splice(i, 1);
  else bookmarks.data.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url, title: t.title || url, favicon: t.favicon, added: Date.now() });
  bookmarks.save();
  sendTabsSoon();
  broadcastPages('bookmarks', null);
}

function toggleDevtools(t = activeTab()) {
  if (!t) return;
  if (t.wc.isDevToolsOpened()) t.wc.closeDevTools();
  else t.wc.openDevTools({ mode: 'detach' });
}

function openFind(W = curW()) {
  if (!W) return;
  W.ui.focus();
  W.ui.send('find-open');
}

// ---------------------------------------------------------------- keyboard
function onKey(e, input) {
  if (input.type !== 'keyDown') return;
  if (matchesPanic(input)) { e.preventDefault(); if (!input.isAutoRepeat) togglePanic(); return; }
  // Win+Shift+Caps Lock (Cmd+Shift+Caps Lock on Mac): hide or show the left sidebar
  if (input.meta && input.shift && input.code === 'CapsLock') {
    e.preventDefault();
    if (!input.isAutoRepeat) setSetting('railHidden', !settings.data.railHidden);
    return;
  }
  // which window the key was pressed in: its UI, or one of its tabs
  const fromTab = [...tabs.values()].find((x) => x.wc === e.sender);
  const W = wOfUi(e.sender) || (fromTab && fromTab.w) || curW();
  if (!W) return;
  const ctrl = input.control || input.meta;
  const { shift, alt } = input;
  const k = (input.key || '').toLowerCase();
  const at = () => activeTab(W);
  const order = W.order;
  let act = null;
  if (alt && shift && !ctrl && k === 'n') act = () => createTab(HOME, { kind: 'tor', focusOmnibox: true, w: W });
  else if (ctrl && !alt) {
    if (k === 'n' && shift) act = () => createTab(HOME, { kind: 'private', focusOmnibox: true, w: W });
    else if (k === 'n') act = () => newWindow();
    else if (k === 't' && shift) act = () => reopenTab(W);
    else if (k === 't') act = () => createTab(HOME, { focusOmnibox: true, w: W });
    else if (k === 'w' || k === 'f4') act = () => closeTab(W.activeId);
    else if (k === 'tab' || k === 'pagedown' || k === 'pageup') {
      const d = (k === 'pageup' || (k === 'tab' && shift)) ? -1 : 1;
      act = () => { const i = order.indexOf(W.activeId); activate(order[(i + d + order.length) % order.length]); };
    } else if (/^[1-9]$/.test(k)) act = () => activate(k === '9' ? order[order.length - 1] : order[+k - 1]);
    else if (k === 'l') act = () => focusOmnibox(W);
    else if (k === 'r') act = () => reload(at(), shift);
    else if (k === 'f') act = () => openFind(W);
    else if (k === 'd') act = () => toggleBookmark(at());
    else if (k === 'h') act = () => openPage('history', W, { newTab: true });
    else if (k === 'j') act = () => openPage('downloads', W, { newTab: true });
    else if (k === '=' || k === '+') act = () => zoom(1, at());
    else if (k === '-' || k === '_') act = () => zoom(-1, at());
    else if (k === '0') act = () => zoom(0, at());
    else if (k === 'i' && shift) act = () => toggleDevtools(at());
    else if (k === 'p') act = () => { const t = at(); if (t) t.wc.print(); };
    else if (k === ',') act = () => openPage('settings', W);
  } else if (alt && !ctrl) {
    if (k === 'arrowleft') act = () => { const t = at(); if (t && t.wc.navigationHistory.canGoBack()) t.wc.navigationHistory.goBack(); };
    else if (k === 'arrowright') act = () => { const t = at(); if (t && t.wc.navigationHistory.canGoForward()) t.wc.navigationHistory.goForward(); };
    else if (k === 'd') act = () => focusOmnibox(W);
    else if (k === 'home') act = () => { const t = at(); if (t) t.wc.loadURL(HOME).catch(() => {}); };
  } else if (!ctrl && !alt) {
    if (k === 'f5') act = () => reload(at(), shift);
    else if (k === 'f6') act = () => focusOmnibox(W);
    else if (k === 'f11') act = () => W.win.setFullScreen(!W.win.isFullScreen());
    else if (k === 'f12') act = () => toggleDevtools(at());
    else if (k === 'escape' && W.findOpen && e.sender !== W.ui) act = () => W.ui.send('find-close');
  }
  if (act) { e.preventDefault(); act(); }
}

// ---------------------------------------------------------------- history / favicons
function addHistory(url, title) {
  if (settings.data.historyPaused || !/^https?:/i.test(url)) return;
  const h = history.data;
  const now = Date.now();
  if (title === url) title = '';
  if (h.length && h[0].url === url && now - h[0].t < 30 * 60e3) { h[0].t = now; if (title) h[0].title = title; }
  else h.unshift({ url, title: title || '', t: now });
  if (h.length > 6000) h.length = 6000;
  history.save();
}

function updateHistoryTitle(url, title) {
  const h = history.data;
  for (let i = 0; i < Math.min(6, h.length); i++) {
    if (h[i].url === url) { h[i].title = title; history.save(); return; }
  }
}

function recordFavicon(url, fav) {
  const host = hostOf(url);
  if (!host || !fav || !/^https?:|^data:image\//.test(fav)) return;
  if (favicons.data[host] === fav) return;
  favicons.data[host] = fav;
  favicons.save();
}

function autocomplete(prefix) {
  const p = String(prefix || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (!p || /\s/.test(p)) return null;
  const counts = new Map();
  const add = (u, w) => {
    let s = strip(u);
    const host = s.split(/[/?#]/)[0];
    if (/^[^/]+\/$/.test(s)) s = host;
    counts.set(s, (counts.get(s) || 0) + w);
    counts.set(host, (counts.get(host) || 0) + w);
  };
  for (const s of settings.data.shortcuts) if (/^https?:/.test(s.url)) add(s.url, 4);
  for (const b of bookmarks.data) add(b.url, 3);
  for (const e of history.data.slice(0, 4000)) add(e.url, 1);
  let best = null, bestScore = -Infinity;
  for (const [s, c] of counts) {
    if (!s.toLowerCase().startsWith(p) || s.length <= p.length) continue;
    const hostOnly = !/[/?#]/.test(s);
    const score = c * 10 + (hostOnly ? 15 : 0) - s.length * 0.2;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function topSites(n = 8) {
  const seen = new Map();
  for (const e of history.data.slice(0, 2000)) {
    const host = hostOf(e.url);
    if (!host) continue;
    const s = seen.get(host);
    if (s) s.count++;
    else seen.set(host, { host, url: e.url, title: e.title, t: e.t, count: 1, favicon: favicons.data[host] || null });
  }
  return [...seen.values()].sort((a, b) => b.t - a.t).slice(0, n);
}

// ---------------------------------------------------------------- downloads
const dlItems = new Map();
let dlSeq = 1;
let dlTimer = null;
function pushDownloads(now) {
  const send = () => {
    dlTimer = null;
    const list = downloadStore.data;
    const active = list.filter((d) => d.state === 'progressing');
    let frac = -1;
    if (active.length) {
      const tot = active.reduce((a, d) => a + (d.total || 0), 0);
      const rec = active.reduce((a, d) => a + d.received, 0);
      frac = tot > 0 ? rec / tot : 2; // 2 = indeterminate
    }
    for (const W of wins.values()) W.win.setProgressBar(frac);
    sendAllUi('downloads', { active: active.length, progress: frac, recent: list[0] ? list[0].id : null });
    broadcastPages('downloads', list);
  };
  if (now) { clearTimeout(dlTimer); send(); }
  else if (!dlTimer) dlTimer = setTimeout(send, 250);
}

function uniquePath(dir, name) {
  name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'download';
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name), i = 1;
  const taken = new Set(downloadStore.data.filter((d) => d.state === 'progressing').map((d) => d.path));
  while (fs.existsSync(p) || taken.has(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}

function wireDownloads(ses) {
  ses.on('will-download', (e, item) => {
    const d = {
      id: `${Date.now().toString(36)}-${dlSeq++}`,
      name: item.getFilename(), path: '', url: item.getURL(),
      total: item.getTotalBytes(), received: 0, state: 'progressing', paused: false, started: Date.now(),
    };
    if (!settings.data.askDownload) {
      d.path = uniquePath(app.getPath('downloads'), item.getFilename());
      d.name = path.basename(d.path);
      item.setSavePath(d.path);
    }
    downloadStore.data.unshift(d);
    if (downloadStore.data.length > 300) downloadStore.data.length = 300;
    dlItems.set(d.id, item);
    item.on('updated', (ev, state) => {
      if (!d.path && item.getSavePath()) { d.path = item.getSavePath(); d.name = path.basename(d.path); }
      d.received = item.getReceivedBytes();
      d.total = item.getTotalBytes();
      d.paused = item.isPaused();
      d.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      pushDownloads();
    });
    item.once('done', (ev, state) => {
      if (item.getSavePath()) { d.path = item.getSavePath(); d.name = path.basename(d.path); }
      d.received = item.getReceivedBytes();
      d.state = state; // completed | cancelled | interrupted
      d.paused = false;
      dlItems.delete(d.id);
      downloadStore.save();
      pushDownloads(true);
    });
    downloadStore.save();
    pushDownloads(true);
  });
}

function downloadAction(id, act) {
  const list = downloadStore.data;
  const d = list.find((x) => x.id === id);
  const item = dlItems.get(id);
  if (act === 'clear') {
    downloadStore.data = list.filter((x) => x.state === 'progressing');
  } else if (!d) return false;
  else if (act === 'open') { if (d.state === 'completed') shell.openPath(d.path); }
  else if (act === 'show') { if (fs.existsSync(d.path)) shell.showItemInFolder(d.path); else shell.openPath(app.getPath('downloads')); }
  else if (act === 'cancel') item && item.cancel();
  else if (act === 'pause') item && item.pause();
  else if (act === 'resume') item && item.canResume() && item.resume();
  else if (act === 'retry') { const t = activeTab(); if (t) t.wc.downloadURL(d.url); }
  else if (act === 'remove') { if (d.state !== 'progressing') list.splice(list.indexOf(d), 1); }
  downloadStore.save();
  pushDownloads(true);
  return true;
}

// ---------------------------------------------------------------- permissions
// Requests show as a small card hanging from the address bar, like Chrome (not a system dialog).
// The card is its own little WebContentsView laid over the page, one per window.
const ALWAYS_OK = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock']);
const PERM_INFO = {
  geolocation: { what: 'Know your location', icon: 'pin' },
  notifications: { what: 'Show notifications', icon: 'bell' },
  midi: { what: 'Use your MIDI devices', icon: 'keyboard' },
  midiSysex: { what: 'Use your MIDI devices', icon: 'keyboard' },
  'clipboard-read': { what: 'See text and images copied to the clipboard', icon: 'copy' },
  'display-capture': { what: 'Share your screen', icon: 'monitor' },
  openExternal: { what: 'Open an app on your computer', icon: 'external' },
  'idle-detection': { what: 'Know when you are actively using this device', icon: 'clock' },
  'window-management': { what: 'Manage windows on all your displays', icon: 'monitor' },
  camera: { what: 'Use your camera', icon: 'camera' },
  microphone: { what: 'Use your microphone', icon: 'mic' },
};

function permKey(origin, permission, details) {
  let p = permission;
  if (permission === 'media') {
    const t = (details && details.mediaTypes) || [];
    p = t.includes('video') && t.includes('audio') ? 'camera+microphone' : t.includes('video') ? 'camera' : 'microphone';
  }
  return `${origin}|${p}`;
}

const pendingPerms = []; // { id, tabId, key, host, rows: [{what, icon}], cb }
let permSeq = 1;

function ensurePrompt(W) {
  if (W.prompt) return W.prompt;
  const view = new WebContentsView({
    webPreferences: { preload: path.join(SRC, 'preload-prompt.js'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  view.setBackgroundColor('#00000000');
  view.setVisible(false);
  W.prompt = { view, shown: null, h: 190, ready: false };
  view.webContents.on('before-input-event', onKey);
  view.webContents.once('did-finish-load', () => { if (W.prompt) { W.prompt.ready = true; refreshPrompt(W); } });
  view.webContents.loadFile(path.join(SRC, 'ui', 'prompt.html'));
  return W.prompt;
}

function placePrompt(W) {
  if (!W.prompt || W.win.isDestroyed()) return;
  const a = W.anchor || { x: railW() + 112, y: STRIP_H + TOOLBAR_H - 8 };
  const x = W.htmlFullscreen ? 12 : a.x;
  const y = W.htmlFullscreen ? 12 : a.y;
  W.prompt.view.setBounds({ x, y, width: 372, height: W.prompt.h });
}

// keep the card above the tab views (re-adding a view moves it to the top)
function raisePrompt(W) {
  if (W && W.prompt && W.prompt.shown != null && !W.win.isDestroyed()) W.win.contentView.addChildView(W.prompt.view);
}

function hidePrompt(W) {
  if (W && W.prompt) { W.prompt.view.setVisible(false); W.prompt.shown = null; }
}

function refreshPrompt(W) {
  if (!W || W.win.isDestroyed()) return;
  const p = pendingPerms.find((x) => x.tabId === W.activeId);
  if (!p || (panic && panic.wid === W.id)) { hidePrompt(W); return; }
  const P = ensurePrompt(W);
  if (!P.ready) return;
  if (P.shown !== p.id) {
    P.shown = p.id;
    const th = activeTheme();
    P.view.webContents.send('prompt', { id: p.id, host: p.host, rows: p.rows, palette: th.palette, accent: settings.data.accent });
  }
  W.win.contentView.addChildView(P.view);
  placePrompt(W);
  P.view.setVisible(true);
  P.view.webContents.focus();
}

// choice: 'allow' (remember), 'once' (this time), 'block' (remember), 'dismiss' (no this time)
function answerPrompt(W, id, choice) {
  const i = pendingPerms.findIndex((x) => x.id === id);
  if (i < 0) return;
  const p = pendingPerms[i];
  pendingPerms.splice(i, 1);
  const ok = choice === 'allow' || choice === 'once';
  if (choice === 'allow' || choice === 'block') {
    settings.data.sitePermissions[p.key] = ok;
    settings.save();
    broadcastPages('settings', publicSettings());
  }
  p.cb(ok);
  // the same site asking for the same thing again meanwhile gets the same answer
  for (let j = pendingPerms.length - 1; j >= 0; j--) {
    const q = pendingPerms[j];
    if (q.key === p.key && q.tabId === p.tabId) { pendingPerms.splice(j, 1); q.cb(ok); }
  }
  refreshPrompt(W);
  const t = activeTab(W);
  if (t && !W.prompt.shown) t.wc.focus();
}

// tab closed or navigated away: its open requests are answered "no"
function dropPrompts(t) {
  let any = false;
  for (let i = pendingPerms.length - 1; i >= 0; i--) {
    if (pendingPerms[i].tabId === t.id) { const p = pendingPerms[i]; pendingPerms.splice(i, 1); p.cb(false); any = true; }
  }
  if (any && t.w) refreshPrompt(t.w);
}

function wirePermissions(ses) {
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    if (ALWAYS_OK.has(permission)) return cb(true);
    const url = (details && details.requestingUrl) || wc.getURL();
    if (url.startsWith('lychee://')) return cb(false);
    const origin = originOf(url);
    if (!origin || origin === 'null') return cb(false);
    const key = permKey(origin, permission, details);
    const saved = settings.data.sitePermissions[key];
    if (typeof saved === 'boolean') return cb(saved);
    const kind = key.split('|')[1];
    const rows = kind === 'camera+microphone' ? [PERM_INFO.camera, PERM_INFO.microphone]
      : [PERM_INFO[kind] || { what: `Use ${kind}`, icon: 'info' }];
    if (permission === 'openExternal' && details && details.externalURL) {
      rows[0] = { what: `Open "${details.externalURL.split(':')[0]}:" links in another app`, icon: 'external' };
    }
    const t = [...tabs.values()].find((x) => x.wc === wc);
    if (t) {
      pendingPerms.push({ id: permSeq++, tabId: t.id, key, host: hostOf(url), rows, cb });
      refreshPrompt(t.w);
      return;
    }
    // a popup window (not a tab): fall back to a plain dialog on it
    const bw = BrowserWindow.fromWebContents(wc);
    if (!bw) return cb(false);
    dialog.showMessageBox(bw, {
      type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1, noLink: true,
      title: 'Permission request', message: `${hostOf(url)} wants to: ${rows.map((r) => r.what.toLowerCase()).join(', ')}`,
    }).then((r) => cb(r.response === 0)).catch(() => cb(false));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => {
    if (ALWAYS_OK.has(permission)) return true;
    const saved = settings.data.sitePermissions[`${origin}|${permission}`];
    if (typeof saved === 'boolean') return saved;
    if (permission === 'notifications') return false;
    return true;
  });
}

// ---------------------------------------------------------------- ad blocking / proxy
async function initAdblock() {
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const cache = path.join(app.getPath('userData'), 'adblock-engine.bin');
    try {
      const st = fs.statSync(cache);
      if (Date.now() - st.mtimeMs > 5 * 86400e3) fs.unlinkSync(cache); // refresh lists every few days
    } catch {}
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: cache, read: fs.promises.readFile, write: fs.promises.writeFile,
    });
    let statTimer = null;
    blocker.on('request-blocked', (req) => {
      for (const t of tabs.values()) if (t.wc.id === req.tabId) { t.blocked++; break; }
      stats.data.adsBlocked = (stats.data.adsBlocked || 0) + 1;
      if (!statTimer) statTimer = setTimeout(() => { statTimer = null; stats.save(); broadcastPages('stats', stats.data); }, 2000);
      sendTabsSoon();
    });
    applyAdblock();
  } catch (e) {
    console.error('ad blocker failed to load (offline?)', e.message);
  }
}

// Ghostery registers its cosmetic-filter IPC handlers globally on every enable, which throws on the
// second session. The handlers only call back into the shared blocker, so drop them and re-add.
function blockIn(ses) {
  if (!blocker || blocker.isBlockingEnabled(ses)) return;
  ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters');
  ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled');
  blocker.enableBlockingInSession(ses);
}

function applyAdblock() {
  if (!blocker) return;
  const want = settings.data.adblock;
  if (want && !blockerOn) { for (const s of allSessions()) blockIn(s); blockerOn = true; }
  else if (!want && blockerOn) { for (const s of allSessions()) blocker.disableBlockingInSession(s); blockerOn = false; }
  sendTabsSoon();
}

// the user's proxy applies to normal + private tabs (Tor tabs always go through Tor)
async function applyProxy() {
  const p = settings.data.proxy.trim();
  try {
    for (const [kind, ses] of [['normal', session.defaultSession], ...extraSessions]) {
      if (kind === 'tor') continue;
      if (p) await ses.setProxy({ proxyRules: p, proxyBypassRules: '<local>' });
      else await ses.setProxy({ mode: 'system' });
      await ses.closeAllConnections();
    }
    return true;
  } catch (e) {
    console.error('proxy failed', e);
    return false;
  }
}

// Secure DNS: lookups go over HTTPS to the chosen resolver instead of the network's DNS server.
// "automatic" falls back to normal DNS if the DoH server can't be reached; "secure" (strict) never does.
function dnsServers() {
  const p = settings.data.dnsProvider;
  if (p === 'custom') return settings.data.dnsCustom.split(/[\s,]+/).filter((s) => /^https:\/\//i.test(s));
  return DNS_PROVIDERS[p] ? DNS_PROVIDERS[p].servers : [];
}

function applyDns() {
  const servers = dnsServers();
  const mode = servers.length ? (settings.data.dnsStrict ? 'secure' : 'automatic') : 'off';
  try {
    app.configureHostResolver({
      enableBuiltInResolver: true,
      enableAdditionalDnsQueryTypes: true, // HTTPS records, which lets Chromium use Encrypted Client Hello
      secureDnsMode: mode,
      secureDnsServers: servers,
    });
    session.defaultSession.clearHostResolverCache();
    session.defaultSession.closeAllConnections();
    return true;
  } catch (e) {
    console.error('dns config failed', e);
    return false;
  }
}

// ---------------------------------------------------------------- settings broadcast
function publicSettings() {
  return {
    ...settings.data,
    engines: Object.fromEntries(Object.keys(ENGINES).map((k) => [k, engineName(k)])),
    dnsProviders: Object.fromEntries(Object.entries(DNS_PROVIDERS).map(([k, v]) => [k, v.name])),
    disguises: Object.fromEntries(Object.entries(safety.DISGUISES).map(([k, v]) => [k, v.name])),
    uaPresets: Object.fromEntries(Object.entries(safety.uaPresets(baseUA)).map(([k, v]) => [k, v.name])),
    activeTheme: activeTheme(),
    themes: Themes.list(),
    seasonalTheme: Themes.seasonal(),
    wallpaperUrl: settings.data.wallpaper === 'custom' && settings.data.wallpaperFile
      ? `lychee://home/userdata/wallpaper?v=${settings.data.wallpaperRev}` : null,
  };
}

// ---------------------------------------------------------------- themes
function applyWindowTheme() {
  const th = activeTheme();
  for (const W of wins.values()) {
    W.win.setBackgroundColor(th.palette.bg);
    if (!IS_MAC) { try { W.win.setTitleBarOverlay({ color: th.palette.bg, symbolColor: th.palette.muted, height: STRIP_H }); } catch {} }
    if (W.prompt && W.prompt.shown) { W.prompt.shown = null; refreshPrompt(W); } // re-send with the new colours
  }
  for (const t of tabs.values()) t.view.setBackgroundColor(th.palette.bg);
}

// picking a theme also takes its accent colour (you can still change the accent afterwards)
function adoptThemeAccent() {
  const th = activeTheme();
  settings.data.accent = th.accent;
  settings.data.lastAutoTheme = th.id;
  settings.save();
}

async function pickWallpaper() {
  const W = curW();
  if (!W) return false;
  const r = await dialog.showOpenDialog(W.win, {
    title: 'Choose a wallpaper', properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
  });
  if (r.canceled || !r.filePaths[0]) return false;
  const src = r.filePaths[0];
  const ext = path.extname(src).toLowerCase().replace(/[^.a-z]/g, '') || '.png';
  const dir = app.getPath('userData');
  for (const f of fs.readdirSync(dir)) if (/^wallpaper\./.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
  fs.copyFileSync(src, path.join(dir, 'wallpaper' + ext));
  settings.data.wallpaperFile = 'wallpaper' + ext;
  settings.data.wallpaperRev = Date.now();
  setSetting('wallpaper', 'custom');
  return true;
}

function broadcastPages(channel, data) {
  for (const t of tabs.values()) {
    if ((t.wc.getURL() || '').startsWith('lychee://')) t.wc.send('lychee:event', { channel, data });
  }
}

function setSetting(key, value) {
  const rule = SETTING_RULES[key];
  if (!rule || !rule(value)) return false;
  settings.data[key] = value;
  settings.save();
  if (key === 'adblock') applyAdblock();
  if (key === 'proxy') applyProxy();
  if (key === 'dnsProvider' || key === 'dnsStrict' || key === 'dnsCustom') applyDns();
  if (key === 'disguise') applyDisguise();
  if (key === 'autoUpdate' && updater) updater.start(value);
  if (key === 'theme') { adoptThemeAccent(); applyWindowTheme(); }
  if (['theme', 'effects', 'effectAmount', 'effectsOnSearch', 'ytTheme', 'ytAds', 'ytAmbient', 'ytHD'].includes(key)) reskinAll();
  if (key === 'searchSkin' || key === 'accent') reskinAll();
  // the skin script renamed text in place, so un-skinned search pages need a fresh load
  if (key === 'searchSkin' && !value) for (const t of tabs.values()) if (DDG_RE.test(t.wc.getURL() || '')) t.wc.reload();
  if (key === 'uaPreset') applyUA();
  if (key === 'httpsOnly' && !value) httpExceptions.clear();
  if (key === 'railHidden') layout();
  sendAllUi('settings', publicSettings());
  broadcastPages('settings', publicSettings());
  return true;
}

// ---------------------------------------------------------------- IPC
function wireIpc() {
  // every UI message carries the window it came from
  const fromUi = (fn) => (e, ...a) => { const W = wOfUi(e.sender); if (W) return fn(W, ...a); };
  const tabIn = (W, id) => { const t = tabs.get(id); return t && t.w === W ? t : null; };
  ipcMain.on('ui:ready', fromUi((W) => { W.ui.send('settings', publicSettings()); sendTabs(W); pushDownloads(true); }));
  ipcMain.on('ui:newTab', fromUi((W, kind) => createTab(HOME, { focusOmnibox: true, kind, w: W })));
  ipcMain.on('ui:newWindow', fromUi(() => newWindow()));
  ipcMain.on('ui:panic', fromUi(() => togglePanic()));
  ipcMain.on('ui:newTabMenu', fromUi((W) => {
    Menu.buildFromTemplate([
      { label: 'New tab', accelerator: 'Ctrl+T', click: () => createTab(HOME, { focusOmnibox: true, w: W }) },
      { label: 'New window', accelerator: 'Ctrl+N', click: () => newWindow() },
      { label: 'New private tab', accelerator: 'Ctrl+Shift+N', click: () => createTab(HOME, { focusOmnibox: true, kind: 'private', w: W }) },
      { label: 'New Tor tab', accelerator: 'Alt+Shift+N', click: () => createTab(HOME, { focusOmnibox: true, kind: 'tor', w: W }) },
    ]).popup({ window: W.win });
  }));
  ipcMain.on('ui:closeTab', fromUi((W, id) => { if (tabIn(W, id)) closeTab(id); }));
  ipcMain.on('ui:activate', fromUi((W, id) => { if (tabIn(W, id)) activate(id); }));
  ipcMain.on('ui:moveTab', fromUi((W, id, to) => { if (tabIn(W, id)) moveTab(id, to); }));
  // tab drag and drop between windows: drop onto a strip, or let go outside any strip
  ipcMain.on('ui:dropTab', fromUi((W, id, index) => { if (tabs.has(id) && Number.isFinite(index)) moveTabToWindow(id, W, index); }));
  ipcMain.on('ui:detachTab', fromUi((W, id) => {
    if (!tabIn(W, id)) return;
    // let go over another window's tab strip? (its own drop handler already took it)
    const p = screen.getCursorScreenPoint();
    const over = allW().find((o) => o !== W && o.win.isVisible() && !o.win.isMinimized() && (() => {
      const b = o.win.getContentBounds();
      return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + STRIP_H;
    })());
    if (over) { moveTabToWindow(id, over, over.order.length); return; }
    detachTab(id, p);
  }));
  ipcMain.on('ui:tabMenu', fromUi((W, id) => { if (tabIn(W, id)) tabMenu(id); }));
  ipcMain.on('ui:muteTab', fromUi((W, id) => { const t = tabIn(W, id); if (t) toggleMute(t); }));
  ipcMain.on('ui:navigate', fromUi((W, text) => navigate(text, activeTab(W))));
  ipcMain.on('ui:back', fromUi((W) => { const t = activeTab(W); if (t && t.wc.navigationHistory.canGoBack()) t.wc.navigationHistory.goBack(); }));
  ipcMain.on('ui:forward', fromUi((W) => { const t = activeTab(W); if (t && t.wc.navigationHistory.canGoForward()) t.wc.navigationHistory.goForward(); }));
  ipcMain.on('ui:reload', fromUi((W, hard) => reload(activeTab(W), !!hard)));
  ipcMain.on('ui:stop', fromUi((W) => { const t = activeTab(W); if (t) t.wc.stop(); }));
  ipcMain.on('ui:home', fromUi((W) => { const t = activeTab(W); if (t) t.wc.loadURL(HOME).catch(() => {}); }));
  ipcMain.on('ui:openPage', fromUi((W, name) => { if (PAGE_TITLES[name] && name !== 'error') openPage(name, W); }));
  ipcMain.on('ui:toggleBookmark', fromUi((W) => toggleBookmark(activeTab(W))));
  ipcMain.on('ui:toggleAdblock', fromUi((W) => { setSetting('adblock', !settings.data.adblock); reload(activeTab(W)); }));
  ipcMain.on('ui:zoomReset', fromUi((W) => zoom(0, activeTab(W))));
  ipcMain.on('ui:focusPage', fromUi((W) => { const t = activeTab(W); if (t) t.wc.focus(); }));
  ipcMain.on('ui:find', fromUi((W, text, forward, isNew) => {
    const t = activeTab(W);
    if (!t) return;
    if (!text) { t.wc.stopFindInPage('clearSelection'); W.ui.send('found', { active: 0, total: 0 }); return; }
    t.wc.findInPage(text, { forward: forward !== false, findNext: !!isNew });
  }));
  ipcMain.on('ui:findState', fromUi((W, open) => {
    W.findOpen = !!open;
    W.topInset = STRIP_H + TOOLBAR_H + (W.findOpen ? FIND_H : 0);
    if (!W.findOpen) { const t = activeTab(W); if (t) { t.wc.stopFindInPage('clearSelection'); t.wc.focus(); } }
    layout(W);
  }));
  // where the permission card hangs from (just under the site icon in the address bar)
  ipcMain.on('ui:anchor', fromUi((W, r) => {
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return;
    W.anchor = { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)) };
    placePrompt(W);
  }));
  ipcMain.handle('ui:autocomplete', (e, prefix) => (wOfUi(e.sender) ? autocomplete(prefix) : null));

  // the permission card
  const promptW = (e) => allW().find((W) => W.prompt && W.prompt.view.webContents === e.sender) || null;
  ipcMain.on('prompt:answer', (e, id, choice) => { const W = promptW(e); if (W) answerPrompt(W, id, choice); });
  ipcMain.on('prompt:size', (e, h) => {
    const W = promptW(e);
    if (!W || !Number.isFinite(h)) return;
    W.prompt.h = Math.max(80, Math.min(400, Math.ceil(h)));
    placePrompt(W);
  });

  // internal pages (lychee://)
  ipcMain.handle('page', (e, op, ...a) => {
    if (!isInternalSender(e)) return null;
    const senderTab = [...tabs.values()].find((t) => t.wc === e.sender);
    switch (op) {
      case 'settings': return publicSettings();
      case 'set': return setSetting(a[0], a[1]);
      case 'go': { const url = resolveInput(a[0]); if (url && senderTab) loadInTab(senderTab, url); return !!url; }
      case 'open': { const url = resolveInput(a[0]); if (url) createTab(url, { afterId: senderTab && senderTab.id, activate: a[1] !== false, kind: senderTab && senderTab.kind }); return true; }
      case 'newTab': createTab(HOME, { kind: a[0], focusOmnibox: true, w: senderTab && senderTab.w }); return true;
      case 'kind': return senderTab ? senderTab.kind : 'normal';
      case 'tor': return tor.status();
      case 'torStart': tor.start(); return tor.status();
      case 'getTor': createTab('https://www.torproject.org/download/tor/', { afterId: senderTab && senderTab.id }); return true;
      case 'panic': togglePanic(); return true;
      case 'allowHttp': {
        // "continue to the insecure site" on the HTTPS-only error page
        const url = String(a[0] || '');
        if (!/^http:\/\//i.test(url) || !senderTab) return false;
        httpExceptions.add(hostOf(url));
        senderTab.wc.loadURL(url).catch(() => {});
        return true;
      }
      case 'allowCert': {
        // "Go anyway" on a "connection isn't private" page: trust this host's bad certificate until restart
        const url = String(a[0] || '');
        if (!/^https:\/\//i.test(url) || !senderTab) return false;
        certExceptions.add(hostOf(url));
        senderTab.wc.loadURL(url).catch(() => {});
        return true;
      }
      case 'history': {
        const q = String(a[0] || '').toLowerCase();
        const lim = Math.min(+a[1] || 300, 2000);
        const out = [];
        for (const h of history.data) {
          if (q && !(h.url.toLowerCase().includes(q) || (h.title || '').toLowerCase().includes(q))) continue;
          out.push({ ...h, favicon: favicons.data[hostOf(h.url)] || null });
          if (out.length >= lim) break;
        }
        return out;
      }
      case 'deleteHistory': { const [url, t] = a; history.data = history.data.filter((h) => !(h.url === url && h.t === t)); return true; }
      case 'clearHistory': history.data = []; return true;
      case 'topSites': return topSites(+a[0] || 8);
      case 'bookmarks': return bookmarks.data.map((b) => ({ ...b, favicon: b.favicon || favicons.data[hostOf(b.url)] || null }));
      case 'removeBookmark': bookmarks.data = bookmarks.data.filter((b) => b.id !== a[0]); sendTabsSoon(); return true;
      case 'renameBookmark': {
        const b = bookmarks.data.find((x) => x.id === a[0]);
        if (b && typeof a[1] === 'string') { b.title = a[1].slice(0, 200); bookmarks.save(); }
        return true;
      }
      case 'favicons': return favicons.data;
      case 'downloads': return downloadStore.data;
      case 'dl': return downloadAction(a[0], a[1]);
      case 'openDownloadsFolder': shell.openPath(app.getPath('downloads')); return true;
      case 'stats': return stats.data;
      case 'removePermission': delete settings.data.sitePermissions[a[0]]; settings.save(); return publicSettings();
      case 'clearData': return clearData(a[0] || {});
      case 'openDataFolder': shell.openPath(app.getPath('userData')); return true;
      case 'pickWallpaper': return pickWallpaper();
      case 'update': return updater ? updater.state : null;
      case 'checkUpdate': return updater ? updater.check() : null;
      case 'installUpdate': return updater ? updater.install() : false;
      case 'about': return {
        version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
        node: process.versions.node, adblockReady: !!blocker, userData: app.getPath('userData'),
        portable: IS_PORTABLE, platform: process.platform, updateMode: updater ? updater.mode : 'dev',
      };
      default: return null;
    }
  });
}

async function clearData(what) {
  const ses = session.defaultSession;
  if (what.history) { history.data = []; favicons.data = {}; }
  if (what.cache) await ses.clearCache();
  if (what.cookies) await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'shadercache'] });
  if (what.downloads) downloadStore.data = downloadStore.data.filter((d) => d.state === 'progressing');
  return true;
}

// ---------------------------------------------------------------- session
let sessionTimer = null;
function saveSessionSoon() { if (!sessionTimer) sessionTimer = setTimeout(() => { sessionTimer = null; saveSession(); }, 1000); }
function saveSession() {
  if (SELFTEST || !sessionStore || !wins.size) return;
  // private/Tor tabs and the panic screen are never written to disk
  const windows = [];
  for (const W of wins.values()) {
    const keep = W.order.filter((id) => tabs.get(id).kind === 'normal' && !(panic && panic.tabId === id));
    if (!keep.length) continue;
    const act = keep.includes(W.activeId) ? W.activeId : panic && keep.includes(panic.prev) ? panic.prev : keep[0];
    windows.push({
      tabs: keep.map((id) => { const t = tabs.get(id); return realUrl(t.wc.getURL() || t.url); }),
      active: keep.indexOf(act),
      bounds: W.win.getNormalBounds(),
      maximized: W.win.isMaximized(),
      focused: W === curW(),
    });
  }
  sessionStore.data = { windows };
}
function flushAll() {
  for (const s of [settings, history, bookmarks, stats, favicons, sessionStore, downloadStore]) if (s) s.flush();
}

// a saved window position is only reused if it is still on a connected screen
function visibleOnScreen(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 80 > a.x && b.x < a.x + a.width - 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80;
  });
}

// ---------------------------------------------------------------- startup
const gotLock = SELFTEST || app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on('second-instance', (e, argv) => {
  const W = curW();
  if (!W) return;
  if (W.win.isMinimized()) W.win.restore();
  W.win.focus();
  const url = argv.slice(1).find((a) => /^https?:\/\//i.test(a));
  if (url) createTab(url, { w: W });
});

app.whenReady().then(async () => {
  if (!gotLock) return;
  nativeTheme.themeSource = 'dark';
  // Windows needs no menu (our tab strip is the UI). Mac needs one: without Edit roles,
  // Cmd+C / Cmd+V / Cmd+A don't work in text fields, and Cmd+Q / Cmd+H live there.
  Menu.setApplicationMenu(IS_MAC ? Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'Tabs',
      submenu: [
        { label: 'New Tab', accelerator: 'Cmd+T', click: () => createTab(HOME, { focusOmnibox: true }) },
        { label: 'New Window', accelerator: 'Cmd+N', click: () => newWindow() },
        { label: 'New Private Tab', accelerator: 'Cmd+Shift+N', click: () => createTab(HOME, { kind: 'private', focusOmnibox: true }) },
        { label: 'New Tor Tab', accelerator: 'Alt+Shift+N', click: () => createTab(HOME, { kind: 'tor', focusOmnibox: true }) },
        { type: 'separator' },
        { label: 'Reopen Closed Tab', accelerator: 'Cmd+Shift+T', click: () => reopenTab() },
        { label: 'Close Tab', accelerator: 'Cmd+W', click: () => { const W = curW(); if (W) closeTab(W.activeId); } },
      ],
    },
    { role: 'windowMenu' },
  ]) : null);
  settings = store('settings', DEFAULT_SETTINGS);
  settings.data = { ...structuredClone(DEFAULT_SETTINGS), ...settings.data };
  // Auto theme: when the season changes (e.g. 1 December -> Christmas), switch to that theme's accent
  if (settings.data.theme === 'auto' && settings.data.lastAutoTheme !== activeTheme().id) adoptThemeAccent();
  history = store('history', []);
  bookmarks = store('bookmarks', []);
  stats = store('stats', { adsBlocked: 0 });
  favicons = store('favicons', {});
  sessionStore = store('session', { tabs: [], active: 0 });
  downloadStore = store('downloads', []);
  // anything that was mid-download when we closed is dead now
  for (const d of downloadStore.data) if (d.state === 'progressing') d.state = 'interrupted';

  const ses = session.defaultSession;
  baseUA = ses.getUserAgent().replace(/\s?Electron\/\S+/i, '').replace(/\s?lychee\/\S+/i, '');
  setupSession(ses, 'normal');
  app.userAgentFallback = currentUA();
  wireIpc();
  applyDns();
  await applyProxy();
  applyDisguise();
  updater = new Updater({
    portable: IS_PORTABLE, exeDir: EXE_DIR,
    onChange: (st) => { sendAllUi('update', st); broadcastPages('update', st); },
  });
  if (!SELFTEST) updater.start(settings.data.autoUpdate);

  const extra = process.argv.slice(1).filter((a) => /^https?:\/\//i.test(a));
  const saved = sessionStore.data;
  // older versions saved one window as { tabs, active }
  const savedWins = Array.isArray(saved.windows) ? saved.windows : saved.tabs && saved.tabs.length ? [{ tabs: saved.tabs, active: saved.active }] : [];
  const restore = !SELFTEST && settings.data.restoreTabs ? savedWins.filter((w) => w.tabs && w.tabs.length) : [];
  let focusW = null;
  for (const sw of restore) {
    const b = sw.bounds && visibleOnScreen(sw.bounds) ? sw.bounds : null;
    const W = createWindow({ bounds: b || undefined });
    if (sw.maximized) W.win.once('ready-to-show', () => W.win.maximize());
    for (const u of sw.tabs) createTab(u, { activate: false, w: W });
    activate(W.order[Math.max(0, Math.min(sw.active || 0, W.order.length - 1))], { keepFocus: true });
    if (sw.focused) focusW = W;
  }
  if (!wins.size) {
    const W = createWindow();
    if (!extra.length) createTab(HOME, { focusOmnibox: true, w: W });
  }
  if (focusW && !SELFTEST) focusW.win.once('ready-to-show', () => focusW.win.focus());
  for (const u of extra) createTab(u, { w: focusW || curW() });

  initAdblock();
  if (SELFTEST) {
    require('./selftest')({
      createTab, closeTab, tabs, get order() { const W = curW(); return W ? W.order : []; }, ui: () => curW().ui, win: () => curW().win,
      resolveInput, autocomplete, activate, setSetting, activeId: () => (curW() || {}).activeId,
      wins: () => allW(), curW, createWindow, newWindow, moveTabToWindow, detachTab, prompts: () => pendingPerms,
      DNS_PROVIDERS, SHOTS_DIR, togglePanic, panic: () => panic, history: () => history.data, tor, safety, settings: () => settings.data, Themes,
    });
  }
});

// bad certificates fail the load (-2xx error page) unless the user pressed "Go anyway" for that host
app.on('certificate-error', (e, wc, url, error, cert, cb) => {
  if (certExceptions.has(hostOf(url))) { e.preventDefault(); cb(true); }
  else cb(false);
});

app.on('window-all-closed', () => { flushAll(); app.quit(); });
app.on('before-quit', () => { saveSession(); flushAll(); quitting = true; });
app.on('will-quit', (e) => {
  tor.stop();
  if (updater) updater.applyOnQuit();
  const c = settings && settings.data.clearOnExit;
  if (exitCleaned || !c || !(c.history || c.cookies || c.cache)) return;
  e.preventDefault();
  exitCleaned = true;
  if (c.history) sessionStore.data = { tabs: [], active: 0 }; // restored tabs would give the history away
  clearData(c).catch(() => {}).finally(() => { flushAll(); app.quit(); });
});
