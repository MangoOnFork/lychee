'use strict';
/* global permPrompt, icon */
const card = document.getElementById('card');
let current = null;

document.getElementById('dismiss').innerHTML = icon('x');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setColours(palette, accent) {
  const st = document.documentElement.style;
  for (const k of Object.keys(palette || {})) st.setProperty('--' + k, palette[k]);
  st.setProperty('--accent', accent);
  const n = parseInt(String(accent).slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  st.setProperty('--accent-ink', lum > 0.45 ? '#1c0a0f' : '#ffffff');
}

function reportSize() {
  permPrompt.size(document.body.getBoundingClientRect().height);
}

permPrompt.on((p) => {
  current = p.id;
  setColours(p.palette, p.accent);
  document.getElementById('title').innerHTML = `<b>${esc(p.host)}</b> wants to`;
  document.getElementById('rows').innerHTML = p.rows
    .map((r) => `<div class="row"><i>${icon(r.icon) || icon('info')}</i><span>${esc(r.what)}</span></div>`).join('');
  card.hidden = false;
  // replay the pop-in for each new request
  card.classList.add('out');
  void card.offsetWidth;
  card.classList.remove('out');
  reportSize();
  requestAnimationFrame(reportSize);
  const first = card.querySelector('button.b.primary');
  if (first) first.focus({ preventScroll: true });
});

function answer(choice) {
  if (current == null) return;
  const id = current;
  current = null;
  permPrompt.answer(id, choice);
}

card.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  answer(b.id === 'dismiss' ? 'dismiss' : b.dataset.choice);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') answer('dismiss'); });
new ResizeObserver(reportSize).observe(document.body);
