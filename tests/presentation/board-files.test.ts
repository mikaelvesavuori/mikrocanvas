import type { BoardService } from "../../src/application/index.js";
import { Board, DiagramCommandService } from "../../src/domain/index.js";
import type { ExportedDiagramFile } from "../../src/interfaces/index.js";
import type { GeometryContext } from "../../src/presentation/canvasGeometry.js";

const browserConfig = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
  downloadText: vi.fn(),
  readFileAsText: vi.fn(),
}));

vi.mock("../../src/config/index.js", () => browserConfig);

const { exportJson, exportSvg, importBoard } = await import("../../src/presentation/boardFiles.js");

const commandService = new DiagramCommandService();
const geometry: GeometryContext = {
  getElementBounds: (element) => commandService.getElementBounds(element),
  getConnectionPoint: (element, anchor) => commandService.getConnectionPoint(element, anchor),
};

function exportedFile(board = Board.create("Import me")): ExportedDiagramFile {
  return {
    format: "mikrocanvas.board",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    board,
  };
}

describe("board file import and export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports active boards as MikroCanvas JSON", () => {
    const file = exportedFile(Board.create("Product sketch"));
    const showToast = vi.fn();
    const boardService = {
      exportActiveBoard: () => file,
    } as unknown as BoardService;

    exportJson(boardService, showToast);

    expect(browserConfig.downloadText).toHaveBeenCalledWith(
      "product-sketch.mikrocanvas.json",
      `${JSON.stringify(file, null, 2)}\n`,
    );
    expect(showToast).toHaveBeenCalledWith("Board exported");
  });

  it("exports the active board as SVG through shared geometry", () => {
    const board = {
      ...Board.create("Flow"),
      elements: [commandService.createElement("database", { x: 0, y: 0 }, { text: "Data" })],
    };
    const showToast = vi.fn();

    exportSvg(board, geometry, showToast);

    expect(browserConfig.downloadText).toHaveBeenCalledWith(
      "flow.svg",
      expect.stringContaining("<svg"),
      "image/svg+xml",
    );
    expect(String(browserConfig.downloadText.mock.calls[0]?.[1])).toContain('fill="none"');
    expect(showToast).toHaveBeenCalledWith("SVG exported");
  });

  it("imports MikroCanvas JSON files and clears selection", async () => {
    const file = exportedFile();
    const clearSelection = vi.fn();
    const showToast = vi.fn();
    const importBoardFile = vi.fn().mockResolvedValue(undefined);
    const fileInput = {
      files: [{} as File],
      value: "board.mikrocanvas.json",
    } as unknown as HTMLInputElement;
    browserConfig.readFileAsText.mockResolvedValue(JSON.stringify(file));

    await importBoard(
      fileInput,
      { importBoardFile } as unknown as BoardService,
      clearSelection,
      showToast,
    );

    expect(fileInput.value).toBe("");
    expect(importBoardFile).toHaveBeenCalledWith(file);
    expect(clearSelection).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Board imported");
  });
});
