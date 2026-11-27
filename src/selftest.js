'use strict';
// node_modules\electron\dist\electron.exe . --selftest [--shots=DIR]
// Opens every internal page plus a real site, checks for errors, optionally saves screenshots, then quits.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

module.exports = async function selftest(ctx) {
  const out = { pages: [], checks: [] };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitLoad = (wc, ms = 15000) => new Promise((r) => {
    if (!wc.isLoading()) return r();
    const tm = setTimeout(r, ms);
    wc.once('did-stop-loading', () => { clearTimeout(tm); r(); });
  });
  // screenshots of a hidden, throttled window can hang forever: give up after 8 seconds
  const shot = (name) => Promise.race([shotInner(name), new Promise((_, no) => setTimeout(() => no(new Error('timed out')), 8000))])
    .catch((e) => console.log(`[shot ${name} skipped] ${e.message}`));
  const shotInner = async (name) => {
    if (!ctx.SHOTS_DIR) return;
    fs.mkdirSync(ctx.SHOTS_DIR, { recursive: true });
    const ui = await ctx.ui().capturePage();
    fs.writeFileSync(path.join(ctx.SHOTS_DIR, `${name}-ui.png`), ui.toPNG());
    const t = [...ctx.tabs.values()].find((x) => x.view.getVisible());
    if (t) fs.writeFileSync(path.join(ctx.SHOTS_DIR, `${name}-page.png`), (await t.wc.capturePage()).toPNG());
  };
  // watchdog: a step that never returns (a page that hangs) ends the run instead of freezing it
  let lastStep = { at: Date.now(), name: 'start' };
  setInterval(() => { if (Date.now() - lastStep.at > 90000) { console.log('SELFTEST STALLED after: ' + lastStep.name); app.exit(3); } }, 5000).unref();
  const check = (name, ok, info) => { lastStep = { at: Date.now(), name }; out.checks.push({ name, ok: !!ok, info }); console.log(`CHECK ${ok ? 'ok  ' : 'FAIL'} ${name}` + (ok ? '' : '  ' + JSON.stringify(info))); };

  try {
    const win = ctx.win();
    win.setBounds({ width: 1360, height: 860 });
    // the test window must not react to whoever is using the computer meanwhile
    win.setIgnoreMouseEvents(true);
    win.setFocusable(false);
    win.showInactive();
    await wait(2500);

    for (const page of ['home', 'history', 'bookmarks', 'downloads', 'settings']) {
      const t = ctx.createTab(`lychee://${page}/`);
      await waitLoad(t.wc);
      await wait(700);
      const info = await t.wc.executeJavaScript(
        '({ title: document.title, api: typeof window.lychee, text: document.body.innerText.length, errs: window.__errs || [] })');
      out.pages.push({ page, ...info });
      check(`${page} loads with API and no errors`, info.api === 'object' && info.text > 10 && !info.errs.length, info.errs);
      await shot(page);
    }

    const ex = ctx.createTab('https://example.com/');
    await waitLoad(ex.wc);
    await wait(500);
    const exInfo = await ex.wc.executeJavaScript('({ title: document.title, api: typeof window.lychee, ua: navigator.userAgent })');
    check('example.com loads', exInfo.title.includes('Example'), exInfo.title);
    check('websites get no lychee API', exInfo.api === 'undefined', exInfo.api);
    check('UA has no Electron', !/Electron|lychee/i.test(exInfo.ua), exInfo.ua);
    await shot('example');

    const bad = ctx.createTab('https://no-such-host-lychee-test.invalid/');
    await waitLoad(bad.wc);
    await wait(1500);
    await waitLoad(bad.wc);
    check('bad host shows error page', bad.wc.getURL().startsWith('lychee://error'), bad.wc.getURL());
    await shot('error');

    const tabCount = await ctx.ui().executeJavaScript('document.querySelectorAll(".tab").length');
    check('tab strip matches tab count', tabCount === ctx.order.length, `${tabCount} vs ${ctx.order.length}`);

    const r = ctx.resolveInput;
    const cases = [
      ['example.com', 'https://example.com'], ['localhost:3000', 'http://localhost:3000'],
      ['hello world', 'https://duckduckgo.com/?q=hello%20world'], ['192.168.1.1', 'http://192.168.1.1'],
      ['lychee://settings', 'lychee://settings'], ['javascript:alert(1)', 'https://duckduckgo.com/?q=javascript%3Aalert(1)'],
      ['what is 2+2?', 'https://duckduckgo.com/?q=what%20is%202%2B2%3F'], ['github.com/foo?x=1', 'https://github.com/foo?x=1'],
    ];
    for (const [i, want] of cases) check(`resolve "${i}"`, r(i) === want, r(i));
    check('autocomplete from history', ctx.autocomplete('exa') === 'example.com', ctx.autocomplete('exa'));

    // Secure DNS: strict mode has no fallback, so a page only loads if that DoH server answered.
    const hosts = ['https://example.org/', 'https://example.net/', 'https://www.iana.org/', 'https://www.wikipedia.org/'];
    const provs = Object.keys(ctx.DNS_PROVIDERS);
    ctx.setSetting('dnsStrict', true);
    for (let i = 0; i < provs.length; i++) {
      ctx.setSetting('dnsProvider', provs[i]);
      const t = ctx.createTab(hosts[i % hosts.length]);
      await waitLoad(t.wc, 20000);
      await wait(800);
      await waitLoad(t.wc, 5000);
      const u = t.wc.getURL();
      check(`strict DoH via ${provs[i]} loads ${hosts[i % hosts.length]}`, /^https:/.test(u), u);
    }
    ctx.setSetting('dnsCustom', 'https://127.0.0.1:9/dns-query');
    ctx.setSetting('dnsProvider', 'custom');
    const dead = ctx.createTab('https://www.mozilla.org/');
    await waitLoad(dead.wc, 25000);
    await wait(1500);
    await waitLoad(dead.wc, 5000);
    check('strict DoH with a dead server blocks lookups (no leak to system DNS)', dead.wc.getURL().startsWith('lychee://error'), dead.wc.getURL());
    ctx.setSetting('dnsStrict', false);
    ctx.setSetting('dnsProvider', 'cloudflare');
    const back = ctx.createTab('https://www.mozilla.org/');
    await waitLoad(back.wc, 20000);
    await wait(800);
    check('back on Cloudflare (automatic) the same site loads', /^https:/.test(back.wc.getURL()), back.wc.getURL());
    ctx.activate(back.id);

    // ---------------- safety
    const load = async (t, ms = 20000) => { await waitLoad(t.wc, ms); await wait(900); await waitLoad(t.wc, 5000); return t.wc.getURL(); };

    const up = ctx.createTab('http://example.com/');
    check('HTTPS-only upgrades http://example.com', (await load(up)).startsWith('https://example.com'), up.wc.getURL());

    const nossl = ctx.createTab('http://httpforever.com/');
    const nu = await load(nossl, 25000);
    check('HTTP-only site gets the HTTPS-only warning page', nu.startsWith('lychee://error/?code=https-only'), nu);
    if (nu.startsWith('lychee://error')) {
      await nossl.wc.executeJavaScript("window.lychee.call('allowHttp', 'http://httpforever.com/')");
      const after = await load(nossl, 20000);
      check('"Continue to HTTP" loads the site', after.startsWith('http://httpforever.com'), after);
    }

    const before = ctx.history().length;
    const priv = ctx.createTab('https://example.org/?private-test', { kind: 'private' });
    await load(priv);
    await priv.wc.executeJavaScript("document.cookie = 'lycheeprivate=1; path=/'");
    const { session } = require('electron');
    const leaked = await session.defaultSession.cookies.get({ url: 'https://example.org/' });
    check('private tab uses its own session', priv.wc.session !== session.defaultSession);
    check('private tab cookies stay out of normal tabs', !leaked.some((c) => c.name === 'lycheeprivate'), leaked.map((c) => c.name));
    check('private tab adds no history', !ctx.history().some((h) => h.url.includes('private-test')) && ctx.history().length === before, ctx.history().length - before);
    const privUi = await ctx.ui().executeJavaScript("[...document.querySelectorAll('.tab.kind-private')].length + ':' + document.getElementById('kind-badge').textContent");
    check('private tab is marked in the UI', privUi.startsWith('1:') && privUi.endsWith('Private'), privUi);
    await shot('private');
    ctx.closeTab(priv.id);

    const normalCount = ctx.order.length;
    ctx.togglePanic();
    await wait(2500);
    const p = ctx.panic();
    const shown = await ctx.ui().executeJavaScript("document.querySelectorAll('.tab').length");
    const mutedAll = [...ctx.tabs.values()].filter((t) => t.id !== (p && p.tabId)).every((t) => t.wc.isAudioMuted());
    check('panic opens the panic page and hides other tabs', !!p && shown === 1, `${shown} tab(s) shown`);
    check('panic mutes every other tab', mutedAll);
    await shot('panic');
    ctx.togglePanic();
    await wait(600);
    const shownAfter = await ctx.ui().executeJavaScript("document.querySelectorAll('.tab').length");
    check('panic key again restores everything', !ctx.panic() && ctx.order.length === normalCount && shownAfter === normalCount &&
      [...ctx.tabs.values()].every((t) => !t.wc.isAudioMuted()), `${shownAfter}/${normalCount}`);

    ctx.setSetting('uaPreset', 'firefox');
    const ff = ctx.createTab('https://example.com/?ua');
    await load(ff);
    const ffUa = await ff.wc.executeJavaScript('navigator.userAgent');
    check('user agent preset applies (Firefox)', /Firefox\//.test(ffUa), ffUa);
    ctx.setSetting('uaPreset', 'default');
    ff.wc.reload();
    await load(ff);
    const dUa = await ff.wc.executeJavaScript('navigator.userAgent');
    check('default UA looks like stock Chrome', /Chrome\/\d+\.0\.0\.0 Safari/.test(dUa) && !/Firefox|Electron/.test(dUa), dUa);

    // Google sign-in sees Firefox (Google blocks embedded Chromium), everything else sees Chrome
    const gs = ctx.createTab('https://accounts.google.com/ServiceLogin?hl=en');
    await load(gs, 20000);
    const gInfo = await gs.wc.executeJavaScript(`({ ua: navigator.userAgent, uad: typeof navigator.userAgentData, host: location.hostname,
      blocked: /may not be secure/i.test(document.body.innerText) })`);
    check('Google sign-in sees Firefox, no Chromium hints', gInfo.host === 'accounts.google.com' && /Firefox\//.test(gInfo.ua) && gInfo.uad === 'undefined' && !gInfo.blocked, gInfo);
    gs.wc.loadURL('https://example.com/?after-google');
    await load(gs);
    const gBack = await gs.wc.executeJavaScript('navigator.userAgent');
    check('leaving Google switches back to Chrome', /Chrome\//.test(gBack) && !/Firefox/.test(gBack), gBack);
    ctx.closeTab(gs.id);

    for (const k of Object.keys(ctx.safety.DISGUISES).filter((x) => x !== 'none')) {
      const img = await ctx.safety.disguiseIcon(k);
      check(`disguise icon loads: ${k}`, !!img && !img.isEmpty(), img ? img.getSize() : null);
    }
    ctx.setSetting('disguise', 'docs');
    await wait(1500);
    check('disguise changes the window title', ctx.win().getTitle() === ctx.safety.DISGUISES.docs.title, ctx.win().getTitle());
    ctx.setSetting('disguise', 'none');
    await wait(300);

    const tt = ctx.createTab('https://check.torproject.org/', { kind: 'tor' });
    await load(tt, 8000);
    const torText = await tt.wc.executeJavaScript('document.body.innerText');
    const hasTor = !!ctx.tor.find();
    check(hasTor ? 'Tor tab connects' : 'Tor tab explains Tor is not installed',
      hasTor ? /Congratulations/i.test(torText) : /isn't installed/.test(torText), torText.slice(0, 120));
    await shot('tor');
    ctx.closeTab(tt.id);

    // DuckDuckGo skin
    const ddg = ctx.createTab('https://duckduckgo.com/?q=lychee+fruit&ia=web');
    await load(ddg, 20000);
    await wait(2500);
    const skin = await ddg.wc.executeJavaScript(`(() => {
      const t = document.querySelector('a[data-testid="result-title-a"]');
      const logo = document.querySelector('a[data-testid="header-logo"]');
      const wrap = document.querySelector('.site-wrapper');
      const ask = [...document.querySelectorAll('a,button')].filter((x) => /chat|duck\\.ai|lychee ai/i.test((x.getAttribute('href') || '') + x.textContent) && x.offsetParent);
      const form = document.querySelector('#search_form');
      return {
        logoFits: !!logo && !!form && logo.getBoundingClientRect().right <= form.getBoundingClientRect().left + 2,
        logoImg: logo && getComputedStyle(logo, '::before').backgroundImage.slice(0, 30),
        docTitle: document.title,
        mentions: (document.body.innerText.match(/DuckDuckGo|Duck\\.ai/g) || []).length,
        visibleAi: ask.length,
        bg: getComputedStyle(document.body).backgroundColor,
        wrap: wrap ? getComputedStyle(wrap).backgroundColor : 'none',
        font: getComputedStyle(document.body).fontFamily,
        title: t && getComputedStyle(t).color,
        logo: logo && getComputedStyle(logo, '::after').content,
        fontLoaded: document.fonts.check('16px "Lychee Sans"'),
      };
    })()`);
    const hexRgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
    const thNow = ctx.Themes.resolve(ctx.settings().theme);
    check('DuckDuckGo gets the Lychee skin (theme colours)', skin.bg === hexRgb(thNow.palette.bg) && /rgba\(0, 0, 0, 0\)|none/.test(skin.wrap) && /Lychee Sans/.test(skin.font) &&
      skin.title === hexRgb(ctx.settings().accent) && /Lychee/.test(skin.logo || '') && skin.fontLoaded, skin);
    check('Lychee logo shows top-left, not covered by the search box', /url\("data:image\/png/.test(skin.logoImg || '') && skin.logoFits, skin);
    check('search page never says DuckDuckGo / Duck.ai', skin.mentions === 0 && /Lychee Search/.test(skin.docTitle) && !/DuckDuckGo/.test(skin.docTitle), `${skin.mentions} mentions, title "${skin.docTitle}"`);
    check('AI chat buttons are hidden', skin.visibleAi === 0, skin.visibleAi);
    const ddgState = await ctx.ui().executeJavaScript("document.getElementById('omni-input').value + ' | ' + document.querySelector('.tab.active .title').textContent");
    check('address bar shows the search terms, tab says Lychee Search', ddgState.startsWith('lychee fruit | ') && /Lychee Search/.test(ddgState), ddgState);
    await shot('ddg');

    // images: click one -> right-hand sidebar
    const imgs = ctx.createTab('https://duckduckgo.com/?q=lychee+fruit&ia=images&iax=images');
    await load(imgs, 20000);
    await wait(3000);
    await imgs.wc.executeJavaScript(`(() => { const a = document.querySelector('[data-testid="zci-images"] ol > li figure a, [data-testid="zci-images"] ol > li img'); (a.closest('a') || a).click(); })()`).catch(() => {});
    await wait(1200);
    await imgs.wc.executeJavaScript('window.scrollBy(0, 400)');
    await wait(800);
    const side = await imgs.wc.executeJavaScript(`(() => {
      const a = document.querySelector('[data-testid="zci-images"] ol > li > div > aside');
      if (!a) return null;
      a.getAnimations().forEach((x) => x.finish()); // background windows don't run animations
      window.dispatchEvent(new Event('scroll'));
      const r = a.getBoundingClientRect(); const s = document.querySelector('[data-testid="zci-images"] section').getBoundingClientRect();
      const hb = document.querySelector('#header_wrapper').getBoundingClientRect().bottom;
      return { pos: getComputedStyle(a).position, top: Math.round(r.top), headerBottom: Math.max(0, Math.round(hb)), right: Math.round(r.right), vw: innerWidth, w: Math.round(r.width), h: Math.round(r.height), vh: innerHeight, gridRight: Math.round(s.right) };
    })()`);
    check('clicking an image opens a right sidebar', !!side && side.pos === 'fixed' && Math.abs(side.right - side.vw) < 20 && side.h > side.vh * 0.6 && side.gridRight <= side.vw - side.w + 30, side);
    check('sidebar hugs the header while scrolling', !!side && Math.abs(side.top - side.headerBottom) <= 2, side && `${side.top} vs ${side.headerBottom}`);
    await shot('ddg-images');

    const ai = ctx.createTab('https://duck.ai/');
    const aiUrl = await load(ai, 10000);
    check('duck.ai is blocked for now', aiUrl.startsWith('lychee://error/?code=ai-off'), aiUrl);
    const chat = ctx.createTab('https://duckduckgo.com/?q=hello&ia=chat');
    const chatUrl = await load(chat, 10000);
    check('DuckDuckGo chat mode is blocked for now', chatUrl.startsWith('lychee://error/?code=ai-off'), chatUrl);
    ctx.closeTab(ai.id); ctx.closeTab(chat.id);

    ctx.setSetting('searchSkin', false);
    await wait(800);
    const off = await ddg.wc.executeJavaScript('getComputedStyle(document.body).backgroundColor');
    check('turning the skin off restores DuckDuckGo', off !== 'rgb(15, 10, 11)', off);
    ctx.setSetting('searchSkin', true);

    // ---------------- YouTube: theme, ambient light, ad cleanup
    const yt = ctx.createTab('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    await load(yt, 25000);
    await wait(6000);
    const ytInfo = await yt.wc.executeJavaScript(`(async () => {
      const app = document.querySelector('ytd-app');
      const cs = app ? getComputedStyle(app) : null;
      const amb = document.getElementById('lychee-ambient');
      const v = document.querySelector('#movie_player video');
      return {
        base: cs && cs.getPropertyValue('--yt-sys-color-baseline--base-background').trim(),
        cta: cs && cs.getPropertyValue('--yt-sys-color-baseline--call-to-action').trim(),
        ambient: !!amb, ambientW: amb ? Math.round(amb.getBoundingClientRect().width) : 0,
        htmlCls: document.documentElement.className, video: !!v, vw: v ? v.videoWidth : 0,
        // a covered window gets no animation frames, so nothing can be drawn (not a bug)
        framesRun: await new Promise((r) => { requestAnimationFrame(() => r(true)); setTimeout(() => r(false), 1500); }),
        adSlotsVisible: [...document.querySelectorAll('ytd-ad-slot-renderer, #player-ads')].filter((x) => x.offsetParent).length,
      };
    })()`);
    const thY = ctx.Themes.resolve(ctx.settings().theme);
    check('YouTube follows the Lychee theme', ytInfo.base === thY.palette.bg && ytInfo.cta === ctx.settings().accent, ytInfo);
    check('YouTube ad slots are hidden', ytInfo.adSlotsVisible === 0, ytInfo.adSlotsVisible);
    check(ytInfo.framesRun ? 'Ambient Light glows behind the player' : 'Ambient Light (skipped: test window was covered, no frames)',
      !ytInfo.framesRun || !ytInfo.video || !ytInfo.vw || (ytInfo.ambient && ytInfo.ambientW > 100 && /lychee-ambient/.test(ytInfo.htmlCls)), ytInfo);
    await shot('youtube');
    const ytQ = await yt.wc.executeJavaScript(`(() => { const p = document.getElementById('movie_player');
      return p && p.getAvailableQualityLevels ? { levels: p.getAvailableQualityLevels(), q: p.getPlaybackQuality() } : null; })()`).catch(() => null);
    check('YouTube plays in the sharpest quality available', !!ytQ && ytQ.levels.length > 0 && ytQ.q === ytQ.levels[0], ytQ);
    ctx.setSetting('ytAmbient', false);
    await wait(800);
    const ambOff = await yt.wc.executeJavaScript("!!document.getElementById('lychee-ambient')");
    // with no animation frames youtube.js never gets to tidy up, so this only counts when frames run
    check(ytInfo.framesRun ? 'Ambient Light turns off' : 'Ambient Light off (skipped: no frames)', !ytInfo.framesRun || !ambOff, ambOff);
    ctx.setSetting('ytAmbient', true);
    ctx.closeTab(yt.id);

    // ---------------- themes + effects
    check('Lychee is the default theme', ctx.settings().theme === 'lychee' && ctx.settings().accent === ctx.Themes.THEMES.lychee.accent, ctx.settings().theme);
    ctx.setSetting('theme', 'auto');
    await wait(500);
    const S = ctx.settings();
    const season = ctx.Themes.seasonal();
    check(`auto theme picks the season (${season})`, S.theme === 'auto' && ctx.Themes.resolve('auto').id === season && S.accent === ctx.Themes.THEMES[season].accent, `${S.accent}`);
    const home = ctx.createTab('lychee://home/');
    await load(home, 8000);
    await wait(1500);
    const homeFx = await home.wc.executeJavaScript(`({ wp: getComputedStyle(document.getElementById('wallpaper')).backgroundImage.slice(0, 40),
      fx: typeof pageFx !== 'undefined' && pageFx ? pageFx.count : -1, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      pill: document.getElementById('theme-name').textContent })`);
    check('home page shows the theme wallpaper + live effect', /gradient/.test(homeFx.wp) && homeFx.fx > 0 && homeFx.bg === ctx.Themes.THEMES[season].palette.bg, homeFx);
    const uiFx = await ctx.ui().executeJavaScript('({ n: fx.count, bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() })');
    check('browser frame runs the effect too', uiFx.n > 0 && uiFx.bg === ctx.Themes.THEMES[season].palette.bg, uiFx);
    await shot('theme-' + season);

    ctx.setSetting('theme', 'winter');
    await wait(1500);
    const xmas = await ctx.ui().executeJavaScript(`({ lights: !document.getElementById('lights').hidden && document.querySelectorAll('#lights i').length,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() })`);
    check('Christmas theme: lights, snow palette, red accent', xmas.lights > 5 && xmas.bg === '#0a0e13' && xmas.accent === '#ff4d5a', xmas);
    const winBg = ctx.win().getBackgroundColor().toLowerCase();
    check('window background follows the theme', winBg.includes('0a0e13'), winBg);
    ctx.activate(home.id);
    await wait(1500);
    await shot('theme-winter');

    ctx.setSetting('theme', 'blizzard');
    await wait(3500);
    const bliz = await home.wc.executeJavaScript(`(async () => { const v = document.querySelector('#wallpaper video');
      return { video: !!v, playing: !!v && !v.paused && v.readyState >= 2 && v.currentTime > 0, err: v && v.error && v.error.code,
        blur: v ? getComputedStyle(v).filter : '', fx: pageFx ? pageFx.count : -1,
        frames: await new Promise((r) => { requestAnimationFrame(() => r(true)); setTimeout(() => r(false), 1500); }) }; })()`);
    // a covered test window gets no frames, so the video can't advance: then only check it's there and blurred
    check(bliz.frames ? 'Blizzard theme: blurred video wallpaper plays + blizzard snow' : 'Blizzard theme: blurred video wallpaper + snow (playback skipped: no frames)',
      bliz.video && (bliz.playing || !bliz.frames) && /blur/.test(bliz.blur) && bliz.fx > 50, bliz);
    await shot('theme-blizzard');
    ctx.setSetting('theme', 'winter');
    await wait(800);
    const noVid = await home.wc.executeJavaScript(`!document.querySelector('#wallpaper video')`);
    check('leaving Blizzard removes the video', noVid, noVid);

    const ddg2 = ctx.createTab('https://duckduckgo.com/?q=christmas+cookies&ia=web');
    await load(ddg2, 20000);
    await wait(2000);
    const ddgFx = await ddg2.wc.executeJavaScript(`(() => { const c = document.getElementById('lychee-fx'); return c ? { pe: getComputedStyle(c).pointerEvents, bg: getComputedStyle(document.body).backgroundColor } : null; })()`);
    check('snow falls on Lychee Search too (and ignores clicks)', !!ddgFx && ddgFx.pe === 'none' && ddgFx.bg === 'rgb(10, 14, 19)', ddgFx);
    await shot('ddg-winter');

    ctx.setSetting('effects', false);
    await wait(600);
    const fxOff = await ctx.ui().executeJavaScript('({ running: fx.running, lights: !document.getElementById("lights").hidden })');
    check('turning effects off stops them', !fxOff.running && !fxOff.lights, fxOff);
    ctx.setSetting('effects', true);
    ctx.setSetting('theme', 'auto');
    await wait(400);
    check('back to auto restores the seasonal accent', ctx.settings().accent === ctx.Themes.THEMES[season].accent, ctx.settings().accent);
    ctx.setSetting('theme', 'lychee');
    await wait(400);
    check('back to Lychee restores pink', ctx.settings().accent === '#ff6b8b', ctx.settings().accent);
    ctx.closeTab(ddg2.id);

    const st = ctx.createTab('lychee://settings/#look');
    await waitLoad(st.wc);
    await wait(700);
    await waitLoad(st.wc);
    await wait(700);
    const wpRow = await st.wc.executeJavaScript(`(() => { const r = document.getElementById('wallpaper-mode').getBoundingClientRect(); const h = document.querySelector('#look h2').getBoundingClientRect(); return { rowTop: Math.round(r.top), headTop: Math.round(h.top), pos: getComputedStyle(document.getElementById('wallpaper-mode')).position }; })()`);
    check('wallpaper buttons sit in the Appearance card', wpRow.pos === 'static' && wpRow.rowTop > wpRow.headTop + 100, wpRow);
    await shot('settings-look');

    // ---------------- bad certificate: "Go anyway"
    const badCert = ctx.createTab('https://expired.badssl.com/');
    await waitLoad(badCert.wc, 20000);
    await wait(1500);
    const badCertPage = await badCert.wc.executeJavaScript(`({ url: location.href, unsafe: !document.getElementById('unsafe')?.hidden })`).catch(() => ({}));
    check('bad certificate shows the error page with "Go anyway"', /^lychee:\/\/error/.test(badCertPage.url || '') && badCertPage.unsafe, badCertPage);
    await badCert.wc.executeJavaScript(`document.getElementById('go-anyway').click()`).catch(() => {});
    await wait(800);
    await waitLoad(badCert.wc, 20000);
    await wait(800);
    check('"Go anyway" opens the site', /^https:\/\/expired\.badssl\.com/.test(badCert.wc.getURL()), badCert.wc.getURL());
    ctx.closeTab(badCert.id);

    // ---------------- background tabs hold autoplay until opened
    const vidHtml = path.join(app.getPath('temp'), 'lychee-autoplay-test.html');
    const vidSrc = require('url').pathToFileURL(path.join(__dirname, 'shared', 'wallpapers', 'blizzard.mp4')).toString();
    fs.writeFileSync(vidHtml, `<!doctype html><video id=v autoplay loop src="${vidSrc}" style="width:640px"></video>`);
    const prevActive = ctx.activeId();
    const bgTab = ctx.createTab(require('url').pathToFileURL(vidHtml).toString(), { activate: false });
    await waitLoad(bgTab.wc);
    await wait(2500);
    const held = await bgTab.wc.executeJavaScript(`({ paused: v.paused, t: v.currentTime, ready: v.readyState })`);
    check('background tab: video waits instead of playing', held.paused && held.ready >= 1, held);
    ctx.activate(bgTab.id);
    await wait(2000);
    const played = await bgTab.wc.executeJavaScript(`({ paused: v.paused, t: v.currentTime })`);
    check('opening the tab starts the video', !played.paused && played.t > 0 && !bgTab.wc.isAudioMuted(), { ...played, muted: bgTab.wc.isAudioMuted() });
    ctx.closeTab(bgTab.id);
    if (prevActive) ctx.activate(prevActive);

    // ---------------- hideable sidebar
    ctx.setSetting('railHidden', true);
    await wait(500);
    const railOff = { cls: await ctx.ui().executeJavaScript("document.body.classList.contains('rail-hidden')"), x: ctx.tabs.get(ctx.activeId()).view.getBounds().x };
    ctx.setSetting('railHidden', false);
    await wait(500);
    const railOn = { cls: await ctx.ui().executeJavaScript("document.body.classList.contains('rail-hidden')"), x: ctx.tabs.get(ctx.activeId()).view.getBounds().x };
    check('sidebar hides and comes back (page fills the space)', railOff.cls && railOff.x === 0 && !railOn.cls && railOn.x === 52, { railOff, railOn });

    // ---------------- permission card (instead of a system dialog)
    const W1 = ctx.curW();
    delete ctx.settings().sitePermissions['https://example.com|notifications']; // left over from an earlier run
    const pt = ctx.createTab('https://example.com/', { w: W1 });
    await waitLoad(pt.wc);
    await wait(500);
    pt.wc.executeJavaScript('window.__perm = Notification.requestPermission(); 1', true).catch(() => {});
    await wait(1500);
    const card = W1.prompt ? {
      visible: W1.prompt.view.getVisible(), bounds: W1.prompt.view.getBounds(), pending: ctx.prompts().length,
      text: await W1.prompt.view.webContents.executeJavaScript("document.getElementById('card').innerText").catch(() => ''),
    } : null;
    check('site asking for a permission shows the corner card', !!card && card.visible && card.pending === 1 && /example\.com/.test(card.text) &&
      /notifications/i.test(card.text) && card.bounds.y < 110 && card.bounds.x < 400, card);
    if (W1.prompt) await W1.prompt.view.webContents.executeJavaScript("document.querySelector('[data-choice=block]').click()").catch(() => {});
    await wait(600);
    const permResult = await pt.wc.executeJavaScript('window.__perm').catch((e) => 'err ' + e);
    const savedPerm = ctx.settings().sitePermissions['https://example.com|notifications'];
    check('"Never allow" answers the site and is remembered', permResult === 'denied' && savedPerm === false && !W1.prompt.view.getVisible(), { permResult, savedPerm });
    delete ctx.settings().sitePermissions['https://example.com|notifications'];

    // ---------------- windows: move a tab to another window, drag one out, close a window
    const W2 = ctx.newWindow('lychee://home/');
    await wait(1500);
    ctx.moveTabToWindow(pt.id, W2, 0);
    await wait(800);
    const w2Strip = await W2.ui.executeJavaScript("document.querySelectorAll('.tab').length").catch(() => -1);
    check('a tab moves to another window', pt.w === W2 && W2.order[0] === pt.id && !W1.order.includes(pt.id) &&
      W2.win.contentView.children.includes(pt.view) && !W1.win.contentView.children.includes(pt.view) && w2Strip === W2.order.length,
      { w2: W2.order, w1: W1.order.length, w2Strip });
    const before3 = ctx.wins().length;
    const W3 = ctx.detachTab(pt.id, { x: 300, y: 300 });
    await wait(1200);
    check('dragging a tab out makes a new window with just that tab', W3 && W3 !== W2 && ctx.wins().length === before3 + 1 && W3.order.length === 1 && pt.w === W3 && !W2.order.includes(pt.id),
      { wins: ctx.wins().length, w3: W3 && W3.order });
    W3.win.close();
    await wait(800);
    check('closing a window closes its tabs', !ctx.tabs.has(pt.id) && ctx.wins().length === before3, { wins: ctx.wins().length });
    W2.win.close();
    await wait(800);
    check('back to one window', ctx.wins().length === 1 && ctx.curW() === W1, ctx.wins().length);
  } catch (e) {
    check('selftest crashed', false, String(e && e.stack || e));
  }
  const failed = out.checks.filter((c) => !c.ok);
  console.log('SELFTEST ' + JSON.stringify(out, null, 1));
  console.log(failed.length ? `SELFTEST FAILED (${failed.length})` : 'SELFTEST PASSED');
  app.exit(failed.length ? 1 : 0);
};
