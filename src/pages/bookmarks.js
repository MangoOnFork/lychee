'use strict';
/* global $, L, initPage, favEl, siteLabel, titleLabel, openUrl, icon */
let all = [];
let renaming = null;

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const items = q ? all.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) : all;
  const grid = $('#grid');
  grid.replaceChildren();
  $('#empty').hidden = items.length > 0;
  $('#empty').textContent = q ? `No bookmarks match "${q}".` : 'No bookmarks yet.';
  $('#sub').textContent = all.length ? `${all.length} saved page${all.length === 1 ? '' : 's'}` : 'Hit the star in the address bar (or Ctrl+D) to save a page';
  for (const b of items) {
    const c = document.createElement('div');
    c.className = 'bm card';
    c.title = b.url;
    const txt = document.createElement('div');
    txt.className = 'txt';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = titleLabel(b.title, b.url) || b.url;
    const h = document.createElement('div');
    h.className = 'h';
    h.textContent = siteLabel(b.url);
    txt.append(t, h);
    const ren = document.createElement('button');
    ren.className = 'icon-btn';
    ren.title = 'Rename';
    ren.innerHTML = icon('edit');
    ren.addEventListener('click', (e) => {
      e.stopPropagation();
      renaming = b;
      $('#dlg-name').value = b.title;
      $('#dlg').showModal();
      $('#dlg-name').select();
    });
    const del = document.createElement('button');
    del.className = 'icon-btn danger';
    del.title = 'Delete';
    del.innerHTML = icon('trash');
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await L.call('removeBookmark', b.id);
      load();
    });
    c.append(favEl(b.url, b.favicon, 22), txt, ren, del);
    c.addEventListener('click', (e) => openUrl(b.url, e));
    c.addEventListener('auxclick', (e) => { if (e.button === 1) openUrl(b.url, e); });
    grid.append(c);
  }
}

async function load() { all = await L.call('bookmarks'); render(); }

$('#q').addEventListener('input', render);
$('#dlg-cancel').addEventListener('click', () => $('#dlg').close());
$('#dlg-form').addEventListener('submit', async () => {
  if (!renaming) return;
  await L.call('renameBookmark', renaming.id, $('#dlg-name').value.trim() || renaming.url);
  load();
});

(async () => { await initPage(); L.on('bookmarks', load); load(); })();
