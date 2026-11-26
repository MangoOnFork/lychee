// Lychee for YouTube. Runs in an isolated world (shares the DOM, invisible to YouTube's scripts).
// Config arrives as window.__lycheeYT = { ads, ambient } and can change at any time.
//  - ads:     mutes and skips video ads (clicks "Skip", or jumps to the end)
//  - ambient: Ambient Light, a blurred glow of the video spilling out around the player
(() => {
  const cfg = () => window.__lycheeYT || {};
  if (window.__lycheeYTStarted) return;
  window.__lycheeYTStarted = true;

  // ---------------------------------------------------------------- ad skipper
  const ad = { active: false, muted: false, rate: 1 };
  function adTick() {
    const p = document.getElementById('movie_player');
    const v = p && p.querySelector('video');
    if (!p || !v) return;
    const showing = cfg().ads && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
    if (showing) {
      if (!ad.active) { ad.active = true; ad.muted = v.muted; ad.rate = v.playbackRate || 1; }
      v.muted = true;
      if (Number.isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2) v.currentTime = v.duration - 0.1;
      try { v.playbackRate = 16; } catch {}
      const skip = p.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button');
      if (skip) skip.click();
    } else if (ad.active) {
      ad.active = false;
      v.muted = ad.muted;
      try { v.playbackRate = ad.rate; } catch {}
    }
  }
  setInterval(adTick, 250);

  // ---------------------------------------------------------------- Ambient Light
  // Draws the current frame tiny (64x36) onto a canvas behind the player; CSS blurs and scales it.
  let box = null, cvs = null, ctx = null, video = null, last = 0, rectKey = '';
  function ensure() {
    if (box && box.isConnected) return;
    box = document.createElement('div');
    box.id = 'lychee-ambient';
    box.setAttribute('aria-hidden', 'true');
    cvs = document.createElement('canvas');
    cvs.width = 64; cvs.height = 36;
    ctx = cvs.getContext('2d', { alpha: false });
    box.append(cvs);
    document.body.append(box);
  }
  function teardown() {
    document.documentElement.classList.remove('lychee-ambient');
    if (box) { box.remove(); box = null; }
  }
  function playerVideo() {
    if (video && video.isConnected) return video;
    video = document.querySelector('#movie_player video');
    return video;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const on = cfg().ambient && /\/(watch|live)/.test(location.pathname) && !document.fullscreenElement;
    const v = on && playerVideo();
    const player = v && document.getElementById('movie_player');
    if (!player || !v.videoWidth) { if (box) teardown(); return; }
    ensure();
    document.documentElement.classList.add('lychee-ambient');
    // follow the player (default, theater and miniplayer sizes all move it)
    const r = player.getBoundingClientRect();
    const key = `${Math.round(r.left)},${Math.round(r.top + scrollY)},${Math.round(r.width)},${Math.round(r.height)}`;
    if (key !== rectKey) {
      rectKey = key;
      Object.assign(box.style, {
        left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`,
        width: `${r.width}px`, height: `${r.height}px`,
        transform: 'scale(1.12, 1.22)',
      });
    }
    // ~24 fps while playing, once in a while when paused
    const gap = v.paused ? 600 : 42;
    if (now - last < gap) return;
    last = now;
    try { ctx.drawImage(v, 0, 0, cvs.width, cvs.height); } catch {}
  }
  requestAnimationFrame(frame);
  document.addEventListener('fullscreenchange', () => { rectKey = ''; });
  window.addEventListener('resize', () => { rectKey = ''; });
})();
