import type { DiagramTool } from "../interfaces/index.js";
import { shapeShortcut, shapeTools } from "../shared/index.js";

type KeyboardControllerOptions = {
  isCommandPaletteOpen: () => boolean;
  isExportMenuOpen: () => boolean;
  closeExportMenu: () => void;
  openCommandPalette: () => void;
  setSpacePressed: (pressed: boolean) => void;
  render: () => void;
  selectAllElements: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  canEditSelection: () => boolean;
  editSelectedText: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setTool: (tool: DiagramTool) => void;
};

const toolShortcuts: Record<string, DiagramTool> = {
  v: "select",
  h: "hand",
  n: "sticky",
  t: "text",
  ...shapeShortcuts(),
  a: "arrow",
  p: "draw",
  c: "comment",
};

function shapeShortcuts(): Record<string, DiagramTool> {
  return Object.fromEntries(
    shapeTools.flatMap((shape) => {
      const shortcut = shapeShortcut(shape);
      return shortcut ? [[shortcut.toLowerCase(), shape]] : [];
    }),
  ) as Record<string, DiagramTool>;
}

export function createKeyboardHandler(options: KeyboardControllerOptions) {
  return (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && key === "k" && !options.isCommandPaletteOpen()) {
      event.preventDefault();
      options.openCommandPalette();
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    if (event.key === "Escape" && options.isExportMenuOpen()) {
      event.preventDefault();
      options.closeExportMenu();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      options.setSpacePressed(true);
      options.render();
      return;
    }

    if (modifier && key === "a") {
      event.preventDefault();
      options.selectAllElements();
      return;
    }

    if (modifier && key === "c") {
      event.preventDefault();
      options.copySelection();
      return;
    }

    if (modifier && key === "x") {
      event.preventDefault();
      options.cutSelection();
      return;
    }

    if (modifier && key === "v") {
      event.preventDefault();
      void options.pasteSelection();
      return;
    }

    if (modifier && key === "z") {
      event.preventDefault();
      void (event.shiftKey ? options.redo() : options.undo());
      return;
    }

    if (modifier && key === "y") {
      event.preventDefault();
      void options.redo();
      return;
    }

    if (modifier && key === "d") {
      event.preventDefault();
      options.duplicateSelection();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      options.deleteSelection();
      return;
    }

    if (event.key === "Enter" && options.canEditSelection()) {
      event.preventDefault();
      options.editSelectedText();
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      options.zoomIn();
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      options.zoomOut();
      return;
    }

    const tool = toolShortcuts[key];
    if (tool) {
      options.setTool(tool);
    }
  };
}

export function createKeyboardKeyupHandler(
  options: Pick<KeyboardControllerOptions, "setSpacePressed" | "render">,
) {
  return (event: KeyboardEvent) => {
    if (event.code === "Space") {
      options.setSpacePressed(false);
      options.render();
    }
  };
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
