'use strict';
/* global $, $$, L, initPage, toast, icon */
const SWATCHES = ['#ff6b8b', '#ff7a59', '#f5c542', '#4fd1a5', '#5aa9ff', '#a78bfa', '#f472d0', '#e8e2e3'];
const PERM_NAMES = {
  camera: 'Camera', microphone: 'Microphone', 'camera+microphone': 'Camera + mic', geolocation: 'Location',
  notifications: 'Notifications', 'clipboard-read': 'Clipboard', 'display-capture': 'Screen share',
  openExternal: 'Open apps', midi: 'MIDI', midiSysex: 'MIDI',
};
let S = null;
let recording = false;

function keyLabel(k) {
  return String(k || '').split('+').map((p) => p.replace(/^Key/, '').replace(/^Digit/, '').replace('Backquote', '`')).join(' + ');
}

function chipRow(sel, options, current, onPick) {
  const box = $(sel);
  box.replaceChildren();
  for (const [k, name] of Object.entries(options || {})) {
    const b = document.createElement('button');
    b.className = 'chip' + (k === current ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => onPick(k));
    box.append(b);
  }
}

function themeCard(id, th, opts) {
  const b = document.createElement('button');
  b.className = 'theme-card' + (opts.on ? ' on' : '');
  b.title = opts.title || th.name;
  const pv = document.createElement('div');
  pv.className = 'pv';
  pv.style.background = `${th.wallpaper}, ${th.bg}`;
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = th.accent;
  dot.style.color = th.accent;
  pv.append(dot);
  if (opts.badge) { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = opts.badge; pv.append(bd); }
  const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = opts.name || th.name;
  const bl = document.createElement('div'); bl.className = 'bl'; bl.textContent = opts.blurb || th.blurb;
  b.append(pv, nm, bl);
  b.addEventListener('click', () => L.call('set', 'theme', id));
  return b;
}

function renderThemes(s) {
  const grid = $('#themes');
  grid.replaceChildren();
  // Lychee (the default) first, then Seasonal, then the rest
  const season = s.themes.find((t) => t.id === s.seasonalTheme) || s.themes[0];
  const lychee = s.themes.find((t) => t.id === 'lychee');
  grid.append(themeCard('lychee', lychee, { on: s.theme === 'lychee', badge: 'DEFAULT' }));
  grid.append(themeCard('auto', season, {
    on: s.theme === 'auto', badge: 'AUTO', name: `Seasonal (${season.name} now)`,
    blurb: 'Christmas in December, Spooky in October…', title: 'Switches theme with the seasons',
  }));
  for (const th of s.themes) if (th.id !== 'lychee') grid.append(themeCard(th.id, th, { on: s.theme === th.id }));

  chipRow('#fx-amount', { light: 'Light', normal: 'Normal', heavy: 'Blizzard' }, s.effectAmount, (k) => L.call('set', 'effectAmount', k));
  $$('#fx-amount .chip').forEach((c) => { c.disabled = !s.effects; c.style.opacity = s.effects ? '' : '.45'; });
  $('[data-setting="effectsOnSearch"]').disabled = !s.effects;

  const wp = { theme: 'Theme', none: 'None' };
  if (s.wallpaperFile) wp.custom = 'My image';
  chipRow('#wallpaper-mode', wp, s.wallpaper, (k) => L.call('set', 'wallpaper', k));
  $('#dim-row').hidden = s.wallpaper !== 'custom';
  if (document.activeElement !== $('#wallpaper-dim')) $('#wallpaper-dim').value = s.wallpaperDim;
  $('#dim-val').textContent = s.wallpaperDim + '%';
}

function showTor(st) {
  const el = $('#tor-status');
  el.className = 'tor-status ' + (st.state === 'ready' ? 'ok' : st.exe ? '' : 'no');
  el.textContent = st.state === 'ready' ? 'Tor connected'
    : st.state === 'starting' ? `Tor connecting ${st.progress}%`
    : st.exe ? 'Tor found' : 'Tor not installed yet';
}

function render(s) {
  S = s;
  const eng = $('#engines');
  eng.replaceChildren();
  for (const [k, name] of Object.entries(s.engines)) {
    const b = document.createElement('button');
    b.className = 'chip' + (k === s.searchEngine ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => L.call('set', 'searchEngine', k));
    eng.append(b);
  }

  if (!recording) $('#panic-key').textContent = keyLabel(s.panicKey);
  if (document.activeElement !== $('#panic-url')) $('#panic-url').value = s.panicUrl;
  chipRow('#disguise', s.disguises, s.disguise, (k) => L.call('set', 'disguise', k));
  chipRow('#ua', s.uaPresets, s.uaPreset, (k) => L.call('set', 'uaPreset', k));
  for (const el of $$('[data-exit]')) el.checked = !!(s.clearOnExit || {})[el.dataset.exit];

  renderThemes(s);

  const dns = $('#dns');
  dns.replaceChildren();
  for (const [k, name] of [['off', 'Off'], ...Object.entries(s.dnsProviders), ['custom', 'Custom']]) {
    const b = document.createElement('button');
    b.className = 'chip' + (k === s.dnsProvider ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => {
      if (k === 'custom' && !s.dnsCustom) { $('#dns-custom-form').hidden = false; $('#dns-custom').focus(); return; }
      L.call('set', 'dnsProvider', k).then((ok) => ok && toast(k === 'off' ? 'Secure DNS off' : `Secure DNS: ${name}`));
    });
    dns.append(b);
  }
  $('#dns-custom-form').hidden = s.dnsProvider !== 'custom' && document.activeElement !== $('#dns-custom');
  if (document.activeElement !== $('#dns-custom')) $('#dns-custom').value = s.dnsCustom || '';
  $('[data-setting="dnsStrict"]').disabled = s.dnsProvider === 'off';

  const sw = $('#swatches');
  sw.replaceChildren();
  for (const c of SWATCHES) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c.toLowerCase() === s.accent.toLowerCase() ? ' on' : '');
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => L.call('set', 'accent', c));
    sw.append(b);
  }
  const custom = document.createElement('label');
  custom.className = 'swatch-custom';
  custom.title = 'Custom colour';
  const isCustom = !SWATCHES.includes(s.accent.toLowerCase());
  if (isCustom) { custom.style.background = s.accent; custom.style.borderStyle = 'solid'; }
  custom.innerHTML = isCustom ? '' : icon('plus');
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = s.accent;
  inp.addEventListener('change', () => L.call('set', 'accent', inp.value));
  custom.append(inp);
  sw.append(custom);

  for (const el of $$('[data-setting]')) el.checked = !!s[el.dataset.setting];
  if (document.activeElement !== $('#proxy')) $('#proxy').value = s.proxy || '';

  const perms = $('#perms');
  perms.replaceChildren();
  const entries = Object.entries(s.sitePermissions || {});
  if (!entries.length) {
    const p = document.createElement('div');
    p.className = 'hint';
    p.style.color = 'var(--faint)';
    p.textContent = 'None yet. Sites ask when they need something.';
    perms.append(p);
  }
  for (const [key, ok] of entries) {
    const [origin, perm] = [key.slice(0, key.lastIndexOf('|')), key.slice(key.lastIndexOf('|') + 1)];
    const row = document.createElement('div');
    row.className = 'perm';
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = `${origin.replace(/^https?:\/\//, '')} · ${PERM_NAMES[perm] || perm}`;
    const st = document.createElement('span');
    st.className = 'state ' + (ok ? 'ok' : 'no');
    st.textContent = ok ? 'ALLOWED' : 'BLOCKED';
    const rm = document.createElement('button');
    rm.className = 'icon-btn danger';
    rm.title = 'Forget (the site will ask again)';
    rm.innerHTML = icon('x');
    rm.addEventListener('click', async () => render(await L.call('removePermission', key)));
    row.append(txt, st, rm);
    perms.append(row);
  }
}

for (const el of $$('[data-setting]')) {
  el.addEventListener('change', () => L.call('set', el.dataset.setting, el.checked));
}

$('#proxy-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('#proxy').value.trim();
  const ok = await L.call('set', 'proxy', v);
  toast(ok ? (v ? 'Proxy applied' : 'Using system proxy') : 'That proxy value was rejected');
});

// ---- updates
function renderUpdate(st) {
  if (!st) return;
  const txt = $('#update-text'), btn = $('#update-btn'), bar = $('#update-bar');
  const where = st.mode === 'portable' ? ' (portable)' : '';
  const msgs = {
    dev: `Running from source (v${st.current}${where}), so updates are off. Packaged builds update themselves.`,
    idle: `You're on Lychee ${st.current}${where}.`,
    checking: 'Checking for updates…',
    current: `You're up to date: Lychee ${st.current}${where}.`,
    downloading: `Downloading Lychee ${st.latest}… ${st.progress || 0}%`,
    ready: `Lychee ${st.latest} is ready. Restart to finish updating.`,
    available: `Lychee ${st.latest} is out. Mac builds update by downloading the new version.`,
    error: `Couldn't check for updates: ${st.error || 'unknown error'}`,
  };
  txt.textContent = msgs[st.status] || msgs.idle;
  bar.hidden = st.status !== 'downloading';
  bar.firstElementChild.style.width = (st.progress || 0) + '%';
  btn.disabled = st.status === 'checking' || st.status === 'downloading' || st.mode === 'dev';
  btn.classList.toggle('primary', st.status === 'ready' || st.status === 'available');
  btn.textContent = st.status === 'ready' ? 'Restart to update' : st.status === 'available' ? 'Download' : 'Check now';
}
$('#update-btn').addEventListener('click', async () => {
  const st = await L.call('update');
  if (st && (st.status === 'ready' || st.status === 'available')) L.call('installUpdate');
  else renderUpdate(await L.call('checkUpdate'));
});

// ---- appearance
$('#pick-wallpaper').addEventListener('click', async () => {
  if (await L.call('pickWallpaper')) toast('Wallpaper set. Check your home page!');
});
let dimTimer = null;
$('#wallpaper-dim').addEventListener('input', (e) => {
  $('#dim-val').textContent = e.target.value + '%';
  clearTimeout(dimTimer);
  dimTimer = setTimeout(() => L.call('set', 'wallpaperDim', +e.target.value), 120);
});

// ---- safety
$('#panic-change').addEventListener('click', () => {
  recording = true;
  $('#panic-key').textContent = 'Press a key…';
  $('#panic-key').classList.add('rec');
  $('#panic-change').blur();
});
window.addEventListener('keydown', async (e) => {
  if (!recording) return;
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  recording = false;
  $('#panic-key').classList.remove('rec');
  if (e.code === 'Escape') { $('#panic-key').textContent = keyLabel(S.panicKey); return; }
  if (e.code === 'F8') { toast('F8 is your Medal clip key, pick another'); $('#panic-key').textContent = keyLabel(S.panicKey); return; }
  const combo = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.code].filter(Boolean).join('+');
  const ok = await L.call('set', 'panicKey', combo);
  toast(ok ? `Panic key is now ${keyLabel(combo)}` : "That key can't be used");
  if (!ok) $('#panic-key').textContent = keyLabel(S.panicKey);
}, true);
$('#panic-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  let v = $('#panic-url').value.trim();
  if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
  toast((await L.call('set', 'panicUrl', v)) ? 'Panic page saved' : 'That URL was rejected');
});
$('#panic-test').addEventListener('click', () => L.call('panic'));
$('#new-private').addEventListener('click', () => L.call('newTab', 'private'));
$('#new-tor').addEventListener('click', () => L.call('newTab', 'tor'));
for (const el of $$('[data-exit]')) {
  el.addEventListener('change', () => {
    const v = { history: false, cookies: false, cache: false };
    for (const x of $$('[data-exit]')) v[x.dataset.exit] = x.checked;
    L.call('set', 'clearOnExit', v);
  });
}

$('#dns-custom-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('#dns-custom').value.trim();
  if (!v || !(await L.call('set', 'dnsCustom', v))) { toast('Needs one or more https:// DoH URLs'); return; }
  await L.call('set', 'dnsProvider', 'custom');
  toast('Custom secure DNS applied');
});

$('#clear-btn').addEventListener('click', async () => {
  const what = {
    history: $('#c-history').checked, cache: $('#c-cache').checked,
    cookies: $('#c-cookies').checked, downloads: $('#c-downloads').checked,
  };
  if (!Object.values(what).some(Boolean)) { toast('Pick something to clear first'); return; }
  $('#clear-btn').disabled = true;
  await L.call('clearData', what);
  $('#clear-btn').disabled = false;
  toast('Cleared');
});

$('#data-folder').addEventListener('click', () => L.call('openDataFolder'));

// highlight the section in view
function syncNav() {
  let cur = null;
  for (const s of $$('.sec')) if (s.getBoundingClientRect().top < 160) cur = s.id;
  if (!cur) cur = 'safety';
  for (const a of $$('.snav a')) a.classList.toggle('on', a.getAttribute('href') === '#' + cur);
}
document.addEventListener('scroll', syncNav, { passive: true });

(async () => {
  const s = await initPage();
  render(s);
  L.on('settings', render);
  showTor(await L.call('tor'));
  L.on('tor', showTor);
  renderUpdate(await L.call('update'));
  L.on('update', renderUpdate);
  const st = await L.call('stats');
  $('#ads-total').textContent = `${(st.adsBlocked || 0).toLocaleString()} blocked so far.`;
  const a = await L.call('about');
  const kv = $('#about-kv');
  for (const [k, v] of [['Lychee', a.version], ['Chromium', a.chrome], ['Electron', a.electron], ['Node', a.node],
    ['Ad blocker', a.adblockReady ? 'loaded' : 'not loaded (offline?)'],
    ['Edition', a.portable ? 'Portable (profile saved next to Lychee.exe)' : a.updateMode === 'dev' ? 'Source' : a.platform === 'darwin' ? 'Mac' : 'Installed'],
    ['Profile', a.userData]]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    kv.append(dt, dd);
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  syncNav();
})();
