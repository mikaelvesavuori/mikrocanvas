import type { DiagramTool } from "../../src/interfaces/index.js";
import {
  type CommandAction,
  filterCommandActions,
  normalizeCommandText,
} from "../../src/presentation/commandPalette.js";
import { type CanvasCommandOptions, buildCanvasCommands } from "../../src/presentation/commands.js";
import { shapeTools } from "../../src/shared/index.js";

const noop = () => undefined;

describe("command palette", () => {
  it("normalizes and filters actions by title, detail, keywords, and shortcut", () => {
    const actions: CommandAction[] = [
      {
        detail: "Download the current board as PNG",
        id: "export-png",
        keywords: "image bitmap",
        run: noop,
        shortcut: "Cmd/Ctrl+P",
        title: "Export PNG",
      },
      {
        detail: "Pan around the current board",
        id: "tool-hand",
        keywords: "canvas move",
        run: noop,
        shortcut: "H",
        title: "Hand tool",
      },
    ];

    expect(normalizeCommandText("  Export    PNG  ")).toBe("export png");
    expect(filterCommandActions(actions, "bitmap").map((action) => action.id)).toEqual([
      "export-png",
    ]);
    expect(filterCommandActions(actions, "cmd/ctrl+p").map((action) => action.id)).toEqual([
      "export-png",
    ]);
    expect(filterCommandActions(actions, "canvas").map((action) => action.id)).toEqual([
      "tool-hand",
    ]);
  });

  it("prioritizes a dynamic action without duplicating an existing command", () => {
    const actions: CommandAction[] = [
      {
        detail: "Create a new board",
        id: "new-board",
        keywords: "canvas",
        run: noop,
        title: "New board",
      },
    ];
    const dynamicAction: CommandAction = {
      detail: "Create this exact board",
      id: "new-board",
      keywords: "canvas",
      run: noop,
      title: "New board named Project",
    };

    expect(
      filterCommandActions(actions, "new", () => dynamicAction).map((action) => action.title),
    ).toEqual(["New board named Project"]);
  });

  it("builds canvas commands for tools, shapes, board files, and view actions", () => {
    const commands = buildCanvasCommands(
      commandOptions({ activeTheme: "dark", canRedo: true, canUndo: true }),
    );
    const ids = commands.map((command) => command.id);

    for (const id of [
      "tool-select",
      "tool-hand",
      "tool-sticky",
      "tool-text",
      "tool-arrow",
      "tool-pen",
      "tool-comment",
      "new-board",
      "open-boards",
      "import-board",
      "export-json",
      "export-png",
      "export-svg",
      "zoom-fit",
      "zoom-in",
      "zoom-out",
      "toggle-grid",
      "undo",
      "redo",
    ]) {
      expect(ids).toContain(id);
    }

    for (const shape of shapeTools) {
      expect(ids).toContain(`shape-${shape}`);
    }

    expect(commands.find((command) => command.id === "toggle-theme")?.title).toBe(
      "Switch to light mode",
    );
    expect(commands.find((command) => command.id === "toggle-grid")?.title).toBe(
      "Hide background grid",
    );
  });

  it("labels the grid command for the next visibility state", () => {
    const commands = buildCanvasCommands(commandOptions({ gridVisible: false }));

    expect(commands.find((command) => command.id === "toggle-grid")?.title).toBe(
      "Show background grid",
    );
  });

  it("only exposes selection commands when a selection exists", () => {
    const noSelection = buildCanvasCommands(commandOptions());
    const selected = buildCanvasCommands(
      commandOptions({
        canEditSelection: true,
        hasSelection: true,
        selectionLocked: true,
      }),
    );

    expect(noSelection.map((command) => command.id)).not.toContain("delete");
    expect(noSelection.map((command) => command.id)).not.toContain("edit-text");
    expect(selected.map((command) => command.id)).toEqual(
      expect.arrayContaining(["delete", "edit-text", "lock-selection", "toggle-arrow-route"]),
    );
    expect(selected.find((command) => command.id === "lock-selection")?.title).toBe(
      "Unlock selection",
    );
  });

  it("only exposes history commands when history is available", () => {
    const unavailable = buildCanvasCommands(commandOptions());
    const available = buildCanvasCommands(commandOptions({ canRedo: true, canUndo: true }));

    expect(unavailable.map((command) => command.id)).not.toContain("undo");
    expect(unavailable.map((command) => command.id)).not.toContain("redo");
    expect(available.map((command) => command.id)).toEqual(
      expect.arrayContaining(["undo", "redo"]),
    );
  });

  it("runs tool commands through the shared tool setter", () => {
    const setTool = vi.fn();
    const commands = buildCanvasCommands(
      commandOptions({
        actions: { setTool },
      }),
    );

    commands.find((command) => command.id === "shape-database")?.run();

    expect(setTool).toHaveBeenCalledWith("database");
  });
});

function commandOptions(
  overrides: Partial<Omit<CanvasCommandOptions, "actions">> & {
    actions?: Partial<CanvasCommandOptions["actions"]>;
  } = {},
): CanvasCommandOptions {
  const base: CanvasCommandOptions = {
    activeTheme: "light",
    canEditSelection: false,
    canRedo: false,
    canUndo: false,
    gridVisible: true,
    hasSelection: false,
    selectionLocked: false,
    actions: {
      bringToFront: noop,
      clearSelection: noop,
      copySelection: noop,
      createBoard: noop,
      cutSelection: noop,
      deleteSelection: noop,
      duplicateSelection: noop,
      editSelectedText: noop,
      exportJson: noop,
      exportPng: noop,
      exportSvg: noop,
      importBoard: noop,
      openBoards: noop,
      pasteSelection: noop,
      redo: noop,
      selectAll: noop,
      sendToBack: noop,
      setTool: (_tool: DiagramTool) => undefined,
      toggleArrowRoute: noop,
      toggleGridVisibility: noop,
      toggleSelectionLock: noop,
      toggleTheme: noop,
      undo: noop,
      zoomFit: noop,
      zoomIn: noop,
      zoomOut: noop,
    },
  };

  return {
    ...base,
    ...overrides,
    actions: {
      ...base.actions,
      ...overrides.actions,
    },
  };
}
