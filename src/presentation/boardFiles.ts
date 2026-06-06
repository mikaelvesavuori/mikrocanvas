import type { BoardService } from "../application/index.js";
import { downloadBlob, downloadText, readFileAsText } from "../config/index.js";
import type { DiagramBoard, ExportedDiagramFile } from "../interfaces/index.js";
import type { GeometryContext } from "./canvasGeometry.js";
import { filenameBase } from "./format.js";
import { renderBoardPng } from "./pngExport.js";
import { buildSvg } from "./svgRenderer.js";

export function exportJson(boardService: BoardService, showToast: (message: string) => void) {
  const file = boardService.exportActiveBoard();
  if (!file) {
    return;
  }

  downloadText(
    `${filenameBase(file.board.title)}.mikrocanvas.json`,
    `${JSON.stringify(file, null, 2)}\n`,
  );
  showToast("Board exported");
}

export function exportSvg(
  board: DiagramBoard | null,
  geometry: GeometryContext,
  showToast: (message: string) => void,
) {
  if (!board) {
    return;
  }

  downloadText(`${filenameBase(board.title)}.svg`, buildSvg(board, geometry), "image/svg+xml");
  showToast("SVG exported");
}

export async function exportPng(
  board: DiagramBoard | null,
  geometry: GeometryContext,
  showToast: (message: string) => void,
) {
  if (!board) {
    return;
  }

  try {
    const png = await renderBoardPng(board, geometry);
    downloadBlob(`${filenameBase(board.title)}.png`, png);
    showToast("PNG exported");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "PNG export failed");
  }
}

export async function importBoard(
  fileInput: HTMLInputElement,
  boardService: BoardService,
  clearSelection: () => void,
  showToast: (message: string) => void,
  afterImport: () => void = () => undefined,
) {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) {
    return;
  }

  try {
    const text = await readFileAsText(file);
    const parsed = JSON.parse(text) as ExportedDiagramFile;
    await boardService.importBoardFile(parsed);
    clearSelection();
    afterImport();
    showToast("Board imported");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Import failed");
  }
}
