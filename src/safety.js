'use strict';
// Safety helpers: window disguises, user-agent presets, and a small Tor process manager.
const { app, nativeImage, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---------------------------------------------------------------- window disguise
// Changes the window title + taskbar icon so Lychee looks like something boring in the taskbar / Alt+Tab.
const DISGUISES = {
  none: { name: 'None' },
  classroom: { name: 'Google Classroom', title: 'Classes', icon: 'https://ssl.gstatic.com/classroom/ic_product_classroom_144.png' },
  docs: { name: 'Google Docs', title: 'Untitled document - Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon-2023q4.ico' },
  drive: { name: 'Google Drive', title: 'My Drive - Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png' },
  canvas: { name: 'Canvas', title: 'Dashboard', icon: 'https://www.instructure.com/favicon.ico' },
  khan: { name: 'Khan Academy', title: 'Khan Academy', icon: 'https://www.khanacademy.org/favicon.ico' },
  wikipedia: { name: 'Wikipedia', title: 'Wikipedia, the free encyclopedia', icon: 'https://en.wikipedia.org/static/favicon/wikipedia.ico' },
  coursera: { name: 'Coursera', title: 'Dashboard | Coursera', icon: 'https://www.coursera.org/favicon.ico' },
  notion: { name: 'Notion', title: 'Notion', icon: 'https://www.notion.so/images/favicon.ico' },
};

async function disguiseIcon(key) {
  const d = DISGUISES[key];
  if (!d || !d.icon) return null;
  const dir = path.join(app.getPath('userData'), 'disguise');
  fs.mkdirSync(dir, { recursive: true });
  for (const ext of ['png', 'ico']) {
    const p = path.join(dir, `${key}.${ext}`);
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  try {
    const res = await net.fetch(d.icon);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const isPng = buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
    const isIco = buf.length > 4 && buf.readUInt32LE(0) === 0x00010000;
    if (!isPng && !isIco) return null;
    const p = path.join(dir, `${key}.${isPng ? 'png' : 'ico'}`);
    fs.writeFileSync(p, buf);
    const img = nativeImage.createFromPath(p);
    return img.isEmpty() ? null : img;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- user agents
function uaPresets(baseUA) {
  const major = String(process.versions.chrome).split('.')[0];
  // real Chrome reports a reduced version (156.0.0.0); Electron's exact build number is a fingerprint
  const chrome = baseUA.replace(/Chrome\/(\d+)\.[\d.]+/, 'Chrome/$1.0.0.0');
  return {
    default: { name: 'Chrome on Windows', ua: chrome },
    edge: { name: 'Edge on Windows', ua: `${chrome} Edg/${major}.0.0.0` },
    firefox: { name: 'Firefox on Windows', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0' },
    safari: { name: 'Safari on Mac', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15' },
    android: { name: 'Chrome on Android', ua: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36` },
    iphone: { name: 'Safari on iPhone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' },
  };
}

// ---------------------------------------------------------------- Tor
class Tor {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = 'off'; // off | starting | ready | error | missing
    this.progress = 0;
    this.message = '';
    this.port = 9350;
    this.proc = null;
    this.waiters = [];
  }

  candidates() {
    const home = app.getPath('home');
    const roots = [
      path.join(app.getPath('userData'), 'tor'),
      path.join(__dirname, '..', 'tor'),
      path.join(home, 'Desktop', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor'),
      path.join(home, 'OneDrive', 'Desktop', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor'),
      path.join(process.env.LOCALAPPDATA || '', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor'),
      path.join(home, 'Downloads', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor'),
      'C:\\Program Files\\Tor Browser\\Browser\\TorBrowser\\Tor',
    ];
    const out = [];
    if (process.platform === 'darwin') {
      // Mac: Tor Browser.app bundles tor; or an expert bundle dropped into the profile
      out.push('/Applications/Tor Browser.app/Contents/MacOS/Tor/tor',
        path.join(home, 'Applications', 'Tor Browser.app', 'Contents', 'MacOS', 'Tor', 'tor'),
        path.join(app.getPath('userData'), 'tor', 'tor'),
        path.join(app.getPath('userData'), 'tor', 'tor', 'tor'),
        '/opt/homebrew/bin/tor', '/usr/local/bin/tor');
      return out;
    }
    for (const r of roots) out.push(path.join(r, 'tor.exe'), path.join(r, 'tor', 'tor.exe'));
    return out;
  }

  find() { return this.candidates().find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null; }

  status() {
    return { state: this.state, progress: this.progress, message: this.message, exe: this.find(), port: this.port };
  }

  set(state, extra = {}) {
    this.state = state;
    Object.assign(this, extra);
    if (state === 'ready' || state === 'error' || state === 'missing') {
      const w = this.waiters; this.waiters = [];
      for (const fn of w) fn(state === 'ready');
    }
    this.onChange(this.status());
  }

  // resolves true once Tor is bootstrapped, false if it can't start
  start() {
    if (this.state === 'ready') return Promise.resolve(true);
    const p = new Promise((r) => this.waiters.push(r));
    if (this.state === 'starting') return p;
    const exe = this.find();
    if (!exe) { this.set('missing', { message: 'tor.exe not found' }); return p; }
    const data = path.join(app.getPath('userData'), 'tor-data');
    fs.mkdirSync(data, { recursive: true });
    this.set('starting', { progress: 0, message: 'Starting Tor' });
    const proc = spawn(exe, [
      '--SocksPort', `127.0.0.1:${this.port}`,
      '--DataDirectory', data,
      '--ClientOnly', '1',
      '--Log', 'notice stdout',
    ], { cwd: path.dirname(exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        const m = /Bootstrapped (\d+)%[^:]*: (.*)$/.exec(line);
        if (m) {
          const pct = +m[1];
          if (pct >= 100) this.set('ready', { progress: 100, message: 'Connected to Tor' });
          else this.set('starting', { progress: pct, message: m[2].trim() });
        } else if (/\[err\]|Could not bind|Address already in use/i.test(line)) {
          this.message = line.replace(/^.*\[(err|warn)\]\s*/, '');
        }
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (e) => this.set('error', { message: e.message }));
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.state !== 'off') this.set('error', { message: this.message || `Tor exited (${code})` });
    });
    return p;
  }

  stop() {
    const p = this.proc;
    this.proc = null;
    if (p) { try { p.kill(); } catch {} }
    if (this.state !== 'missing') this.set('off', { progress: 0, message: '' });
  }
}

// hosts that should never be force-upgraded to HTTPS (LAN, localhost, single-label names)
function isLocalHost(host) {
  if (!host) return true;
  host = host.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.test') || host === '::1') return true;
  if (!host.includes('.')) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (m) {
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  return false;
}

module.exports = { DISGUISES, disguiseIcon, uaPresets, Tor, isLocalHost };
