'use strict';
/* global browser, icon, logoMark, fillIcons */
const $ = (s) => document.querySelector(s);
fillIcons();
document.body.classList.add('os-' + (browser.platform === 'darwin' ? 'mac' : browser.platform === 'win32' ? 'win' : 'linux'));

const tabsEl = $('#tabs');
const omni = $('#omni-input');
const findbar = $('#findbar');
const findInput = $('#find-input');
const PAGE_ICON = { home: 'home', history: 'history', bookmarks: 'bookmark', downloads: 'download', settings: 'sliders', error: 'warn' };

let state = { tabs: [], activeId: null, adblock: true };
let settings = null;
let editing = false;
let lastActive = null;

const active = () => state.tabs.find((t) => t.id === state.activeId);

// ---------------------------------------------------------------- accent
function applyAccent(hex) {
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  root.setProperty('--accent-ink', lum > 0.45 ? '#1c0a0f' : '#ffffff');
}

// ---------------------------------------------------------------- theme + effects
/* global LycheeThemes, LycheeEffects */
const fx = LycheeEffects.start($('#fx'), {});
function buildLights() {
  const box = $('#lights');
  const n = Math.max(6, Math.floor((window.innerWidth - 200) / 30));
  if (box.childElementCount === n) return;
  const cols = ['#ff4d5a', '#3ddc84', '#ffd25a', '#5ab0ff', '#ff8ad8'];
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i');
    b.style.setProperty('--c', cols[i % cols.length]);
    b.style.setProperty('--d', `${(i * 0.37) % 1.8}s`);
    box.append(b);
  }
}
function applyTheme(s) {
  const th = s.activeTheme;
  LycheeThemes.applyPalette(th);
  const amount = (LycheeEffects.AMOUNTS[s.effectAmount] || 1) * 2.5; // the frame is a thin strip, so a bit denser
  fx.set({ type: s.effects ? th.effect : 'none', amount });
  $('#lights').hidden = !(s.effects && th.lights);
  if (th.lights) buildLights();
}
window.addEventListener('resize', () => { if (!$('#lights').hidden) buildLights(); });

// ---------------------------------------------------------------- tabs
const tabEls = new Map();
let dragId = null;

function makeTab(id) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.draggable = true;
  el.innerHTML = `<span class="fav"></span><span class="title"></span>` +
    `<button class="audio" hidden></button><button class="close" title="Close tab (Ctrl+W)">${icon('x')}</button>`;
  el.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !e.target.closest('button')) browser.send('ui:activate', id);
    if (e.button === 1) e.preventDefault();
  });
  el.addEventListener('auxclick', (e) => { if (e.button === 1) browser.send('ui:closeTab', id); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); browser.send('ui:tabMenu', id); });
  el.querySelector('.close').addEventListener('click', (e) => { e.stopPropagation(); browser.send('ui:closeTab', id); });
  el.querySelector('.audio').addEventListener('click', (e) => { e.stopPropagation(); browser.send('ui:muteTab', id); });

  el.addEventListener('dragstart', (e) => {
    dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    dragId = null;
    el.classList.remove('dragging');
    tabsEl.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  });
  el.addEventListener('dragover', (e) => {
    if (dragId == null || dragId === id) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    el.classList.toggle('drop-after', after);
    el.classList.toggle('drop-before', !after);
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dragId == null || dragId === id) return;
    const after = el.classList.contains('drop-after');
    const from = state.tabs.findIndex((t) => t.id === dragId);
    let to = state.tabs.findIndex((t) => t.id === id) + (after ? 1 : 0);
    if (from < to) to--;
    browser.send('ui:moveTab', dragId, to);
  });
  return el;
}

function favMarkup(t) {
  if (t.loading && !t.page) return { key: 'loading', html: '<span class="spinner"></span>', box: false };
  if (t.page) return { key: 'page:' + t.page, html: icon(PAGE_ICON[t.page] || 'sparkle'), box: true };
  if (t.favicon) return { key: 'img:' + t.favicon, img: t.favicon, box: false };
  return { key: 'globe', html: icon('globe'), box: false };
}

function updateTab(el, t) {
  el.classList.toggle('active', t.id === state.activeId);
  el.classList.toggle('kind-private', t.kind === 'private');
  el.classList.toggle('kind-tor', t.kind === 'tor');
  const title = t.title || t.url || 'New tab';
  const titleEl = el.querySelector('.title');
  if (titleEl.textContent !== title) titleEl.textContent = title;
  el.title = title;

  const f = favMarkup(t);
  const fav = el.querySelector('.fav');
  if (fav._key !== f.key) {
    fav._key = f.key;
    fav.classList.toggle('box', f.box);
    if (f.img) {
      const img = document.createElement('img');
      img.src = f.img;
      img.addEventListener('error', () => { fav.innerHTML = icon('globe'); });
      fav.replaceChildren(img);
    } else fav.innerHTML = f.html;
  }

  const audio = el.querySelector('.audio');
  const showAudio = t.audible || t.muted;
  audio.hidden = !showAudio;
  const aKey = t.muted ? 'mute' : 'volume';
  if (showAudio && audio._key !== aKey) {
    audio._key = aKey;
    audio.innerHTML = icon(aKey);
    audio.title = t.muted ? 'Unmute tab' : 'Mute tab';
  }
}

function renderTabs() {
  const seen = new Set();
  // while the panic screen is up, only its tab is shown
  const shown = state.panicTabId != null ? state.tabs.filter((t) => t.id === state.panicTabId) : state.tabs;
  shown.forEach((t, i) => {
    let el = tabEls.get(t.id);
    if (!el) { el = makeTab(t.id); tabEls.set(t.id, el); }
    seen.add(t.id);
    updateTab(el, t);
    if (tabsEl.children[i] !== el) tabsEl.insertBefore(el, tabsEl.children[i] || null);
  });
  for (const [id, el] of tabEls) if (!seen.has(id)) { el.remove(); tabEls.delete(id); }
}

$('#newtab').addEventListener('click', () => browser.send('ui:newTab'));
$('#newtab').addEventListener('contextmenu', (e) => { e.preventDefault(); browser.send('ui:newTabMenu'); });
$('#newtab').title = 'New tab (Ctrl+T) · right-click for private / Tor';
$('#rail-private').addEventListener('click', () => browser.send('ui:newTab', 'private'));
$('#rail-tor').addEventListener('click', () => browser.send('ui:newTab', 'tor'));
$('#rail-panic').addEventListener('click', () => browser.send('ui:panic'));
browser.on('tor', (st) => { $('#rail-tor-dot').hidden = st.state !== 'ready'; });
browser.on('update', (st) => {
  const ready = st.status === 'ready' || st.status === 'available';
  $('#rail-update-dot').hidden = !ready;
  const sb = document.querySelector('.rail-btn[data-page="settings"]');
  sb.title = ready ? `Lychee ${st.latest} is ready: open Settings > About to update` : 'Settings (Ctrl+,)';
});

function keyLabel(k) {
  return String(k || '').split('+').map((p) => p.replace(/^Key/, '').replace(/^Digit/, '').replace('Backquote', '`')).join('+');
}
$('#strip').addEventListener('dblclick', (e) => { if (e.target.id === 'tabs' || e.target.classList.contains('strip-fill')) browser.send('ui:newTab'); });

// ---------------------------------------------------------------- toolbar
function displayUrl(t) {
  if (!t) return '';
  if (t.page === 'home') return '';
  if (t.page && t.page !== 'error') return `lychee://${t.page}`;
  if (t.query) return t.query; // Lychee Search results: show what you searched, not the search site's URL
  return t.url;
}

let iconKey = '';
function renderToolbar() {
  const t = active();
  if (state.activeId !== lastActive) { lastActive = state.activeId; editing = false; }
  $('#back').disabled = !(t && t.canBack);
  $('#fwd').disabled = !(t && t.canFwd);

  const loading = t && t.loading;
  const rl = $('#reload');
  const rKey = loading ? 'x' : 'reload';
  if (rl._key !== rKey) { rl._key = rKey; rl.innerHTML = icon(rKey); rl.title = loading ? 'Stop (Esc)' : 'Reload (Ctrl+R)'; }

  if (!editing) omni.value = displayUrl(t);
  const kb = $('#kind-badge');
  const kind = t ? t.kind : 'normal';
  kb.hidden = kind === 'normal';
  kb.textContent = kind === 'tor' ? 'Tor' : 'Private';
  kb.className = 'kind-' + kind;
  document.body.classList.toggle('panicking', state.panicTabId != null);

  let k = 'globe', cls = '';
  if (t) {
    if (t.query && !t.page) { k = 'search'; cls = 'internal'; }
    else if (t.page === 'error') { k = 'warn'; cls = 'insecure'; }
    else if (t.page) { k = 'sparkle'; cls = 'internal'; }
    else if (t.secure) { k = 'lock'; cls = 'secure'; }
    else if (/^http:/.test(t.url)) { k = 'warn'; cls = 'insecure'; }
  }
  const oi = $('#omni-icon');
  if (iconKey !== k + cls) { iconKey = k + cls; oi.innerHTML = icon(k); oi.className = cls; }
  oi.title = cls === 'secure' ? 'Connection is secure' : cls === 'insecure' ? 'Not secure' : '';

  const star = $('#star');
  star.hidden = !t || !!t.page || !/^https?:/.test(t.url);
  star.classList.toggle('on', !!(t && t.bookmarked));
  star.title = t && t.bookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark this page (Ctrl+D)';

  const zb = $('#zoom-badge');
  zb.hidden = !t || t.zoom === 100;
  if (t) zb.textContent = t.zoom + '%';

  const sh = $('#shield');
  const on = state.adblock;
  const count = t && !t.page ? t.blocked : 0;
  const shKey = `${on}|${count}`;
  if (sh._key !== shKey) {
    sh._key = shKey;
    sh.innerHTML = icon(on ? 'shieldCheck' : 'shieldOff') + (on && count ? `<span class="count">${count > 999 ? '999+' : count}</span>` : '');
  }
  sh.classList.toggle('on', on && count > 0);
  sh.title = on ? `Ad blocker on: ${count} blocked on this page. Click to turn off.` : 'Ad blocker off. Click to turn on.';

  document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('on', !!t && t.page === b.dataset.page));
}

$('#back').addEventListener('click', () => browser.send('ui:back'));
$('#fwd').addEventListener('click', () => browser.send('ui:forward'));
$('#reload').addEventListener('click', (e) => {
  const t = active();
  if (t && t.loading) browser.send('ui:stop');
  else browser.send('ui:reload', e.shiftKey || e.ctrlKey);
});
$('#star').addEventListener('click', () => browser.send('ui:toggleBookmark'));
$('#zoom-badge').addEventListener('click', () => browser.send('ui:zoomReset'));
$('#shield').addEventListener('click', () => browser.send('ui:toggleAdblock'));
$('#dl-btn').addEventListener('click', () => browser.send('ui:openPage', 'downloads'));
document.querySelectorAll('.rail-btn').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.page === 'home') browser.send('ui:home');
  else browser.send('ui:openPage', b.dataset.page);
}));

// ---------------------------------------------------------------- omnibox
let selectOnUp = false;
omni.addEventListener('mousedown', () => { selectOnUp = document.activeElement !== omni; });
omni.addEventListener('mouseup', (e) => {
  if (selectOnUp && omni.selectionStart === omni.selectionEnd) { e.preventDefault(); omni.select(); }
  selectOnUp = false;
});
omni.addEventListener('blur', () => { editing = false; renderToolbar(); });

omni.addEventListener('input', async (e) => {
  editing = true;
  if (e.inputType !== 'insertText') return;
  if (omni.selectionStart !== omni.value.length) return;
  const typed = omni.value;
  const bare = typed.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (!bare) return;
  const c = await browser.autocomplete(typed);
  if (!c || omni.value !== typed || !c.toLowerCase().startsWith(bare)) return;
  omni.value = typed + c.slice(bare.length);
  omni.setSelectionRange(typed.length, omni.value.length);
});

omni.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = omni.value.trim();
    if (!v) return;
    editing = false;
    browser.send('ui:navigate', v);
  } else if (e.key === 'Escape') {
    if (editing) { editing = false; renderToolbar(); omni.select(); }
    else browser.send('ui:focusPage');
  }
});

browser.on('focus-omnibox', () => { omni.focus(); omni.select(); });

// ---------------------------------------------------------------- downloads
browser.on('downloads', ({ active: n, progress }) => {
  const ring = $('#dl-btn .ring');
  const btn = $('#dl-btn');
  $('#rail-dl-dot').hidden = !n;
  btn.classList.toggle('active', n > 0);
  if (!n) { ring.hidden = true; ring.classList.remove('indeterminate'); return; }
  ring.hidden = false;
  const indet = progress > 1 || progress < 0;
  ring.classList.toggle('indeterminate', indet);
  if (!indet) ring.style.strokeDashoffset = String(94.25 * (1 - progress));
  else ring.style.strokeDashoffset = '';
  btn.title = `${n} download${n > 1 ? 's' : ''} in progress`;
});

// ---------------------------------------------------------------- find
function openFind() {
  if (findbar.hidden) { findbar.hidden = false; browser.send('ui:findState', true); }
  findInput.focus();
  findInput.select();
  if (findInput.value) browser.send('ui:find', findInput.value, true, true);
}
function closeFind() {
  if (findbar.hidden) return;
  findbar.hidden = true;
  $('#find-count').textContent = '';
  browser.send('ui:findState', false);
}
findInput.addEventListener('input', () => browser.send('ui:find', findInput.value, true, true));
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); browser.send('ui:find', findInput.value, !e.shiftKey, false); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('#find-next').addEventListener('click', () => browser.send('ui:find', findInput.value, true, false));
$('#find-prev').addEventListener('click', () => browser.send('ui:find', findInput.value, false, false));
$('#find-close').addEventListener('click', closeFind);
browser.on('find-open', openFind);
browser.on('find-close', closeFind);
browser.on('found', ({ active: a, total }) => {
  $('#find-count').textContent = findInput.value ? `${total ? a : 0}/${total}` : '';
});

// ---------------------------------------------------------------- wiring
browser.on('tabs', (s) => { state = s; renderTabs(); renderToolbar(); });
browser.on('settings', (s) => {
  settings = s;
  applyTheme(s);
  applyAccent(s.accent);
  const en = s.engines[s.searchEngine] || 'the web';
  omni.placeholder = `Search ${en === 'Lychee Search' ? 'Lychee' : en} or type a URL`;
  $('#rail-panic').title = `Panic (${keyLabel(s.panicKey)}): jump to ${s.panicUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
});
browser.send('ui:ready');
