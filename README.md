# harussh

Modern personal SSH client.

![harussh, a modern personal SSH client](docs/screenshot.jpg)

## Installation

Requires [Node.js](https://nodejs.org/) 22 or newer.

Build the installer for your system:

```bash
npm run dist:mac    # macOS   → release/harussh-*.dmg
npm run dist:win    # Windows → release/harussh-Setup-*.exe
npm run dist:linux  # Linux   → release/harussh-*.AppImage, .deb
```

Open the file from `release/` and install it like any other app.

To run it without installing:

```bash
npm run dev
```

## Updates

Installed apps check [GitHub Releases](https://github.com/Sturm/harussh/releases) on start and every 6 hours (Settings → Updates).
On Windows (installer) and Linux (AppImage) the update downloads in the background and installs on restart.
On macOS, the portable `.exe` and the `.deb`, the app shows that a new version is out and links to its download page —
macOS only installs updates by itself for code-signed apps.

## Releasing

The version lives in `package.json` and is tagged in git as `vX.Y.Z`:

```bash
npm version patch   # or minor / major — bumps package.json, commits and tags
```

```bash
git push --follow-tags
```

Pushing the tag runs the Release workflow: it builds macOS, Windows and Linux, uploads them to a GitHub release and publishes it.
