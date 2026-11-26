'use strict';
/* global $, L, initPage, hostOf, fmtBytes, timeAgo, icon */
let all = [];
const els = new Map();

function ext(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || '');
  return m ? m[1] : 'file';
}

function actionBtn(ic, title, fn, danger) {
  const b = document.createElement('button');
  b.className = 'icon-btn' + (danger ? ' danger' : '');
  b.title = title;
  b.innerHTML = icon(ic);
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}

function build(d) {
  const c = document.createElement('div');
  c.className = 'dl card';
  c.innerHTML = '<div class="ficon"></div><div class="body"><div class="name"></div><div class="meta"></div><div class="bar"><i></i></div></div><div class="acts"></div>';
  c.querySelector('.name').addEventListener('click', () => { if (c._d.state === 'completed') L.call('dl', c._d.id, 'open'); });
  return c;
}

function update(c, d) {
  c._d = d;
  c.querySelector('.ficon').textContent = ext(d.name).slice(0, 4);
  c.querySelector('.name').textContent = d.name;
  c.title = d.url;
  const meta = c.querySelector('.meta');
  const bar = c.querySelector('.bar');
  const prog = d.state === 'progressing';
  bar.hidden = !prog;
  c.classList.toggle('gone', d.state === 'cancelled');
  if (prog) {
    const pct = d.total ? Math.floor((d.received / d.total) * 100) : null;
    bar.firstChild.style.width = (pct == null ? 30 : pct) + '%';
    meta.textContent = `${d.paused ? 'Paused · ' : ''}${fmtBytes(d.received)}${d.total ? ' of ' + fmtBytes(d.total) : ''}${pct != null ? ' · ' + pct + '%' : ''} · ${hostOf(d.url)}`;
  } else if (d.state === 'completed') {
    meta.textContent = `${fmtBytes(d.received || d.total)} · ${hostOf(d.url)} · ${timeAgo(d.started)}`;
  } else {
    meta.innerHTML = `<span class="bad">${d.state === 'cancelled' ? 'Cancelled' : 'Failed'}</span>`;
    meta.append(` · ${hostOf(d.url)} · ${timeAgo(d.started)}`);
  }
  const acts = c.querySelector('.acts');
  const key = `${d.state}|${d.paused}`;
  if (acts._key !== key) {
    acts._key = key;
    acts.replaceChildren();
    if (prog) {
      acts.append(d.paused
        ? actionBtn('play', 'Resume', () => L.call('dl', d.id, 'resume'))
        : actionBtn('pause', 'Pause', () => L.call('dl', d.id, 'pause')));
      acts.append(actionBtn('x', 'Cancel', () => L.call('dl', d.id, 'cancel'), true));
    } else {
      if (d.state === 'completed') {
        acts.append(actionBtn('external', 'Open', () => L.call('dl', d.id, 'open')));
        acts.append(actionBtn('folder', 'Show in folder', () => L.call('dl', d.id, 'show')));
      } else acts.append(actionBtn('reload', 'Try again', () => L.call('dl', d.id, 'retry')));
      acts.append(actionBtn('trash', 'Remove from list', () => L.call('dl', d.id, 'remove'), true));
    }
  }
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const items = q ? all.filter((d) => d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q)) : all;
  const list = $('#list');
  const seen = new Set();
  items.forEach((d, i) => {
    let c = els.get(d.id);
    if (!c) { c = build(d); els.set(d.id, c); }
    seen.add(d.id);
    update(c, d);
    if (list.children[i] !== c) list.insertBefore(c, list.children[i] || null);
  });
  for (const [id, c] of els) if (!seen.has(id)) { c.remove(); els.delete(id); }
  $('#empty').hidden = items.length > 0;
  $('#empty').textContent = q ? `No downloads match "${q}".` : 'No downloads yet.';
  $('#clear').disabled = !all.some((d) => d.state !== 'progressing');
}

$('#q').addEventListener('input', render);
$('#folder').addEventListener('click', () => L.call('openDownloadsFolder'));
$('#clear').addEventListener('click', () => L.call('dl', null, 'clear'));

(async () => {
  await initPage();
  all = await L.call('downloads');
  render();
  L.on('downloads', (list) => { all = list; render(); });
})();
