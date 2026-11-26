'use strict';
/* global $, L, initPage */
function show(st) {
  const missing = st.state === 'missing';
  const failed = st.state === 'error';
  $('#title').textContent = missing ? "Tor isn't installed" : failed ? "Couldn't connect to Tor" : st.state === 'ready' ? 'Connected' : 'Connecting to Tor';
  $('#why').hidden = missing;
  $('#missing').hidden = !missing;
  $('#bar').hidden = missing || failed;
  $('#bar').firstElementChild.style.width = Math.max(4, st.progress || 0) + '%';
  $('#msg').textContent = missing ? '' : `${st.progress || 0}% · ${st.message || ''}`;
  $('#get').hidden = !missing;
  $('#retry').hidden = !(missing || failed);
}

$('#get').addEventListener('click', () => L.call('getTor'));
$('#retry').addEventListener('click', async () => show(await L.call('torStart')));

(async () => {
  await initPage();
  const about = await L.call('about');
  $('#where').textContent = about.userData + '\\tor';
  L.on('tor', show);
  let st = await L.call('tor');
  if (st.state === 'off') st = await L.call('torStart');
  show(st);
})();
