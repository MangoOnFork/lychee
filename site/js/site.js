// Lychee website: live theme preview, OS-aware download buttons, latest version from GitHub.
(() => {
  'use strict';
  const OWNER = 'MangoOnFork';
  const REPO = 'lychee';
  const DL = (file) => `https://github.com/${OWNER}/${REPO}/releases/latest/download/${file}`;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ---------------------------------------------------------------- live themes (Lychee's real engine)
  const fx = window.LycheeEffects ? LycheeEffects.start($('#fx'), {}) : null;
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.45 ? '#1c0a0f' : '#ffffff';
  }
  function useTheme(id) {
    const th = LycheeThemes.resolve(id);
    LycheeThemes.applyPalette(th);
    const root = document.documentElement.style;
    root.setProperty('--accent', th.accent);
    root.setProperty('--ink', inkFor(th.accent));
    $('#glow').style.background = th.wallpaper;
    if (fx) fx.set({ type: th.effect, amount: 0.8 });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = th.palette.bg;
    $$('.tchip').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
  }
  const picker = $('#theme-picker');
  // Lychee (the default) first, then Seasonal, then the rest
  const season = LycheeThemes.resolve('auto');
  const all = LycheeThemes.list();
  const chips = [all.find((t) => t.id === 'lychee'), { id: 'auto', name: `Seasonal (${season.name})`, accent: season.accent }, ...all.filter((t) => t.id !== 'lychee')];
  for (const t of chips) {
    const b = document.createElement('button');
    b.className = 'tchip';
    b.dataset.id = t.id;
    b.innerHTML = `<i style="background:${t.accent};color:${t.accent}"></i>${t.name}`;
    b.addEventListener('click', () => useTheme(t.id));
    picker.append(b);
  }
  useTheme('lychee');

  // ---------------------------------------------------------------- downloads
  const ua = navigator.userAgent;
  const os = /Mac|iPhone|iPad/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'win' : 'other';
  for (const a of $$('[data-file]')) a.href = DL(a.dataset.file);
  $('#releases-link').href = `https://github.com/${OWNER}/${REPO}/releases`;
  const hero = $('#hero-dl');
  if (os === 'win') {
    hero.href = DL('Lychee-Setup.exe');
    $('#hero-dl-text').textContent = 'Download for Windows';
    $('.dl[data-os="win"]').classList.add('recommended');
  } else if (os === 'mac') {
    hero.href = DL('Lychee-mac.dmg');
    $('#hero-dl-text').textContent = 'Download for Mac';
    $('.dl[data-os="mac"]').classList.add('recommended');
  }

  // latest version + date, straight from GitHub (fails quietly before the first release)
  fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rel) => {
      const v = String(rel.tag_name || '').replace(/^v/, '');
      const when = rel.published_at ? new Date(rel.published_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
      if (!v) return;
      $('#version-pill').textContent = `Lychee ${v} is out`;
      $('#dl-version').textContent = `Version ${v}${when ? ' · released ' + when : ''}. Free, forever.`;
    })
    .catch(() => {});
})();
