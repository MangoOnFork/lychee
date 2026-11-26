'use strict';
/* global $, L, initPage, hostOf, icon */
const p = new URLSearchParams(location.search);
const url = p.get('url') || '';
const code = p.get('code') || '';
const desc = p.get('desc') || '';
const n = Number(code);

let title = "This site can't be reached";
let why = 'Something went wrong loading this page.';
const httpsOnly = code === 'https-only';
const aiOff = code === 'ai-off';
if (aiOff) {
  title = 'Lychee AI is turned off';
  why = "AI chat is switched off in Lychee for now. Regular search still works.";
} else if (httpsOnly) {
  title = "This site doesn't support a secure connection";
  why = `Lychee tried to load ${hostOf(url)} over HTTPS and it didn't work. The plain HTTP version can be read or changed by your network.`;
} else if (code === 'crash') { title = 'This page crashed'; why = 'The tab ran out of memory or hit a bug. Reloading usually fixes it.'; }
else if (n === -105 || n === -137) { title = "Couldn't find that site"; why = `There's no server answering for ${hostOf(url)}. Check the spelling.`; }
else if (n === -106) { title = "You're offline"; why = 'Check your Wi-Fi or cable and try again.'; }
else if (n === -102) { title = 'Connection refused'; why = `${hostOf(url)} refused to connect.`; }
else if (n === -118 || n === -7) { title = 'That took too long'; why = `${hostOf(url)} didn't respond in time.`; }
else if (n === -101 || n === -100) { title = 'Connection was reset'; why = 'The connection dropped part way through.'; }
else if (n <= -200 && n > -300) { title = "This connection isn't private"; why = "The site's security certificate isn't valid, so Lychee stopped loading it."; }
else if (n === -130 || n === -111 || n === -115 || n === -15) { title = 'Proxy problem'; why = 'The proxy server in Settings > Network is not responding.'; }
else if (n === -20 || n === -21) { title = 'Blocked'; why = 'This request was blocked by your network.'; }

document.title = title;
$('#title').textContent = title;
$('#why').textContent = why;
$('#url').textContent = url;
$('#code').textContent = desc ? `${desc}${code && code !== 'crash' ? ' (' + code + ')' : ''}` : '';

if (aiOff) {
  $('#url').hidden = true;
  $('#code').hidden = true;
  $('#retry').hidden = true;
  $('#search').innerHTML = `${icon('search')}Back to search`;
  $('#search').classList.add('primary');
}
if (httpsOnly) {
  $('#retry').innerHTML = `${icon('warn')}Continue to HTTP site`;
  $('#retry').classList.remove('primary');
  $('#search').innerHTML = `${icon('left')}Go back`;
}
$('#retry').addEventListener('click', () => {
  if (!url) return;
  if (httpsOnly) L.call('allowHttp', url);
  else location.href = url;
});
$('#search').addEventListener('click', (e) => {
  if (!httpsOnly && !aiOff) return;
  e.stopImmediatePropagation();
  if (aiOff) {
    // going "back" could land on the chat page again, so search the same words instead
    let q = '';
    try { q = new URL(url).searchParams.get('q') || ''; } catch {}
    L.call('go', q || 'lychee://home/');
    return;
  }
  history.back();
});
$('#search').addEventListener('click', () => {
  let q = url;
  try { q = new URL(url).hostname; } catch {}
  L.call('go', `"${q.replace(/^www\./, '')}"`); // quoted so it searches instead of navigating
});

initPage();
