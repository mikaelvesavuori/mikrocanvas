import type { BoardService } from "../application/index.js";
import type { DiagramBoard, DiagramElement } from "../interfaces/index.js";
import { exportJson, exportPng, exportSvg, importBoard } from "./boardFiles.js";
import type { GeometryContext } from "./canvasGeometry.js";
import type { CanvasPointerController } from "./canvasPointerController.js";
import { elements } from "./dom.js";
import { closeExportMenu, toggleExportMenu } from "./exportMenu.js";
import type { InlineEditorController } from "./inlineEditorController.js";
import { renderShapeMenuOptions } from "./shapeSelectorView.js";
import { toggleTheme } from "./theme.js";
import type { ViewportController } from "./viewportController.js";

export type AppEventBindingOptions = {
  boardService: BoardService;
  canvasPointer: CanvasPointerController;
  viewportController: ViewportController;
  inlineEditor: InlineEditorController;
  geometryContext: GeometryContext;
  getActiveBoard: () => DiagramBoard | null;
  clearSelection: () => void;
  showToast: (message: string) => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  reorderSelection: (direction: "front" | "back") => void;
  editSelectedText: () => void;
  toggleGridVisibility: () => void;
  toggleSelectionLock: () => void;
  toggleArrowRoute: () => void;
  applyInspectorText: () => void;
  applyStylePatch: (patch: Partial<DiagramElement["style"]>) => void;
  toggleBoldText: () => void;
  toggleItalicText: () => void;
  handleBoardListClick: (event: MouseEvent) => void;
  handleDocumentClick: (event: MouseEvent) => void;
  handleKeyboard: (event: KeyboardEvent) => void;
  handleKeyboardKeyup: (event: KeyboardEvent) => void;
};

export function bindAppEvents(options: AppEventBindingOptions) {
  renderShapeMenuOptions();
  bindCanvasEvents(options);
  bindBoardEvents(options);
  bindImportExportEvents(options);
  bindInspectorEvents(options);
  bindDocumentEvents(options);
}

function bindCanvasEvents({
  canvasPointer,
  viewportController,
}: Pick<AppEventBindingOptions, "canvasPointer" | "viewportController">) {
  elements.canvasStage.addEventListener("pointerdown", (event) =>
    canvasPointer.handlePointerDown(event),
  );
  elements.canvasStage.addEventListener("pointermove", (event) =>
    canvasPointer.handlePointerMove(event),
  );
  elements.canvasStage.addEventListener("pointerup", (event) =>
    canvasPointer.handlePointerUp(event),
  );
  elements.canvasStage.addEventListener("pointercancel", (event) =>
    canvasPointer.handlePointerUp(event),
  );
  elements.canvasStage.addEventListener("dblclick", (event) =>
    canvasPointer.handleDoubleClick(event),
  );
  elements.canvasStage.addEventListener("wheel", (event) => viewportController.handleWheel(event), {
    passive: false,
  });
}

function bindBoardEvents({
  boardService,
  toggleGridVisibility,
  viewportController,
}: Pick<AppEventBindingOptions, "boardService" | "toggleGridVisibility" | "viewportController">) {
  elements.boardTitleInput.addEventListener(
    "change",
    () => void boardService.renameActiveBoard(elements.boardTitleInput.value),
  );
  elements.boardTitleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      elements.boardTitleInput.blur();
    }
  });
  elements.newBoardButton.addEventListener("click", () => {
    void boardService.createBoard("Untitled board").then(() => {
      viewportController.fitToContent({ allowZoomIn: false });
    });
  });
  elements.libraryButton.addEventListener("click", () => elements.libraryDialog.showModal());
  elements.undoButton.addEventListener("click", () => void boardService.undo());
  elements.redoButton.addEventListener("click", () => void boardService.redo());
  elements.themeButton.addEventListener("click", toggleTheme);
  elements.gridToggleButton.addEventListener("click", toggleGridVisibility);
  elements.zoomOutButton.addEventListener("click", () => viewportController.zoomAtCenter(0.82));
  elements.zoomInButton.addEventListener("click", () => viewportController.zoomAtCenter(1.18));
  elements.zoomFitButton.addEventListener("click", () => viewportController.fitToContent());
}

function bindImportExportEvents({
  boardService,
  clearSelection,
  geometryContext,
  getActiveBoard,
  showToast,
}: Pick<
  AppEventBindingOptions,
  "boardService" | "clearSelection" | "geometryContext" | "getActiveBoard" | "showToast"
>) {
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener(
    "change",
    () => void importBoard(elements.importFileInput, boardService, clearSelection, showToast),
  );
  elements.exportJsonButton.addEventListener("click", () => exportJson(boardService, showToast));
  elements.exportImageButton.addEventListener("click", toggleExportMenu);
  elements.exportMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  elements.exportMenuSvgButton.addEventListener("click", () => {
    closeExportMenu();
    exportSvg(getActiveBoard(), geometryContext, showToast);
  });
  elements.exportMenuPngButton.addEventListener("click", () => {
    closeExportMenu();
    void exportPng(getActiveBoard(), geometryContext, showToast);
  });
}

function bindInspectorEvents({
  duplicateSelection,
  deleteSelection,
  reorderSelection,
  editSelectedText,
  toggleSelectionLock,
  toggleArrowRoute,
  applyInspectorText,
  applyStylePatch,
  toggleBoldText,
  toggleItalicText,
  inlineEditor,
}: Pick<
  AppEventBindingOptions,
  | "duplicateSelection"
  | "deleteSelection"
  | "reorderSelection"
  | "editSelectedText"
  | "toggleSelectionLock"
  | "toggleArrowRoute"
  | "applyInspectorText"
  | "applyStylePatch"
  | "toggleBoldText"
  | "toggleItalicText"
  | "inlineEditor"
>) {
  elements.duplicateButton.addEventListener("click", duplicateSelection);
  elements.deleteSelectionButton.addEventListener("click", deleteSelection);
  elements.bringFrontButton.addEventListener("click", () => reorderSelection("front"));
  elements.sendBackButton.addEventListener("click", () => reorderSelection("back"));
  elements.editTextButton.addEventListener("click", editSelectedText);
  elements.lockSelectionButton.addEventListener("click", toggleSelectionLock);
  elements.routeArrowButton.addEventListener("click", toggleArrowRoute);
  elements.textValueInput.addEventListener("change", applyInspectorText);
  elements.fillColorInput.addEventListener("change", () =>
    applyStylePatch({ fill: elements.fillColorInput.value }),
  );
  elements.strokeColorInput.addEventListener("change", () =>
    applyStylePatch({ stroke: elements.strokeColorInput.value }),
  );
  elements.textColorInput.addEventListener("change", () =>
    applyStylePatch({ text: elements.textColorInput.value }),
  );
  elements.fontSizeInput.addEventListener("change", () =>
    applyStylePatch({ fontSize: Number(elements.fontSizeInput.value) }),
  );
  elements.boldTextButton.addEventListener("click", toggleBoldText);
  elements.italicTextButton.addEventListener("click", toggleItalicText);
  elements.inlineEditor.addEventListener("blur", () => inlineEditor.close(true));
  elements.inlineEditor.addEventListener("keydown", (event) => inlineEditor.handleKeydown(event));
}

function bindDocumentEvents({
  handleBoardListClick,
  handleDocumentClick,
  handleKeyboard,
  handleKeyboardKeyup,
}: Pick<
  AppEventBindingOptions,
  "handleBoardListClick" | "handleDocumentClick" | "handleKeyboard" | "handleKeyboardKeyup"
>) {
  elements.boardList.addEventListener("click", handleBoardListClick);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeyboard);
  document.addEventListener("keyup", handleKeyboardKeyup);
}
