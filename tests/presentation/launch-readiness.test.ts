import { readFileSync } from "node:fs";

describe("launch readiness assets", () => {
  it("exposes package metadata and the docs build gate", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      bugs?: unknown;
      homepage?: string;
      repository?: unknown;
      scripts?: Record<string, string>;
      version?: string;
    };

    expect(packageJson.version).toBe("1.0.1");
    expect(packageJson.repository).toBeTruthy();
    expect(packageJson.bugs).toBeTruthy();
    expect(packageJson.homepage).toContain("mikrocanvas");
    expect(packageJson.scripts?.verify).toContain("docs:build");
    expect(packageJson.scripts?.start).toContain("dist/server/server.mjs");
    expect(packageJson.scripts?.["start:static"]).toContain("http-server");
    expect(packageJson.scripts?.["build:api"]).toContain("--target api");
  });

  it("declares local runtime defaults and the optional online-board API", () => {
    const runtimeConfig = JSON.parse(readFileSync("src/public/config.json", "utf8")) as {
      mode?: string;
      onlineBoards?: { enabled?: boolean };
    };
    const app = readFileSync("src/presentation/app.ts", "utf8");
    const server = readFileSync("api/src/http/AppServer.ts", "utf8");

    expect(runtimeConfig).toMatchObject({
      mode: "local",
      onlineBoards: { enabled: false },
    });
    expect(app).toContain("copyOnlineBoardLink");
    expect(app).toContain("getInitialOnlineBoardId");
    expect(app).toContain("renderPersistenceStatus");
    expect(server).toContain("/api/boards");
    expect(server).toContain("x-mikrocanvas-delete-token");
    expect(server).toContain("createPublicRuntimeConfig");
  });

  it("keeps the app shell wired for board, import, export, and drawing controls", () => {
    const html = readFileSync("src/ui/index.html", "utf8");
    const app = readFileSync("src/presentation/app.ts", "utf8");
    const appEventBindings = readFileSync("src/presentation/appEventBindings.ts", "utf8");
    const shapeSelectorView = readFileSync("src/presentation/shapeSelectorView.ts", "utf8");
    const shapeRegistry = readFileSync("src/shared/shapeRegistry.ts", "utf8");

    for (const id of [
      "board-title-input",
      "persistence-status",
      "new-board-btn",
      "library-btn",
      "import-btn",
      "export-json-btn",
      "export-image-btn",
      "canvas-stage",
      "canvas-svg",
      "inline-editor",
      "library-dialog",
      "command-dialog",
      "command-input",
      "command-list",
      "grid-toggle-btn",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }

    expect(app).toContain("new CommandPalette");
    expect(app).toContain("buildCanvasCommands");
    expect(app).toContain("openCommandPalette");
    expect(html).toContain('aria-label="History and zoom controls"');
    expect(html).toContain('aria-label="Command palette"');
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("#icon-grid");
    expect(html.indexOf('id="undo-btn"')).toBeGreaterThan(html.indexOf('class="zoom-cluster"'));
    expect(html.indexOf('id="redo-btn"')).toBeGreaterThan(html.indexOf('class="zoom-cluster"'));
    expect(html.indexOf('id="grid-toggle-btn"')).toBeGreaterThan(html.indexOf('id="redo-btn"'));

    for (const tool of ["select", "hand", "sticky", "text", "arrow", "draw", "comment"]) {
      expect(html).toContain(`data-tool="${tool}"`);
    }

    expect(html).toContain("data-shape-menu");
    expect(html).toContain("data-shape-options");
    expect(html).toContain("data-current-shape-icon");
    expect(appEventBindings).toContain("renderShapeMenuOptions");
    expect(shapeSelectorView).toContain("data-shape-tool");
    for (const shape of [
      "rectangle",
      "ellipse",
      "diamond",
      "triangle",
      "capsule",
      "document",
      "database",
      "parallelogram",
      "trapezoid",
      "hexagon",
      "octagon",
      "chevron",
    ]) {
      expect(shapeRegistry).toContain(`${shape}:`);
    }
    expect(html).not.toContain('class="tool-button" data-tool="rectangle"');
    expect(html).not.toContain('class="tool-button" data-tool="ellipse"');
    expect(html).not.toContain('class="tool-button" data-tool="diamond"');

    expect(app).toContain("confirmDeleteBoard");
    expect(app).toContain("deleteBoardFromLibrary");
    expect(app).toContain("window.confirm");
    expect(app).toContain("A new starter canvas will be created.");
    expect(app).toContain("viewportController.fitToContent({ allowZoomIn: false })");
  });

  it("declares installable public assets", () => {
    const manifest = JSON.parse(readFileSync("src/public/manifest.webmanifest", "utf8")) as {
      display?: string;
      icons?: Array<{ src?: string; type?: string }>;
      name?: string;
    };
    const icon = readFileSync("src/public/app-icon.svg", "utf8");

    expect(manifest.name).toBe("MikroCanvas");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons?.[0]).toMatchObject({
      src: "./app-icon.svg",
      type: "image/svg+xml",
    });
    expect(icon).toContain('aria-label="MikroCanvas"');
  });

  it("keeps compact viewport controls scrollable instead of overlapping", () => {
    const css = readFileSync("src/ui/styles.css", "utf8");
    const appEventBindings = readFileSync("src/presentation/appEventBindings.ts", "utf8");

    expect(css).toContain(".top-bar::before");
    expect(css).toContain(".top-bar:hover,\n.top-bar:focus-within");
    expect(css).toContain("opacity: 0");
    expect(css).toContain("transform: translate(-50%, -8px)");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("@media (hover: none), (pointer: coarse)");
    expect(css).toContain("--safe-bottom: env(safe-area-inset-bottom, 0px)");
    expect(css).toContain("height: 100dvh");
    expect(css).toContain('.canvas-stage[data-grid="hidden"]');
    expect(css).toContain(".action-cluster");
    expect(css).toContain(".persistence-status");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain("#import-btn,\n  #export-json-btn");
    expect(css).toContain("opacity: 1");
    expect(css).toContain("transform: translate(-50%, 0)");
    expect(css).toContain(':root[data-theme="dark"] .element-text.is-free-text.is-bare-text');
    expect(css).toContain(".inline-editor");
    expect(css).toContain("user-select: none");
    expect(css).toContain("-webkit-user-select: none");
    expect(css).toContain("border: 2px solid transparent");
    expect(css).toContain("background: transparent");
    expect(css).toContain("box-shadow: none");
    expect(css).toContain("textarea:focus-visible:not(.inline-editor)");
    expect(appEventBindings).toContain('"selectstart"');
    expect(appEventBindings).toContain("isEditableTextTarget");
    expect(appEventBindings).toContain("viewportController.handlePointerDown");
    expect(css).not.toContain(".brand-name,\n  #theme-btn");
  });

  it("wraps selection controls in a bounded floating panel", () => {
    const css = readFileSync("src/ui/styles.css", "utf8");
    const html = readFileSync("src/ui/index.html", "utf8");

    expect(css).toContain(".context-toolbar");
    expect(css).toContain("max-width: calc(100vw - 32px)");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("border-radius: 999px");
    expect(css).toContain(".command-dialog[open]");
    expect(css).toContain('.command-list[data-size="single"]');
    expect(css).toContain('.command-item[data-active="true"]');
    expect(css).toContain(".inspector-menu-group");
    expect(html).toContain("data-inspector-menu");
    expect(html).toContain("data-arrow-head");
    expect(html.indexOf('id="route-arrow-btn"')).toBeLessThan(
      html.indexOf('class="inspector-menu-group arrow-head-control"'),
    );
    expect(html).toContain('aria-label="Fill color"');
    expect(html).toContain('aria-label="Bold"');
    expect(html).toContain('aria-label="Italic"');
    expect(html).toContain('aria-label="Arrow style"');
    expect(html).toContain('aria-label="Arrange"');
    expect(html).toContain("M12 20.5a8.5");
    expect(html).toContain('stroke="none"');
    expect(html).toContain("M12 3v1.5");
  });
});
