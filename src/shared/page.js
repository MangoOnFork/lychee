'use strict';
/* Shared helpers for lychee:// pages. */
window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason)));

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const L = window.lychee;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

// With the search skin on, DuckDuckGo pages are shown as "Lychee Search" (credited in Settings > About)
let lycheeSearchSkin = true;
const isSearchSite = (url) => /^https:\/\/([a-z0-9-]+\.)*duckduckgo\.com\//i.test(url || '');
function siteLabel(url) { return lycheeSearchSkin && isSearchSite(url) ? 'Lychee Search' : hostOf(url); }
function titleLabel(title, url) {
  if (!lycheeSearchSkin || !title) return title;
  return title.replace(/ at DuckDuckGo$/, ' - Lychee Search').replace(/DuckDuckGo/g, 'Lychee Search').replace(/Duck\.ai/g, 'Lychee AI');
}

function applyAccent(hex) {
  const st = document.documentElement.style;
  st.setProperty('--accent', hex);
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  st.setProperty('--accent-ink', lum > 0.45 ? '#1c0a0f' : '#ffffff');
}

// theme: palette, wallpaper (home page) and live effects. <body data-fx="full|subtle|none">
let pageFx = null;
function applyPageTheme(s) {
  const th = s.activeTheme;
  if (!th || !window.LycheeThemes) return;
  LycheeThemes.applyPalette(th);
  const mode = document.body.dataset.fx || 'subtle';
  if (mode === 'full') {
    let wp = document.getElementById('wallpaper');
    if (!wp) { wp = document.createElement('div'); wp.id = 'wallpaper'; wp.setAttribute('aria-hidden', 'true'); document.body.prepend(wp); }
    if (s.wallpaper === 'custom' && s.wallpaperUrl) {
      const d = (s.wallpaperDim || 0) / 100;
      wp.className = 'custom';
      wp.style.backgroundImage = `linear-gradient(rgba(0,0,0,${d}), rgba(0,0,0,${d})), url("${s.wallpaperUrl}")`;
    } else {
      wp.className = 'theme';
      wp.style.backgroundImage = s.wallpaper === 'none' ? 'none' : th.wallpaper;
    }
    // live video wallpaper (Blizzard): blurred and greyed, over the gradient fallback
    const wantVideo = s.wallpaper === 'theme' && th.video ? th.video : null;
    let vid = wp.querySelector('video');
    if (!wantVideo) { if (vid) vid.remove(); }
    else if (!vid || vid.dataset.src !== wantVideo) {
      if (vid) vid.remove();
      vid = document.createElement('video');
      Object.assign(vid, { muted: true, loop: true, autoplay: true, playsInline: true });
      vid.dataset.src = wantVideo;
      vid.src = wantVideo;
      vid.addEventListener('canplay', () => vid.classList.add('on'), { once: true });
      wp.append(vid);
      vid.play().catch(() => {});
    }
  }
  if (mode !== 'none' && window.LycheeEffects) {
    let c = document.getElementById('fx');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'fx';
      c.setAttribute('aria-hidden', 'true');
      document.body.prepend(c);
      pageFx = LycheeEffects.start(c, {});
    }
    const amount = (LycheeEffects.AMOUNTS[s.effectAmount] || 1) * (mode === 'full' ? 1 : 0.4);
    pageFx.set({ type: s.effects ? th.effect : 'none', amount });
  }
}

async function initPage() {
  fillIcons();
  const s = await L.call('settings');
  applyAccent(s.accent);
  applyPageTheme(s);
  lycheeSearchSkin = s.searchSkin !== false;
  L.on('settings', (n) => { applyAccent(n.accent); applyPageTheme(n); lycheeSearchSkin = n.searchSkin !== false; });
  return s;
}

// favicon element with a letter fallback
function favEl(url, favicon, size) {
  const box = document.createElement('span');
  box.className = 'fav';
  if (size) box.style.setProperty('--fs', size + 'px');
  const letter = () => {
    const h = hostOf(url);
    box.textContent = (h[0] || '?').toUpperCase();
    box.classList.add('letter');
  };
  if (favicon) {
    const img = document.createElement('img');
    img.src = favicon;
    img.alt = '';
    img.addEventListener('error', () => { img.remove(); letter(); });
    box.append(img);
  } else letter();
  return box;
}

function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return new Date(t).toLocaleDateString();
}
function clockTime(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function dayLabel(t) {
  const d = new Date(t); const now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400e3);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
function fmtBytes(n) {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
}

// open a URL: ctrl/middle click -> new tab, else same tab
function openUrl(url, e) {
  if (e && (e.ctrlKey || e.metaKey || e.button === 1)) L.call('open', url, !!e.shiftKey);
  else L.call('go', url);
}

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 1800);
}
