# MikroCanvas

**Local-first visual canvas for fast ad hoc thinking.**

![MikroCanvas product view](./mikrocanvas.png)

MikroCanvas is a lightweight local-first visual canvas for fast ad hoc thinking. It keeps boards in browser storage by default, exports portable JSON/SVG/PNG files, and can also run with optional API-backed board snapshots.

_Use MikroCanvas online for free at [canvas.mikrosuite.com](https://canvas.mikrosuite.com). It runs over HTTPS, needs no account, and is local-first by default. Optional published snapshots can be opened by ID when API-backed sharing is enabled._

## Why MikroCanvas

- **Own the board**: boards live in the browser until you export JSON, SVG, or PNG files.
- **Think quickly**: sticky notes, shapes, arrows, text, drawing, and comments stay on one focused canvas.
- **Deploy simply**: run as static HTML/CSS/JavaScript or enable the small snapshot API.
- **Stay portable**: exported board files can move between MikroCanvas installs.

## Features

- **Local-first boards** stored in browser IndexedDB
- **Infinite canvas** with pan, zoom, dotted grid, and keyboard shortcuts
- **Quick creation tools** for sticky notes, text, reusable shapes, arrows, freehand drawing, and comment pins
- **Direct manipulation** with selection, drag, resize, multi-select, lock/unlock, duplicate, delete, bring-forward, and send-backward
- **Inline editing** for text, sticky notes, shapes, arrows, and comments
- **Style controls** for fill, stroke, text color, font size, line routing, and arrow heads
- **Board library** with create, rename, duplicate, delete, import, and export
- **Undo and redo** for board edits
- **SVG and PNG export**
- **Static deployment** for local-first hosting, plus optional API-backed board snapshots

## Quick Start

Open [canvas.mikrosuite.com](https://canvas.mikrosuite.com) to use MikroCanvas immediately, securely, and without an account.

### Download the App

```bash
curl -sSL -o mikrocanvas.zip https://releases.mikrosuite.com/mikrocanvas_latest.zip
unzip mikrocanvas.zip -d mikrocanvas
```

Serve the extracted files with any static web server for local-first boards. For a quick local check:

```bash
cd mikrocanvas/*
npx http-server . -a 127.0.0.1 -p 8000 -c-1
```

Open `http://127.0.0.1:8000`.

## Runtime Configuration

MikroCanvas defaults to local mode through `config.json`:

```json
{
  "mode": "local",
  "apiBaseUrl": ".",
  "boardSnapshots": {
    "enabled": false
  }
}
```

Run `npm start` from source to serve the built app with the optional API snapshot store. In API mode, boards still autosave locally in IndexedDB. Use the link button in the top bar, or Cmd/Ctrl+K -> "Publish snapshot link", to upload the current board snapshot to SQLite and copy a `?board=<id>` URL.

Opening a snapshot URL loads that published board into local storage. Further edits stay local until the user publishes another snapshot.

There is no account or auth gate in this mode. Treat published board IDs as bearer links, and configure an admin token if operators need recovery deletion for remote snapshots.

## Release Downloads

Latest release download:

- `https://releases.mikrosuite.com/mikrocanvas_latest.zip`

GitHub Releases provide versioned archives for pinned deployments.

## Technology

- **Frontend**: Vanilla HTML, CSS, and TypeScript compiled with esbuild
- **Storage**: IndexedDB for browser-local boards, optional SQLite for published board snapshots
- **Build**: Prebuilt static release archive

## License

MIT. See [LICENSE](./LICENSE).
