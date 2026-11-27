// Tiny stroke icon set (24x24, currentColor). icon('home') -> SVG string.
(function () {
  const P = {
    camera: '<path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7"/><path d="M12 16.5v4"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    left: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    reload: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V9H15"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    shield: '<path d="M12 21.5s7.5-3.4 7.5-9.6V5.6L12 2.8 4.5 5.6v6.3c0 6.2 7.5 9.6 7.5 9.6z"/>',
    shieldCheck: '<path d="M12 21.5s7.5-3.4 7.5-9.6V5.6L12 2.8 4.5 5.6v6.3c0 6.2 7.5 9.6 7.5 9.6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    shieldOff: '<path d="M12 21.5s7.5-3.4 7.5-9.6V5.6L12 2.8 4.5 5.6v6.3c0 6.2 7.5 9.6 7.5 9.6z"/><path d="M4 4l16 16"/>',
    download: '<path d="M12 3.5v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20.5h14"/>',
    sliders: '<path d="M4 6h9"/><path d="M19 6h1"/><circle cx="16" cy="6" r="2.4"/><path d="M4 12h2"/><path d="M12 12h8"/><circle cx="9" cy="12" r="2.4"/><path d="M4 18h11"/><circle cx="18" cy="18" r="2.4"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/><path d="M12 7.5V12l3 2"/>',
    bookmark: '<path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.5 3.5 5.3 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.3-3.5-8.5s1-6 3.5-8.5z"/>',
    warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5"/><path d="M12 17.3v.2"/>',
    volume: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="m21 9.5-5 5"/><path d="m16 9.5 5 5"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M4 6.5h16"/><path d="M9 6.5V4h6v2.5"/><path d="M6.5 6.5l1 14h9l1-14"/>',
    folder: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5h5"/>',
    pause: '<path d="M8.5 5v14"/><path d="M15.5 5v14"/>',
    play: '<path d="M7 4.5 19 12 7 19.5z"/>',
    edit: '<path d="M4 20h4.5L19.5 9 15 4.5 4 15.5z"/><path d="m13 6.5 4.5 4.5"/>',
    file: '<path d="M14 3.5H6.5v17h11V7z"/><path d="M14 3.5V7h3.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    zap: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"/>',
    sparkle: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-1 1.4-2.1-.6-1.3.3-2.4 1.6-2.4h1.8a3.7 3.7 0 0 0 3.7-3.7C20.5 7.3 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>',
    network: '<rect x="9" y="3" width="6" height="5" rx="1.2"/><rect x="3" y="16" width="6" height="5" rx="1.2"/><rect x="15" y="16" width="6" height="5" rx="1.2"/><path d="M12 8v4"/><path d="M6 16v-4h12v4"/>',
    power: '<path d="M12 3v8"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.8v.2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.4-2.4 3.7"/><path d="M6.6 6.6C4.5 8 3.1 10.1 2.5 12c1 2.5 4.5 7 9.5 7 1.9 0 3.6-.6 5-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    onion: '<path d="M12 3c-1 2.5-6.5 5-6.5 10.5a6.5 6.5 0 0 0 13 0C18.5 8 13 5.5 12 3z"/><path d="M12 8c-.8 2-3.5 3.3-3.5 6.2a3.5 3.5 0 0 0 7 0C15.5 11.3 12.8 10 12 8z"/>',
    siren: '<path d="M6.5 18v-5.5a5.5 5.5 0 0 1 11 0V18"/><path d="M4 18h16v3H4z"/><path d="M12 2.5v2"/><path d="M4.5 5.5l1.4 1.4"/><path d="M19.5 5.5l-1.4 1.4"/>',
    mask: '<path d="M3 7.5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v3.5c0 4-3 7-6 7-1.5 0-2.3-1-3-2-.7 1-1.5 2-3 2-3 0-6-3-6-7z"/><path d="M7 11.5h2.5"/><path d="M14.5 11.5H17"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  };
  const LOGO = '<svg viewBox="0 0 32 32" class="logo-mark" aria-hidden="true">' +
    '<circle cx="16" cy="18" r="11" fill="var(--accent)"/>' +
    '<g fill="rgba(0,0,0,.22)"><circle cx="11.5" cy="15" r="1.4"/><circle cx="16.5" cy="13" r="1.4"/><circle cx="21" cy="16" r="1.4"/>' +
    '<circle cx="13" cy="20" r="1.4"/><circle cx="18.5" cy="21" r="1.4"/><circle cx="22" cy="21.5" r="1"/><circle cx="9.5" cy="20" r="1"/><circle cx="15.5" cy="25" r="1.2"/></g>' +
    '<circle cx="12" cy="13.5" r="2.6" fill="rgba(255,255,255,.28)"/>' +
    '<path d="M16 7.5c.3-3 2.4-4.8 6-4.8-.2 3.3-2.4 5-6 4.8z" fill="#6fcf72"/></svg>';
  window.icon = function (name, cls) {
    return `<svg viewBox="0 0 24 24" class="icon${cls ? ' ' + cls : ''}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  };
  window.logoMark = () => LOGO;
  // fill any <i data-icon="name"> placeholders
  window.fillIcons = function (root) {
    (root || document).querySelectorAll('i[data-icon]').forEach((el) => {
      el.outerHTML = window.icon(el.dataset.icon, el.className);
    });
  };
})();
