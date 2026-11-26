// Lychee themes. Works both in the main process (require) and in pages (window.LycheeThemes).
// A theme sets the palette, accent, wallpaper, a live effect, and optional decorations.
(function (root) {
  'use strict';
  const BASE = {
    bg: '#0f0a0b', bg2: '#140d0f', surface: '#1a1214', surface2: '#22171a', surface3: '#2c1e22',
    border: '#2a1d20', border2: '#3a292d', text: '#f4eaeb', muted: '#a8979a', faint: '#6f5f62',
  };

  const THEMES = {
    lychee: {
      name: 'Lychee', blurb: 'The classic', accent: '#ff6b8b', palette: BASE, effect: 'none',
      wallpaper: 'radial-gradient(ellipse 70% 45% at 50% -8%, rgba(255,107,139,.16), transparent 70%)',
    },
    winter: {
      name: 'Christmas', blurb: 'Snow and string lights', accent: '#ff4d5a', effect: 'snow', lights: true,
      palette: {
        bg: '#0a0e13', bg2: '#0d1218', surface: '#121a22', surface2: '#17212b', surface3: '#203040',
        border: '#1b2732', border2: '#2a3b4b', text: '#eef4f8', muted: '#94a7b5', faint: '#5b6e7c',
      },
      wallpaper: 'radial-gradient(ellipse 65% 40% at 50% -6%, rgba(255,77,90,.20), transparent 70%),' +
        'radial-gradient(ellipse 55% 35% at 12% 105%, rgba(52,199,120,.16), transparent 70%),' +
        'radial-gradient(ellipse 55% 35% at 88% 105%, rgba(255,205,90,.10), transparent 70%)',
    },
    frost: {
      name: 'Frost', blurb: 'Quiet snowfall and aurora', accent: '#7cc8ff', effect: 'snow',
      palette: {
        bg: '#080d13', bg2: '#0b1219', surface: '#101a24', surface2: '#15212d', surface3: '#1e2e3e',
        border: '#192633', border2: '#27394a', text: '#eaf4fb', muted: '#8fa6b8', faint: '#576d7e',
      },
      wallpaper: 'radial-gradient(ellipse 80% 35% at 30% -5%, rgba(80,230,190,.16), transparent 70%),' +
        'radial-gradient(ellipse 70% 30% at 75% -2%, rgba(124,160,255,.18), transparent 70%)',
    },
    autumn: {
      name: 'Harvest', blurb: 'Falling leaves, warm glow', accent: '#ff8a3d', effect: 'leaves',
      palette: {
        bg: '#110b07', bg2: '#150e09', surface: '#1d140e', surface2: '#261a12', surface3: '#33231a',
        border: '#2d1f16', border2: '#3f2c20', text: '#f7ede4', muted: '#b39d8b', faint: '#7a6656',
      },
      wallpaper: 'radial-gradient(ellipse 70% 45% at 50% -8%, rgba(255,138,61,.20), transparent 70%),' +
        'radial-gradient(ellipse 50% 35% at 90% 110%, rgba(210,69,42,.14), transparent 70%)',
    },
    spooky: {
      name: 'Spooky', blurb: 'Bats and a full moon', accent: '#ff7a1a', effect: 'bats',
      palette: {
        bg: '#0c0710', bg2: '#100a15', surface: '#18101f', surface2: '#201629', surface3: '#2c1f38',
        border: '#25192f', border2: '#362645', text: '#f3ecf7', muted: '#a596b2', faint: '#6c5d79',
      },
      wallpaper: 'radial-gradient(circle at 84% 16%, #f4e6c0 0 44px, rgba(244,230,192,.22) 47px, rgba(244,230,192,.06) 90px, transparent 150px),' +
        'radial-gradient(ellipse 70% 45% at 30% 110%, rgba(140,60,200,.18), transparent 70%)',
    },
    sakura: {
      name: 'Sakura', blurb: 'Drifting cherry blossoms', accent: '#ff8fb8', effect: 'petals',
      palette: { ...BASE, bg: '#100a0d', bg2: '#140d11', surface: '#1c1318', surface2: '#251a20', surface3: '#30222a' },
      wallpaper: 'radial-gradient(ellipse 70% 45% at 50% -8%, rgba(255,143,184,.20), transparent 70%),' +
        'radial-gradient(ellipse 45% 30% at 10% 100%, rgba(255,200,220,.08), transparent 70%)',
    },
    summer: {
      name: 'Summer Nights', blurb: 'Fireflies in the dark', accent: '#3ee0b0', effect: 'fireflies',
      palette: {
        bg: '#060d0c', bg2: '#081210', surface: '#0e1a18', surface2: '#132321', surface3: '#1b302d',
        border: '#162623', border2: '#223a36', text: '#eaf7f3', muted: '#8fb0a8', faint: '#57766f',
      },
      wallpaper: 'radial-gradient(ellipse 70% 40% at 50% 110%, rgba(62,224,176,.14), transparent 70%),' +
        'radial-gradient(ellipse 60% 35% at 50% -10%, rgba(255,190,90,.08), transparent 70%)',
    },
    midnight: {
      name: 'Midnight', blurb: 'Stars and shooting stars', accent: '#9b8cff', effect: 'stars',
      palette: {
        bg: '#07070f', bg2: '#0a0a15', surface: '#11111f', surface2: '#171729', surface3: '#212138',
        border: '#1a1a2d', border2: '#2a2a44', text: '#efeffa', muted: '#9a9ab8', faint: '#62627f',
      },
      wallpaper: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(155,140,255,.16), transparent 70%)',
    },
  };

  // which theme "Auto" uses on a given date
  function seasonal(d) {
    d = d || new Date();
    const m = d.getMonth();
    if (m === 11) return 'winter';             // December: Christmas
    if (m === 0 || m === 1) return 'frost';    // Jan-Feb
    if (m >= 2 && m <= 4) return 'sakura';     // Mar-May
    if (m >= 5 && m <= 7) return 'summer';     // Jun-Aug
    if (m === 9) return 'spooky';              // October
    if (m === 10) return 'autumn';             // November: Thanksgiving
    return 'lychee';                           // September
  }

  function resolve(id, d) {
    const key = id === 'auto' ? seasonal(d) : (THEMES[id] ? id : 'lychee');
    return Object.assign({ id: key, auto: id === 'auto' }, THEMES[key]);
  }

  function list() {
    return Object.keys(THEMES).map((id) => ({
      id, name: THEMES[id].name, blurb: THEMES[id].blurb, accent: THEMES[id].accent,
      bg: THEMES[id].palette.bg, wallpaper: THEMES[id].wallpaper, effect: THEMES[id].effect,
    }));
  }

  // page side: put a theme's palette onto CSS variables
  function applyPalette(theme, el) {
    el = el || document.documentElement;
    for (const k of Object.keys(theme.palette)) el.style.setProperty('--' + k, theme.palette[k]);
  }

  const api = { THEMES, BASE, seasonal, resolve, list, applyPalette };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LycheeThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
