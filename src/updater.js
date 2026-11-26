'use strict';
// Lychee updates, all from GitHub Releases (free).
//   installer (Windows NSIS): electron-updater downloads in the background, installs on restart
//   portable  (Windows zip):  download the new zip, swap the files in after Lychee closes (Profile kept)
//   notify    (macOS):        unsigned Mac apps can't self-install, so we say "new version" + link
//   dev       (npm start):    off
const { app, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const pkg = require('../package.json');
const PUB = (pkg.build && pkg.build.publish && pkg.build.publish[0]) || {};
const RELEASES = `https://github.com/${PUB.owner}/${PUB.repo}/releases/latest`;
const API = `https://api.github.com/repos/${PUB.owner}/${PUB.repo}/releases/latest`;
const PORTABLE_ASSET = 'Lychee-Portable-win.zip';
const EVERY = 6 * 3600e3;

function newer(a, b) { // is version a newer than b?
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

class Updater {
  constructor({ portable, exeDir, onChange }) {
    this.exeDir = exeDir;
    this.onChange = onChange;
    this.mode = !app.isPackaged ? 'dev' : process.platform === 'darwin' ? 'notify' : portable ? 'portable' : 'installer';
    this.state = { mode: this.mode, status: 'idle', current: app.getVersion(), latest: null, progress: 0, error: null, url: RELEASES };
    this.timer = null;
    this.staged = null;
    if (this.mode === 'installer') this.setupElectronUpdater();
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.onChange({ ...this.state });
  }

  start(enabled) {
    clearInterval(this.timer);
    if (this.mode === 'dev' || !enabled) return;
    setTimeout(() => this.check(), 15e3); // let startup finish first
    this.timer = setInterval(() => this.check(), EVERY);
  }

  // ---------------------------------------------------------------- installer
  setupElectronUpdater() {
    const { autoUpdater } = require('electron-updater');
    this.au = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
    autoUpdater.on('update-not-available', () => this.set({ status: 'current' }));
    autoUpdater.on('update-available', (i) => this.set({ status: 'downloading', latest: i.version, progress: 0 }));
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', progress: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (i) => this.set({ status: 'ready', latest: i.version, progress: 100 }));
    autoUpdater.on('error', (e) => this.set({ status: 'error', error: String(e && e.message || e).slice(0, 200) }));
  }

  async check() {
    if (this.mode === 'dev') { this.set({ status: 'dev' }); return this.state; }
    if (['checking', 'downloading', 'ready'].includes(this.state.status)) return this.state;
    if (this.mode === 'installer') {
      try { await this.au.checkForUpdates(); } catch (e) { this.set({ status: 'error', error: String(e.message || e).slice(0, 200) }); }
      return this.state;
    }
    this.set({ status: 'checking', error: null });
    try {
      const res = await fetch(API, { headers: { 'User-Agent': 'Lychee-Updater', Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`GitHub said ${res.status}`);
      const rel = await res.json();
      const latest = String(rel.tag_name || '').replace(/^v/, '');
      if (!latest || !newer(latest, app.getVersion())) { this.set({ status: 'current', latest }); return this.state; }
      if (this.mode === 'notify') { this.set({ status: 'available', latest, url: rel.html_url || RELEASES }); return this.state; }
      const asset = (rel.assets || []).find((a) => a.name === PORTABLE_ASSET);
      if (!asset) { this.set({ status: 'available', latest, url: rel.html_url || RELEASES }); return this.state; }
      await this.downloadPortable(asset.browser_download_url, latest);
    } catch (e) {
      this.set({ status: 'error', error: String(e.message || e).slice(0, 200) });
    }
    return this.state;
  }

  // ---------------------------------------------------------------- portable
  async downloadPortable(url, version) {
    this.set({ status: 'downloading', latest: version, progress: 0 });
    const work = path.join(os.tmpdir(), `lychee-update-${version}`);
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const zip = path.join(work, 'update.zip');
    const res = await fetch(url, { headers: { 'User-Agent': 'Lychee-Updater' } });
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
    const total = +res.headers.get('content-length') || 0;
    const out = fs.createWriteStream(zip);
    let got = 0, lastPct = -1;
    for await (const chunk of res.body) {
      out.write(chunk);
      got += chunk.length;
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; this.set({ progress: pct }); }
    }
    await new Promise((r) => out.end(r));
    const dir = path.join(work, 'files');
    await new Promise((resolve, reject) => execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`],
      { windowsHide: true }, (err) => (err ? reject(err) : resolve())));
    // the zip may or may not wrap everything in one folder
    let root = dir;
    if (!fs.existsSync(path.join(root, 'Lychee.exe'))) {
      const sub = fs.readdirSync(dir).map((d) => path.join(dir, d)).find((d) => fs.existsSync(path.join(d, 'Lychee.exe')));
      if (!sub) throw new Error('update zip has no Lychee.exe');
      root = sub;
    }
    this.staged = { root, work };
    this.set({ status: 'ready', progress: 100 });
  }

  // swap files after we exit, then start the new version. The Profile folder is never touched.
  applyPortable(relaunch = true) {
    const s = this.staged;
    if (!s) return false;
    this.staged = null;
    const script = path.join(s.work, 'apply.cmd');
    const q = (p) => `"${p}"`;
    fs.writeFileSync(script, [
      '@echo off',
      ':wait',
      `tasklist /FI "PID eq ${process.pid}" | find "${process.pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)`,
      `robocopy ${q(s.root)} ${q(this.exeDir)} /E /R:3 /W:1 /XD Profile /NFL /NDL /NJH /NJS /NP >nul`,
      relaunch ? `start "" ${q(path.join(this.exeDir, 'Lychee.exe'))}` : 'rem (no relaunch: applied on quit)',
      `rmdir /s /q ${q(s.work)}`,
    ].join('\r\n'));
    spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  }

  // quitting normally with a downloaded portable update: swap it in, but don't relaunch
  applyOnQuit() {
    if (this.mode === 'portable' && this.state.status === 'ready') this.applyPortable(false);
  }

  // the "Restart to update" / "Download" button
  install() {
    if (this.state.status === 'available') { shell.openExternal(this.state.url || RELEASES); return true; }
    if (this.state.status !== 'ready') return false;
    if (this.mode === 'installer') { setImmediate(() => this.au.quitAndInstall(true, true)); return true; }
    if (this.mode === 'portable' && this.applyPortable()) { setImmediate(() => app.quit()); return true; }
    return false;
  }
}

module.exports = { Updater, newer, RELEASES };
