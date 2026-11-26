'use strict';
/* global $, L, initPage, favEl, siteLabel, titleLabel, openUrl, dayLabel, clockTime, icon */
let timer = null;

async function load() {
  const q = $('#q').value.trim();
  const items = await L.call('history', q, q ? 1000 : 600);
  const list = $('#list');
  list.replaceChildren();
  $('#empty').hidden = items.length > 0;
  $('#empty').textContent = q ? `No history matches "${q}".` : 'Nothing here yet. Go visit something!';
  $('#clear').disabled = !items.length && !q;
  let day = null, rows = null;
  for (const h of items) {
    const d = dayLabel(h.t);
    if (d !== day) {
      day = d;
      const head = document.createElement('h3');
      head.className = 'day';
      head.textContent = d;
      rows = document.createElement('div');
      rows.className = 'rows card';
      list.append(head, rows);
    }
    const r = document.createElement('div');
    r.className = 'row';
    r.title = h.url;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = clockTime(h.t);
    const main = document.createElement('span');
    main.className = 'main';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = titleLabel(h.title, h.url) || h.url;
    const host = document.createElement('span');
    host.className = 'h';
    host.textContent = siteLabel(h.url);
    main.append(t, host);
    const del = document.createElement('button');
    del.className = 'icon-btn danger';
    del.title = 'Remove from history';
    del.innerHTML = icon('x');
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await L.call('deleteHistory', h.url, h.t);
      r.remove();
      if (!rows.children.length) { rows.previousElementSibling.remove(); rows.remove(); }
    });
    r.append(time, favEl(h.url, h.favicon, 18), main, del);
    r.addEventListener('click', (e) => openUrl(h.url, e));
    r.addEventListener('auxclick', (e) => { if (e.button === 1) openUrl(h.url, e); });
    rows.append(r);
  }
}

$('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 120); });
$('#clear').addEventListener('click', () => $('#confirm').showModal());
$('#no').addEventListener('click', () => $('#confirm').close());
$('#yes').addEventListener('click', async () => { $('#confirm').close(); await L.call('clearHistory'); load(); });

(async () => { await initPage(); load(); })();
