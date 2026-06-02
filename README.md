# MikroCanvas

**Local-first visual canvas for fast ad hoc thinking.**

![MikroCanvas product view](./mikrocanvas.png)

MikroCanvas is a lightweight local-first visual canvas for fast ad hoc thinking. It keeps boards in browser storage by default, exports portable JSON/SVG/PNG files, and can also run with optional open-by-ID online board storage.

_Use MikroCanvas online for free at [canvas.mikrosuite.com](https://canvas.mikrosuite.com). It runs directly in the browser over HTTPS, needs no account, and stores boards privately in browser storage for that site unless you export them._

## Why MikroCanvas

- **Own the board**: boards live in the browser until you export JSON, SVG, or PNG files.
- **Think quickly**: sticky notes, shapes, arrows, text, drawing, and comments stay on one focused canvas.
- **Deploy simply**: run as static HTML/CSS/JavaScript or enable the small open-board API.
- **Stay portable**: exported board files can move between MikroCanvas installs.

## Features

- **Local-first boards** stored in browser IndexedDB
- **Infinite canvas** with pan, zoom, dotted grid, and keyboard shortcuts
- **FigJam-like creation tools** for sticky notes, text, shapes, arrows, freehand drawing, and comment pins
- **Direct manipulation** with selection, drag, resize, multi-select, duplicate, delete, bring-forward, and send-backward
- **Inline editing** for text, sticky notes, shapes, arrows, and comments
- **Style controls** for fill, stroke, text color, and font size
- **Board library** with create, rename, duplicate, delete, import, and export
- **Undo and redo** for board edits
- **SVG and PNG export**
- **Static deployment** for local-first hosting, plus optional API-backed online boards

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
  "onlineBoards": {
    "enabled": false
  }
}
```

Run `npm start` from source to serve the built app with the optional API-backed board store. In API mode, boards are saved in SQLite and can be opened by URL with `?board=<board-id>`. There is no auth gate in this mode; the board ID is the access boundary.

## Release Downloads

Latest release download:

- `https://releases.mikrosuite.com/mikrocanvas_latest.zip`

GitHub Releases provide versioned archives for pinned deployments.

## Technology

- **Frontend**: Vanilla HTML, CSS, and TypeScript compiled with esbuild
- **Storage**: IndexedDB for browser-local boards, optional SQLite for open-by-ID online boards
- **Build**: Prebuilt static release archive

## License

MIT. See [LICENSE](./LICENSE).
