import type { DiagramTool } from "../interfaces/index.js";
import { shapeDefinitions, shapeShortcut, shapeTools, type ShapeTool } from "../shared/index.js";
import type { CommandAction } from "./commandPalette.js";

type CommandRunner = () => Promise<void> | void;

export type CanvasCommandOptions = {
  activeTheme?: string;
  canEditSelection: boolean;
  canRedo: boolean;
  canUndo: boolean;
  gridVisible: boolean;
  hasSelection: boolean;
  selectionLocked: boolean;
  actions: {
    bringToFront: CommandRunner;
    clearSelection: CommandRunner;
    copySelection: CommandRunner;
    createBoard: CommandRunner;
    cutSelection: CommandRunner;
    deleteSelection: CommandRunner;
    duplicateSelection: CommandRunner;
    editSelectedText: CommandRunner;
    exportJson: CommandRunner;
    exportPng: CommandRunner;
    exportSvg: CommandRunner;
    importBoard: CommandRunner;
    openBoards: CommandRunner;
    pasteSelection: CommandRunner;
    redo: CommandRunner;
    selectAll: CommandRunner;
    sendToBack: CommandRunner;
    setTool: (tool: DiagramTool) => void;
    toggleArrowRoute: CommandRunner;
    toggleGridVisibility: CommandRunner;
    toggleSelectionLock: CommandRunner;
    toggleTheme: CommandRunner;
    undo: CommandRunner;
    zoomFit: CommandRunner;
    zoomIn: CommandRunner;
    zoomOut: CommandRunner;
  };
};

export function buildCanvasCommands(options: CanvasCommandOptions): CommandAction[] {
  return [
    ...toolCommands(options.actions.setTool),
    ...boardCommands(options),
    ...viewCommands(options),
    ...editCommands(options),
  ];
}

function toolCommands(setTool: (tool: DiagramTool) => void): CommandAction[] {
  const coreTools: Array<{
    detail: string;
    id: string;
    keywords: string;
    shortcut: string;
    title: string;
    tool: DiagramTool;
  }> = [
    {
      detail: "Move, select, resize, and edit existing elements",
      id: "tool-select",
      keywords: "pointer cursor move",
      shortcut: "V",
      title: "Select tool",
      tool: "select",
    },
    {
      detail: "Pan around the current board",
      id: "tool-hand",
      keywords: "pan move canvas",
      shortcut: "H",
      title: "Hand tool",
      tool: "hand",
    },
    {
      detail: "Add a sticky note",
      id: "tool-sticky",
      keywords: "note card",
      shortcut: "N",
      title: "Sticky note",
      tool: "sticky",
    },
    {
      detail: "Add bare text to the canvas",
      id: "tool-text",
      keywords: "label words type",
      shortcut: "T",
      title: "Text tool",
      tool: "text",
    },
    {
      detail: "Draw a connector or arrow",
      id: "tool-arrow",
      keywords: "connector line",
      shortcut: "A",
      title: "Arrow tool",
      tool: "arrow",
    },
    {
      detail: "Draw a freehand line",
      id: "tool-pen",
      keywords: "draw freehand pencil",
      shortcut: "P",
      title: "Pen tool",
      tool: "draw",
    },
    {
      detail: "Add a comment card",
      id: "tool-comment",
      keywords: "annotation note feedback",
      shortcut: "C",
      title: "Comment tool",
      tool: "comment",
    },
  ];

  return [
    ...coreTools.map((command) => ({
      detail: command.detail,
      id: command.id,
      keywords: command.keywords,
      run: () => setTool(command.tool),
      shortcut: command.shortcut,
      title: command.title,
    })),
    ...shapeTools.map((shape) => shapeCommand(shape, setTool)),
  ];
}

function shapeCommand(shape: ShapeTool, setTool: (tool: DiagramTool) => void): CommandAction {
  const definition = shapeDefinitions[shape];
  const shortcut = shapeShortcut(shape);
  return {
    detail: `Use ${definition.label.toLowerCase()} for the next shape`,
    id: `shape-${shape}`,
    keywords: `shape object flowchart ${shape}`,
    run: () => setTool(shape),
    shortcut,
    title: `${definition.label} shape`,
  };
}

function boardCommands({ actions }: CanvasCommandOptions): CommandAction[] {
  return [
    {
      detail: "Create a new board",
      id: "new-board",
      keywords: "canvas file add",
      run: actions.createBoard,
      title: "New board",
    },
    {
      detail: "Browse, open, duplicate, or delete boards",
      id: "open-boards",
      keywords: "library files canvases",
      run: actions.openBoards,
      title: "Boards",
    },
    {
      detail: "Load a MikroCanvas JSON board",
      id: "import-board",
      keywords: "upload open json",
      run: actions.importBoard,
      title: "Import board",
    },
    {
      detail: "Download the current board as JSON",
      id: "export-json",
      keywords: "download save backup",
      run: actions.exportJson,
      title: "Export JSON",
    },
    {
      detail: "Download the current board as PNG",
      id: "export-png",
      keywords: "download image bitmap",
      run: actions.exportPng,
      title: "Export PNG",
    },
    {
      detail: "Download the current board as SVG",
      id: "export-svg",
      keywords: "download image vector",
      run: actions.exportSvg,
      title: "Export SVG",
    },
  ];
}

function viewCommands({
  activeTheme,
  actions,
  gridVisible,
}: CanvasCommandOptions): CommandAction[] {
  return [
    {
      detail: "Light or dark mode",
      id: "toggle-theme",
      keywords: "appearance theme light dark",
      run: actions.toggleTheme,
      title: `Switch to ${activeTheme === "dark" ? "light" : "dark"} mode`,
    },
    {
      detail: "Show or hide the canvas dot grid",
      id: "toggle-grid",
      keywords: "background dots guides visibility",
      run: actions.toggleGridVisibility,
      title: `${gridVisible ? "Hide" : "Show"} background grid`,
    },
    {
      detail: "Fit all board content in view",
      id: "zoom-fit",
      keywords: "view reset center",
      run: actions.zoomFit,
      title: "Zoom to fit",
    },
    {
      detail: "Zoom into the canvas",
      id: "zoom-in",
      keywords: "view larger",
      run: actions.zoomIn,
      shortcut: "+",
      title: "Zoom in",
    },
    {
      detail: "Zoom out of the canvas",
      id: "zoom-out",
      keywords: "view smaller",
      run: actions.zoomOut,
      shortcut: "-",
      title: "Zoom out",
    },
  ];
}

function editCommands(options: CanvasCommandOptions): CommandAction[] {
  const commands: CommandAction[] = [];

  if (options.canUndo) {
    commands.push({
      detail: "Undo the last board change",
      id: "undo",
      keywords: "history",
      run: options.actions.undo,
      shortcut: "Cmd/Ctrl+Z",
      title: "Undo",
    });
  }

  if (options.canRedo) {
    commands.push({
      detail: "Redo the last undone change",
      id: "redo",
      keywords: "history",
      run: options.actions.redo,
      shortcut: "Cmd/Ctrl+Shift+Z",
      title: "Redo",
    });
  }

  commands.push(
    {
      detail: "Select every element on the board",
      id: "select-all",
      keywords: "selection all",
      run: options.actions.selectAll,
      shortcut: "Cmd/Ctrl+A",
      title: "Select all",
    },
    {
      detail: "Paste elements from the clipboard",
      id: "paste",
      keywords: "clipboard insert",
      run: options.actions.pasteSelection,
      shortcut: "Cmd/Ctrl+V",
      title: "Paste",
    },
  );

  if (!options.hasSelection) {
    return commands;
  }

  commands.push(
    {
      detail: "Clear the active selection",
      id: "clear-selection",
      keywords: "deselect",
      run: options.actions.clearSelection,
      shortcut: "Esc",
      title: "Clear selection",
    },
    {
      detail: "Copy selected elements",
      id: "copy",
      keywords: "clipboard",
      run: options.actions.copySelection,
      shortcut: "Cmd/Ctrl+C",
      title: "Copy selection",
    },
    {
      detail: "Cut selected elements",
      id: "cut",
      keywords: "clipboard remove",
      run: options.actions.cutSelection,
      shortcut: "Cmd/Ctrl+X",
      title: "Cut selection",
    },
    {
      detail: "Duplicate selected elements",
      id: "duplicate",
      keywords: "clone copy",
      run: options.actions.duplicateSelection,
      shortcut: "Cmd/Ctrl+D",
      title: "Duplicate selection",
    },
    {
      detail: "Remove selected elements",
      id: "delete",
      keywords: "trash remove",
      run: options.actions.deleteSelection,
      shortcut: "Delete",
      title: "Delete selection",
    },
    {
      detail: options.selectionLocked
        ? "Allow selected elements to be edited"
        : "Prevent selected elements from being changed",
      id: "lock-selection",
      keywords: "freeze protect unlock",
      run: options.actions.toggleSelectionLock,
      title: options.selectionLocked ? "Unlock selection" : "Lock selection",
    },
    {
      detail: "Bring selected elements above others",
      id: "bring-front",
      keywords: "arrange layer z order",
      run: options.actions.bringToFront,
      title: "Bring to front",
    },
    {
      detail: "Send selected elements behind others",
      id: "send-back",
      keywords: "arrange layer z order",
      run: options.actions.sendToBack,
      title: "Send to back",
    },
    {
      detail: "Switch selected arrows between straight and angled",
      id: "toggle-arrow-route",
      keywords: "connector line elbow straight angled",
      run: options.actions.toggleArrowRoute,
      title: "Toggle arrow route",
    },
  );

  if (options.canEditSelection) {
    commands.push({
      detail: "Edit text on the selected element",
      id: "edit-text",
      keywords: "label title words",
      run: options.actions.editSelectedText,
      shortcut: "Enter",
      title: "Edit selected text",
    });
  }

  return commands;
}
