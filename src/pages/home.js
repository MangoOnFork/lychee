'use strict';
/* global $, L, initPage, favEl, hostOf, siteLabel, titleLabel, openUrl, timeAgo, icon, esc */
let S = null;
let favs = {};
let editIndex = -1;

function normUrl(v) {
  v = v.trim();
  if (!v) return null;
  if (!/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
  try { const u = new URL(v); return /^(https?|lychee):$/.test(u.protocol) ? u.href : null; } catch { return null; }
}

function renderTiles() {
  const box = $('#tiles');
  box.replaceChildren();
  S.shortcuts.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'tile';
    b.title = s.url;
    const face = document.createElement('span');
    face.className = 'face';
    let host = '';
    try { host = new URL(s.url).hostname; } catch {}
    const known = favs[host] || favs[host.replace(/^www\./, '')] || favs['www.' + host];
    // before the site has been visited, ask the site itself for its icon
    const guess = /^https?:/.test(s.url) ? new URL(s.url).origin + '/favicon.ico' : null;
    face.append(favEl(s.url, known || guess, 26));
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = s.title;
    const rm = document.createElement('span');
    rm.className = 'rm';
    rm.title = 'Remove';
    rm.innerHTML = icon('x');
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = S.shortcuts.filter((_, j) => j !== i);
      L.call('set', 'shortcuts', next);
    });
    b.append(face, label, rm);
    b.addEventListener('click', (e) => openUrl(s.url, e));
    b.addEventListener('auxclick', (e) => { if (e.button === 1) openUrl(s.url, e); });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); openDialog(i); });
    box.append(b);
  });
  if (S.shortcuts.length < 48) {
    const add = document.createElement('button');
    add.className = 'tile add';
    add.innerHTML = `<span class="face">${icon('plus')}</span><span class="label">Add</span>`;
    add.addEventListener('click', () => openDialog(-1));
    box.append(add);
  }
}

function openDialog(i) {
  editIndex = i;
  const s = i >= 0 ? S.shortcuts[i] : { title: '', url: '' };
  $('#dlg-title').textContent = i >= 0 ? 'Edit shortcut' : 'Add shortcut';
  $('#dlg-name').value = s.title;
  $('#dlg-url').value = s.url;
  $('#dlg').showModal();
  (i >= 0 ? $('#dlg-name') : $('#dlg-url')).focus();
}
$('#dlg-cancel').addEventListener('click', () => $('#dlg').close());
$('#dlg-form').addEventListener('submit', (e) => {
  const url = normUrl($('#dlg-url').value);
  if (!url) { e.preventDefault(); $('#dlg-url').setCustomValidity('That does not look like a URL'); $('#dlg-url').reportValidity(); return; }
  const title = $('#dlg-name').value.trim() || hostOf(url);
  const next = S.shortcuts.slice();
  if (editIndex >= 0) next[editIndex] = { title, url };
  else next.push({ title, url });
  L.call('set', 'shortcuts', next);
});
$('#dlg-url').addEventListener('input', (e) => {
  e.target.setCustomValidity('');
  if (!$('#dlg-name').value) {
    const h = hostOf(normUrl(e.target.value) || '');
    $('#dlg-name').placeholder = h ? h.split('.')[0].replace(/^./, (c) => c.toUpperCase()) : '';
  }
});
$('#dlg-name').addEventListener('blur', (e) => { if (!e.target.value && e.target.placeholder) e.target.value = e.target.placeholder; });

async function renderRecent() {
  const sites = await L.call('topSites', 8);
  $('#recent-sec').hidden = !sites.length;
  const box = $('#recent');
  box.replaceChildren();
  for (const s of sites) {
    const c = document.createElement('div');
    c.className = 'recent-card card';
    c.tabIndex = 0;
    const top = document.createElement('div');
    top.className = 'top';
    const host = document.createElement('span');
    host.className = 'host';
    host.textContent = siteLabel(s.url);
    top.append(favEl(s.url, s.favicon, 20), host);
    const t = document.createElement('div');
    t.className = 'ttl';
    t.textContent = titleLabel(s.title, s.url) || s.url;
    const ago = document.createElement('div');
    ago.className = 'ago';
    ago.textContent = timeAgo(s.t);
    c.append(top, t, ago);
    c.addEventListener('click', (e) => openUrl(s.url, e));
    c.addEventListener('auxclick', (e) => { if (e.button === 1) openUrl(s.url, e); });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') openUrl(s.url, e); });
    box.append(c);
  }
}

function tick() {
  const d = new Date();
  $('#time').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function applySettings(s) {
  S = s;
  $('#engine').textContent = 'Searching with ' + s.engines[s.searchEngine];
  $('#theme-name').innerHTML = `<b>${esc(s.activeTheme.name)}</b>${s.theme === 'auto' ? ' theme (auto)' : ' theme'}`;
  $('#clock').hidden = !s.showClock;
  renderTiles();
}

$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q) L.call('go', q);
});
$('#engine-pill').addEventListener('click', () => L.call('go', 'lychee://settings/#search'));
$('#theme-pill').addEventListener('click', () => L.call('go', 'lychee://settings/#look'));

(async () => {
  const s = await initPage();
  const kind = await L.call('kind');
  if (kind !== 'normal') {
    const b = $('#kind-banner');
    b.hidden = false;
    b.classList.add(kind);
    b.innerHTML = kind === 'tor'
      ? `${icon('onion')}<span>Tor tab: traffic goes through the Tor network. Nothing is saved, and your network can't see or block the sites.</span>`
      : `${icon('eyeOff')}<span>Private tab: no history, cookies or cache are kept once you close your private tabs.</span>`;
    document.title = kind === 'tor' ? 'Tor tab' : 'Private tab';
  }
  favs = await L.call('favicons');
  applySettings(s);
  L.on('settings', applySettings);
  const st = await L.call('stats');
  $('#ads').textContent = (st.adsBlocked || 0).toLocaleString();
  L.on('stats', (x) => { $('#ads').textContent = (x.adsBlocked || 0).toLocaleString(); });
  tick();
  setInterval(tick, 1000);
  renderRecent();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderRecent(); });
})();
