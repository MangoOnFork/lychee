// Lychee for YouTube: pick a sharp video quality instead of YouTube's "Auto".
// Signed-out viewers (Lychee can't sign in to Google) get a conservative Auto pick, so this asks the
// player for the smallest quality that still fills your screen (or the best available if none does).
// Runs in the page's main world, because the player's quality API lives there. Once per video:
// if you change the quality yourself from the gear menu, Lychee leaves it alone.
(() => {
  if (window.__lycheeHD) return;
  Object.defineProperty(window, '__lycheeHD', { value: true });
  const ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const HEIGHT = { highres: 4320, hd2880: 2880, hd2160: 2160, hd1440: 1440, hd1080: 1080, hd720: 720, large: 480, medium: 360, small: 240, tiny: 144 };
  let done = '';

  function pick(levels) {
    const avail = ORDER.filter((q) => levels.includes(q));
    if (!avail.length) return null;
    const need = Math.round(screen.height * (window.devicePixelRatio || 1));
    const fits = avail.filter((q) => HEIGHT[q] >= need);
    return fits.length ? fits[fits.length - 1] : avail[0];
  }

  function apply() {
    if (!window.__lycheeHDOn) return;
    const p = document.getElementById('movie_player');
    if (!p || typeof p.getAvailableQualityLevels !== 'function') return;
    const levels = p.getAvailableQualityLevels() || [];
    if (!levels.length) return;
    const id = (p.getVideoData && p.getVideoData().video_id) || location.href;
    const key = id + '|' + levels.join(',');
    if (key === done) return;
    const q = pick(levels);
    if (!q) return;
    try { p.setPlaybackQualityRange(q, q); } catch (e) {}
    try { if (p.setPlaybackQuality) p.setPlaybackQuality(q); } catch (e) {}
    done = key;
  }
  setInterval(apply, 1500);
})();
