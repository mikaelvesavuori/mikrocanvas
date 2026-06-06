import {
  type BoardRepository,
  BoardService,
  type BoardSnapshotRepository,
} from "../application/index.js";
import { createDefaultRuntimeConfig, type RuntimeConfig } from "../config/index.js";
import { DiagramCommandService } from "../domain/index.js";
import { IndexedDbBoardRepository, RuntimeBoardRepository } from "../infrastructure/index.js";
import type {
  ArrowElement,
  ArrowHead,
  ArrowRoute,
  DiagramAppState,
  DiagramBoard,
  DiagramElement,
  DiagramTool,
  Point,
} from "../interfaces/index.js";
import { isShapeTool, type ShapeTool } from "../shared/index.js";
import { bindAppEvents } from "./appEventBindings.js";
import { createBoardListClickHandler } from "./boardListController.js";
import { renderBoardListItems } from "./boardListView.js";
import {
  type GeometryContext,
  endpointForArrowOnBoard as resolveEndpointForArrowOnBoard,
} from "./canvasGeometry.js";
import { CanvasPointerController } from "./canvasPointerController.js";
import { ClipboardController } from "./clipboardController.js";
import { exportJson, exportPng, exportSvg } from "./boardFiles.js";
import { CommandPalette } from "./commandPalette.js";
import { buildCanvasCommands } from "./commands.js";
import { createDocumentClickHandler } from "./documentClickController.js";
import { elements } from "./dom.js";
import { closeExportMenu } from "./exportMenu.js";
import { hasText } from "./format.js";
import { InlineEditorController } from "./inlineEditorController.js";
import { renderInspector } from "./inspectorView.js";
import { createKeyboardHandler, createKeyboardKeyupHandler } from "./keyboardController.js";
import { boardIdToShareId, shareIdToBoardId } from "./boardShareLinks.js";
import {
  isElementLocked,
  mutableSelectedElements,
  retainExistingSelection,
  stylePatchesForSelection,
} from "./selectionModel.js";
import { renderShapeSelector } from "./shapeSelectorView.js";
import { renderOverlayLayer, renderWorldLayer } from "./svgRenderer.js";
import { applyStoredTheme, toggleTheme } from "./theme.js";
import { ViewportController } from "./viewportController.js";

const runtimeRepository = new RuntimeBoardRepository(new IndexedDbBoardRepository());
const boardService = new BoardService(runtimeRepository);
const commandService = new DiagramCommandService();
const clipboardController = new ClipboardController(commandService);
const geometryContext: GeometryContext = {
  getElementBounds: (element) => commandService.getElementBounds(element),
  getConnectionPoint: (element, anchor) => commandService.getConnectionPoint(element, anchor),
};
let appState: DiagramAppState = {
  boards: [],
  activeBoard: null,
  storageAvailable: true,
  persistence: { status: "idle" },
  canUndo: false,
  canRedo: false,
};
let activeTool: DiagramTool = "select";
let activeShapeTool: ShapeTool = "rectangle";
let activeArrowRoute: ArrowRoute = "straight";
let selectedIds = new Set<string>();
let selectedTextTargetId: string | null = null;
let runtimeConfig = createDefaultRuntimeConfig();
let boardSnapshotRepository: BoardSnapshotRepository | null = null;
let lastPersistenceError = "";
let toastTimer = 0;
let spacePressed = false;
const inlineEditor = new InlineEditorController({
  getBoard: () => appState.activeBoard,
  getElementBounds: (element) => commandService.getElementBounds(element),
  endpointForArrow: endpointForArrowOnBoard,
  updateText: updateElementText,
  selectOnly: (id) => {
    selectedIds = new Set([id]);
    selectedTextTargetId = null;
  },
  render,
});
const canvasPointer = new CanvasPointerController({
  stage: elements.canvasStage,
  svg: elements.canvasSvg,
  inlineEditor: elements.inlineEditor,
  boardService,
  commandService,
  geometry: geometryContext,
  getActiveTool: () => activeTool,
  getArrowRoute: () => activeArrowRoute,
  getBoard: () => appState.activeBoard,
  getSelectedIds: () => selectedIds,
  setSelectedIds: (ids) => {
    selectedIds = ids;
    retainSelectedTextTarget();
  },
  selectTextTarget: (id) => {
    selectedTextTargetId = id;
    retainSelectedTextTarget();
  },
  isSpacePressed: () => spacePressed,
  setTool,
  openInlineEditor: (id) => inlineEditor.open(id),
  closeInlineEditor: () => inlineEditor.close(true),
  render,
});
const viewportController = new ViewportController({
  stage: elements.canvasStage,
  boardService,
  commandService,
  geometry: geometryContext,
  getBoard: () => appState.activeBoard,
});
const commandPalette = new CommandPalette({
  dialog: elements.commandDialog,
  getActions: buildCommandActions,
  input: elements.commandInput,
  list: elements.commandList,
  onError: (error) => showToast(error instanceof Error ? error.message : "Command failed"),
});
const handleKeyboard = createKeyboardHandler({
  isCommandPaletteOpen: () => elements.commandDialog.open,
  isExportMenuOpen: () => !elements.exportMenu.hidden,
  closeExportMenu,
  openCommandPalette,
  setSpacePressed: (pressed) => {
    spacePressed = pressed;
  },
  render,
  selectAllElements,
  copySelection,
  cutSelection,
  pasteSelection,
  undo: () => boardService.undo(),
  redo: () => boardService.redo(),
  duplicateSelection,
  deleteSelection,
  canEditSelection: () => selectedIds.size === 1,
  editSelectedText,
  zoomIn: () => viewportController.zoomAtCenter(1.15),
  zoomOut: () => viewportController.zoomAtCenter(0.85),
  setTool,
});
const handleKeyboardKeyup = createKeyboardKeyupHandler({
  setSpacePressed: (pressed) => {
    spacePressed = pressed;
  },
  render,
});
const handleBoardListClick = createBoardListClickHandler({
  clearSelection,
  loadBoard: loadLocalBoard,
  duplicateBoard: duplicateLocalBoard,
  deleteBoard: deleteBoardFromLibrary,
  confirmDeleteBoard,
  closeLibrary: () => elements.libraryDialog.close(),
});
const handleDocumentClick = createDocumentClickHandler({
  closeExportMenu,
  setTool,
  getShapeTool: () => activeShapeTool,
  applyColorPatch,
  applyLineStyle,
  applyArrowHead,
});

export class MikroCanvasApp {
  boot() {
    return boot();
  }
}

export function configureRuntime(
  config: RuntimeConfig,
  repository: BoardRepository,
  snapshotRepository: BoardSnapshotRepository | null = null,
) {
  runtimeConfig = config;
  runtimeRepository.use(repository);
  boardSnapshotRepository = snapshotRepository;
}

async function boot() {
  applyStoredTheme();
  bindEvents();
  boardService.subscribe((state) => {
    appState = state;
    selectedIds = retainExistingSelection(selectedIds, state.activeBoard);
    retainSelectedTextTarget();
    render();
  });
  await boardService.boot();
  await loadInitialBoardSnapshot();
}

function bindEvents() {
  bindAppEvents({
    boardService,
    canvasPointer,
    viewportController,
    inlineEditor,
    geometryContext,
    getActiveBoard: () => appState.activeBoard,
    clearSelection,
    clearSharedBoardUrl,
    showToast,
    createBoard: createNewBoard,
    duplicateSelection,
    deleteSelection,
    reorderSelection,
    editSelectedText,
    toggleGridVisibility,
    publishBoardSnapshot,
    toggleSelectionLock,
    toggleArrowRoute,
    applyInspectorText,
    applyStylePatch,
    toggleBoldText,
    toggleItalicText,
    handleBoardListClick,
    handleDocumentClick,
    handleKeyboard,
    handleKeyboardKeyup,
  });
}

async function createNewBoard() {
  await boardService.createBoard("Untitled board");
  clearSharedBoardUrl();
  viewportController.fitToContent({ allowZoomIn: false });
}

async function loadLocalBoard(id: string) {
  await boardService.loadBoard(id);
  clearSharedBoardUrl();
}

async function duplicateLocalBoard(id: string) {
  await boardService.duplicateBoard(id);
  clearSharedBoardUrl();
}

function openBoardLibrary() {
  if (!elements.libraryDialog.open) {
    elements.libraryDialog.showModal();
  }
}

function openCommandPalette() {
  inlineEditor.close(true);
  closeExportMenu();
  elements.shapeSelector.open = false;
  if (elements.libraryDialog.open) {
    elements.libraryDialog.close();
  }
  commandPalette.open();
}

function buildCommandActions() {
  const selectedElements =
    appState.activeBoard?.elements.filter((element) => selectedIds.has(element.id)) ?? [];

  return buildCanvasCommands({
    activeTheme: elements.html.dataset.theme,
    canEditSelection: selectedIds.size === 1,
    canRedo: appState.canRedo,
    canUndo: appState.canUndo,
    gridVisible: isGridVisible(appState.activeBoard),
    hasSelection: selectedIds.size > 0,
    activeBoardId: appState.activeBoard?.id,
    snapshotSharingEnabled: isSnapshotSharingEnabled(),
    selectionLocked: selectedElements.length > 0 && selectedElements.every(isElementLocked),
    actions: {
      bringToFront: () => reorderSelection("front"),
      clearSelection: () => {
        clearSelection();
        render();
      },
      copySelection,
      createBoard: createNewBoard,
      cutSelection,
      deleteSelection,
      duplicateSelection,
      editSelectedText,
      exportJson: () => exportJson(boardService, showToast),
      exportPng: () => exportPng(appState.activeBoard, geometryContext, showToast),
      exportSvg: () => exportSvg(appState.activeBoard, geometryContext, showToast),
      importBoard: () => elements.importFileInput.click(),
      openBoards: openBoardLibrary,
      pasteSelection,
      redo: () => boardService.redo(),
      publishBoardSnapshot,
      selectAll: selectAllElements,
      sendToBack: () => reorderSelection("back"),
      setTool,
      toggleArrowRoute,
      toggleGridVisibility,
      toggleSelectionLock,
      toggleTheme,
      undo: () => boardService.undo(),
      zoomFit: () => viewportController.fitToContent(),
      zoomIn: () => viewportController.zoomAtCenter(1.15),
      zoomOut: () => viewportController.zoomAtCenter(0.85),
    },
  });
}

function render() {
  const board = appState.activeBoard;
  renderPersistenceStatus();
  renderShareBoardButton(board);
  elements.undoButton.disabled = !appState.canUndo;
  elements.redoButton.disabled = !appState.canRedo;
  elements.canvasStage.dataset.tool = spacePressed ? "hand" : activeTool;
  elements.zoomFitButton.textContent = `${Math.round((board?.viewport.zoom ?? 1) * 100)}%`;
  updateGridToggle(isGridVisible(board));

  if (board && document.activeElement !== elements.boardTitleInput) {
    elements.boardTitleInput.value = board.title;
  }

  for (const button of document.querySelectorAll<HTMLElement>("[data-tool]")) {
    button.classList.toggle("is-active", button.dataset.tool === activeTool);
  }
  renderShapeSelector(activeShapeTool, activeTool);

  renderBoard(board);
  renderBoardList();
  renderInspector(board, selectedIds, selectedTextTargetId);
}

function renderBoard(board: DiagramBoard | null) {
  if (!board) {
    elements.canvasStage.dataset.grid = "visible";
    elements.worldLayer.innerHTML = "";
    elements.overlayLayer.innerHTML = "";
    return;
  }

  elements.canvasStage.dataset.grid = isGridVisible(board) ? "visible" : "hidden";
  const { x, y, zoom } = board.viewport;
  const transform = `translate(${x} ${y}) scale(${zoom})`;
  elements.worldLayer.setAttribute("transform", transform);
  elements.overlayLayer.setAttribute("transform", transform);
  const renderContext = {
    ...geometryContext,
    editingElementId: inlineEditor.activeElementId,
    selectedIds,
    textTargetId: selectedTextTargetId,
  };
  elements.worldLayer.innerHTML = renderWorldLayer(board, canvasPointer.interaction, renderContext);
  elements.overlayLayer.innerHTML = renderOverlayLayer(
    board,
    canvasPointer.interaction,
    renderContext,
  );
  viewportController.updateGrid(board.viewport);
}

function renderBoardList() {
  const activeId = appState.activeBoard?.id;
  elements.boardList.innerHTML = renderBoardListItems(appState.boards, activeId);
}

function duplicateSelection() {
  const board = appState.activeBoard;
  if (!board || selectedIds.size === 0) {
    return;
  }

  const ids = mutableSelectedElements(board, selectedIds).map((element) => element.id);
  if (ids.length === 0) {
    showToast("Unlock to duplicate");
    return;
  }

  const result = commandService.duplicateElements(board, ids);
  selectedIds = new Set(result.ids);
  selectedTextTargetId = null;
  void boardService.replaceActiveBoard(result.board);
}

function deleteSelection() {
  const board = appState.activeBoard;
  if (!board || selectedIds.size === 0) {
    return;
  }

  const ids = mutableSelectedElements(board, selectedIds).map((element) => element.id);
  if (ids.length === 0) {
    showToast("Unlock to delete");
    return;
  }

  void boardService.replaceActiveBoard(commandService.removeElements(board, ids));
  selectedIds = new Set();
  selectedTextTargetId = null;
}

function reorderSelection(direction: "front" | "back") {
  const board = appState.activeBoard;
  if (!board || selectedIds.size === 0) {
    return;
  }

  const ids = mutableSelectedElements(board, selectedIds).map((element) => element.id);
  if (ids.length === 0) {
    showToast("Unlock to arrange");
    return;
  }

  void boardService.replaceActiveBoard(commandService.reorderElements(board, ids, direction));
}

function selectAllElements() {
  const board = appState.activeBoard;
  if (!board) {
    return;
  }

  selectedIds = new Set(board.elements.map((element) => element.id));
  selectedTextTargetId = null;
  render();
}

function copySelection() {
  const board = appState.activeBoard;
  if (!board || selectedIds.size === 0) {
    return;
  }

  const count = clipboardController.copy(board, selectedIds);
  showToast(`${count} copied`);
}

function cutSelection() {
  copySelection();
  deleteSelection();
}

async function pasteSelection() {
  const board = appState.activeBoard;
  if (!board) {
    return;
  }

  const result = await clipboardController.paste(board);
  if (result.kind === "failed") {
    showToast("Nothing to paste");
    return;
  }

  if (result.kind === "empty") {
    return;
  }

  selectedIds = new Set(result.ids);
  selectedTextTargetId = null;
  void boardService.replaceActiveBoard(result.board);
  showToast(`${result.ids.length} pasted`);
}

function editSelectedText() {
  if (selectedIds.size !== 1) {
    return;
  }

  const board = appState.activeBoard;
  const id = [...selectedIds][0] ?? "";
  const element = board?.elements.find((entry) => entry.id === id);
  if (!element || isElementLocked(element)) {
    showToast("Unlock to edit text");
    return;
  }

  inlineEditor.open(id);
}

function applyInspectorText() {
  const board = appState.activeBoard;
  const id = [...selectedIds][0];
  if (!board || selectedIds.size !== 1 || !id) {
    return;
  }

  void updateElementText(board, id, elements.textValueInput.value);
}

function toggleSelectionLock() {
  const board = appState.activeBoard;
  const selected = board?.elements.filter((element) => selectedIds.has(element.id)) ?? [];
  if (!board || selected.length === 0) {
    return;
  }

  const locked = !selected.every(isElementLocked);
  selectedTextTargetId = null;
  inlineEditor.close(false);
  void boardService.replaceActiveBoard(
    commandService.updateElements(
      board,
      selected.map((element) => ({
        id: element.id,
        patch: { locked } as Partial<DiagramElement>,
      })),
    ),
  );
}

function applyColorPatch(kind: string, color: string) {
  if (kind === "fill") {
    applyStylePatch({ fill: color });
    return;
  }

  if (kind === "stroke") {
    applyStylePatch({ stroke: color });
    return;
  }

  if (kind === "text") {
    applyStylePatch({ text: color });
  }
}

function toggleArrowRoute() {
  const board = appState.activeBoard;
  if (!board) {
    return;
  }

  const selectedArrows = board.elements.filter(
    (element): element is ArrowElement =>
      selectedIds.has(element.id) && element.type === "arrow" && !isElementLocked(element),
  );
  if (selectedArrows.length === 0) {
    return;
  }

  const route: ArrowRoute = selectedArrows[0]?.route === "elbow" ? "straight" : "elbow";
  activeArrowRoute = route;
  const patches = selectedArrows.map((element) => ({
    id: element.id,
    patch: { route } as Partial<ArrowElement> as Partial<DiagramElement>,
  }));
  void boardService.replaceActiveBoard(commandService.updateElements(board, patches));
}

function toggleGridVisibility() {
  const board = appState.activeBoard;
  if (!board) {
    return;
  }

  const gridVisible = !isGridVisible(board);
  void boardService.replaceActiveBoard(
    commandService.updateBoardGridVisibility(board, gridVisible),
    {
      history: false,
      persist: true,
    },
  );
  showToast(gridVisible ? "Grid shown" : "Grid hidden");
}

function applyStylePatch(patch: Partial<DiagramElement["style"]>) {
  const board = appState.activeBoard;
  if (!board || selectedIds.size === 0) {
    return;
  }

  void boardService.replaceActiveBoard(
    commandService.updateElements(board, stylePatchesForSelection(board, selectedIds, patch)),
  );
}

function toggleBoldText() {
  const first = selectedStyleElement();
  if (!first) {
    return;
  }

  applyStylePatch({
    fontWeight: first.style.fontWeight === "bold" ? "normal" : "bold",
  });
}

function toggleItalicText() {
  const first = selectedStyleElement();
  if (!first) {
    return;
  }

  applyStylePatch({
    fontStyle: first.style.fontStyle === "italic" ? "normal" : "italic",
  });
}

function applyLineStyle(strokeStyle: DiagramElement["style"]["strokeStyle"]) {
  const board = appState.activeBoard;
  if (!board || selectedIds.size === 0) {
    return;
  }

  const selectedLines = board.elements.filter(
    (element) =>
      selectedIds.has(element.id) &&
      (element.type === "arrow" || element.type === "draw") &&
      !isElementLocked(element),
  );
  if (selectedLines.length === 0) {
    return;
  }

  void boardService.replaceActiveBoard(
    commandService.updateElements(
      board,
      selectedLines.map((element) => ({
        id: element.id,
        patch: {
          style: {
            ...element.style,
            strokeStyle,
          },
        } as Partial<DiagramElement>,
      })),
    ),
  );
}

function applyArrowHead(arrowHead: ArrowHead) {
  const board = appState.activeBoard;
  if (!board || selectedIds.size === 0) {
    return;
  }

  const selectedArrows = board.elements.filter(
    (element): element is ArrowElement =>
      selectedIds.has(element.id) && element.type === "arrow" && !isElementLocked(element),
  );
  if (selectedArrows.length === 0) {
    return;
  }

  void boardService.replaceActiveBoard(
    commandService.updateElements(
      board,
      selectedArrows.map((element) => ({
        id: element.id,
        patch: {
          arrowHead,
        } as Partial<ArrowElement> as Partial<DiagramElement>,
      })),
    ),
  );
}

function updateElementText(board: DiagramBoard, id: string, text: string) {
  const element = board.elements.find((entry) => entry.id === id);
  if (!element || !hasText(element) || isElementLocked(element)) {
    return Promise.resolve();
  }

  return boardService.replaceActiveBoard(
    commandService.updateElement(board, id, {
      text,
    } as Partial<DiagramElement>),
  );
}

function endpointForArrowOnBoard(
  board: DiagramBoard,
  arrow: ArrowElement,
  endpoint: "start" | "end",
): Point {
  return resolveEndpointForArrowOnBoard(board, arrow, endpoint, geometryContext);
}

function setTool(tool: DiagramTool) {
  if (isShapeTool(tool)) {
    activeShapeTool = tool;
  }
  activeTool = tool;
  if (tool !== "select") {
    selectedTextTargetId = null;
  }
  render();
}

function clearSelection() {
  selectedIds = new Set();
  selectedTextTargetId = null;
}

function confirmDeleteBoard(id: string) {
  const board = appState.boards.find((entry) => entry.id === id);
  const title = board?.title?.trim() || "this canvas";
  const message =
    appState.boards.length <= 1
      ? `Delete "${title}"? A new starter canvas will be created.`
      : `Delete "${title}"? This cannot be undone.`;

  return window.confirm(message);
}

async function deleteBoardFromLibrary(id: string) {
  const createsReplacement = appState.boards.length <= 1;
  const deletesActiveBoard = appState.activeBoard?.id === id;
  await boardService.deleteBoard(id);

  if (createsReplacement || deletesActiveBoard) {
    clearSharedBoardUrl();
  }

  if (createsReplacement) {
    viewportController.fitToContent({ allowZoomIn: false });
  }
}

function selectedStyleElement() {
  const board = appState.activeBoard;
  const id = [...selectedIds][0];
  if (!board || selectedIds.size === 0 || !id) {
    return null;
  }

  return board.elements.find((element) => element.id === id) ?? null;
}

function isGridVisible(board: DiagramBoard | null) {
  return board?.viewport.gridVisible !== false;
}

function updateGridToggle(gridVisible: boolean) {
  const label = gridVisible ? "Hide grid" : "Show grid";
  elements.gridToggleButton.classList.toggle("is-active", gridVisible);
  elements.gridToggleButton.setAttribute("aria-pressed", String(gridVisible));
  elements.gridToggleButton.setAttribute("aria-label", label);
  elements.gridToggleButton.title = label;
}

function retainSelectedTextTarget() {
  if (
    !selectedTextTargetId ||
    selectedIds.size !== 1 ||
    !selectedIds.has(selectedTextTargetId) ||
    !appState.activeBoard?.elements.some(
      (element) => element.id === selectedTextTargetId && hasText(element),
    )
  ) {
    selectedTextTargetId = null;
  }
}

function showToast(message: string) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2200);
}

function renderPersistenceStatus() {
  if (!isSnapshotSharingEnabled()) {
    elements.persistenceStatus.hidden = true;
    lastPersistenceError = "";
    return;
  }

  const status = appState.persistence.status;
  elements.persistenceStatus.hidden = false;
  elements.persistenceStatus.dataset.status = status;
  elements.persistenceStatus.textContent = persistenceLabel(status);
  elements.persistenceStatus.title =
    appState.persistence.message ?? elements.persistenceStatus.textContent;

  if (status === "error" && appState.persistence.message !== lastPersistenceError) {
    lastPersistenceError = appState.persistence.message ?? "Local save failed.";
    showToast(lastPersistenceError);
  }

  if (status !== "error") {
    lastPersistenceError = "";
  }
}

function renderShareBoardButton(board: DiagramBoard | null) {
  elements.shareBoardButton.hidden = !board || !isSnapshotSharingEnabled();
}

function persistenceLabel(status: DiagramAppState["persistence"]["status"]): string {
  if (status === "saving") {
    return "Saving";
  }

  if (status === "saved") {
    return "Local";
  }

  if (status === "error") {
    return "Save failed";
  }

  return "Local";
}

async function publishBoardSnapshot() {
  if (!appState.activeBoard || !boardSnapshotRepository) {
    return;
  }

  const board = await activeBoardReadyForSnapshot();
  if (!board) {
    return;
  }

  const url = createSnapshotShareUrl(board.id).toString();

  try {
    await boardSnapshotRepository.save(board);
  } catch {
    showToast("Snapshot publish failed");
    return;
  }

  setSnapshotShareUrl(board.id);
  try {
    await navigator.clipboard.writeText(url);
    showToast("Snapshot published and link copied");
  } catch {
    window.prompt("Published snapshot link", url);
  }
}

async function activeBoardReadyForSnapshot(): Promise<DiagramBoard | null> {
  const board = appState.activeBoard;
  if (!board) {
    return null;
  }

  const title = elements.boardTitleInput.value;
  const cleanTitle = title.trim() || "Untitled board";
  if (cleanTitle !== board.title) {
    await boardService.renameActiveBoard(title);
  }

  return boardService.getActiveBoardSnapshot();
}

async function loadInitialBoardSnapshot() {
  const id = getInitialSharedBoardId();
  if (!id || !boardSnapshotRepository) {
    return;
  }

  try {
    const board = await boardSnapshotRepository.get(id);
    if (!board) {
      showToast("Published snapshot not found");
      return;
    }

    await boardService.loadBoardSnapshot(board);
    viewportController.fitToContent({ allowZoomIn: false });
    showToast("Snapshot loaded locally");
  } catch {
    showToast("Snapshot load failed");
  }
}

function getInitialSharedBoardId(): string | null {
  if (!isSnapshotSharingEnabled()) {
    return null;
  }

  const url = new URL(window.location.href);
  const id = shareIdToBoardId(url.searchParams.get("board") ?? "");
  return id || null;
}

function createSnapshotShareUrl(boardId: string): URL {
  const url = new URL(window.location.href);
  url.searchParams.set("board", boardIdToShareId(boardId));
  return url;
}

function setSnapshotShareUrl(boardId: string) {
  const url = createSnapshotShareUrl(boardId);
  if (url.toString() !== window.location.href) {
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function clearSharedBoardUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("board")) {
    return;
  }

  url.searchParams.delete("board");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function isSnapshotSharingEnabled(): boolean {
  return (
    runtimeConfig.mode === "api" &&
    runtimeConfig.boardSnapshots.enabled &&
    !!boardSnapshotRepository
  );
}
