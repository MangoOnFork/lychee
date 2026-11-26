# Lychee

A dark, themeable Chromium browser for Windows and Mac, built on Electron.

**Download:** https://browserlychee.com/

- Live seasonal themes and effects (snow, leaves, petals, fireflies, stars, bats)
- Lychee Search (a modded DuckDuckGo), YouTube theme + Ambient Light + ad skipping
- Ad and tracker blocking, Secure DNS, HTTPS-only, private and Tor tabs
- Panic key, window disguise, portable mode, auto-updates

## Run from source

```
npm install
node node_modules/electron/install.js   # only if npm skipped Electron's download
npm start
```

`npm run selftest` (or `electron . --selftest`) runs the built-in checks. Close any open Lychee window first.

## Releasing

```
npm version patch
git push --follow-tags
```

GitHub Actions builds Windows (installer + portable zip) and Mac (universal dmg + zip) and publishes them to Releases. Installed copies update themselves from there. The website in `site/` deploys to GitHub Pages on every push to `main`.

Builds are unsigned, so Windows shows "More info > Run anyway" and macOS needs "Open Anyway" in Privacy & Security on first launch.

## Credits

Chromium via Electron · Lychee Search results by DuckDuckGo · Ghostery adblocker engine with EasyList/EasyPrivacy · Google Sans Flex / Google Sans Code (SIL OFL) · Tor by the Tor Project.
