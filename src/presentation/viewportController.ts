import type { BoardService } from "../application/index.js";
import type { DiagramCommandService } from "../domain/index.js";
import type { DiagramBoard, DiagramViewport, Point } from "../interfaces/index.js";
import { clamp } from "../shared/index.js";
import { boardBounds, type GeometryContext } from "./canvasGeometry.js";
import { canvasGridSize } from "./grid.js";

const minimumZoom = 0.18;
const maximumZoom = 3.2;

type ViewportControllerOptions = {
  stage: HTMLElement;
  boardService: BoardService;
  commandService: DiagramCommandService;
  geometry: GeometryContext;
  getBoard: () => DiagramBoard | null;
};

type FitToContentOptions = {
  allowZoomIn?: boolean;
};

export class ViewportController {
  constructor(private readonly options: ViewportControllerOptions) {}

  handleWheel(event: WheelEvent) {
    const board = this.options.getBoard();
    if (!board) {
      return;
    }

    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      this.zoomAtScreenPoint(
        { x: event.clientX, y: event.clientY },
        event.deltaY > 0 ? 0.88 : 1.12,
      );
      return;
    }

    const next = this.options.commandService.updateBoardViewport(
      board,
      board.viewport.x - event.deltaX,
      board.viewport.y - event.deltaY,
      board.viewport.zoom,
    );
    void this.options.boardService.replaceActiveBoard(next, {
      history: false,
      persist: true,
    });
  }

  zoomAtCenter(factor: number) {
    const rect = this.options.stage.getBoundingClientRect();
    this.zoomAtScreenPoint(
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      factor,
    );
  }

  fitToContent(options: FitToContentOptions = {}) {
    const board = this.options.getBoard();
    if (!board || board.elements.length === 0) {
      return;
    }

    const bounds = boardBounds(board, this.options.geometry);
    const stageRect = this.options.stage.getBoundingClientRect();
    const padding = 180;
    const zoom = clamp(
      Math.min(
        stageRect.width / (bounds.width + padding),
        stageRect.height / (bounds.height + padding),
      ),
      minimumZoom,
      options.allowZoomIn === false ? 1 : 1.6,
    );
    const x = stageRect.width / 2 - (bounds.x + bounds.width / 2) * zoom;
    const y = stageRect.height / 2 - (bounds.y + bounds.height / 2) * zoom;
    void this.options.boardService.replaceActiveBoard(
      this.options.commandService.updateBoardViewport(board, x, y, zoom),
      {
        history: false,
        persist: true,
      },
    );
  }

  updateGrid(viewport: DiagramViewport) {
    const size = Math.max(8, canvasGridSize * viewport.zoom);
    this.options.stage.style.backgroundSize = `${size}px ${size}px`;
    this.options.stage.style.backgroundPosition = `${viewport.x % size}px ${viewport.y % size}px`;
  }

  private zoomAtScreenPoint(screenPoint: Point, factor: number) {
    const board = this.options.getBoard();
    if (!board) {
      return;
    }

    const rect = this.options.stage.getBoundingClientRect();
    const before = {
      x: (screenPoint.x - rect.left - board.viewport.x) / board.viewport.zoom,
      y: (screenPoint.y - rect.top - board.viewport.y) / board.viewport.zoom,
    };
    const zoom = clamp(board.viewport.zoom * factor, minimumZoom, maximumZoom);
    const x = screenPoint.x - rect.left - before.x * zoom;
    const y = screenPoint.y - rect.top - before.y * zoom;
    void this.options.boardService.replaceActiveBoard(
      this.options.commandService.updateBoardViewport(board, x, y, zoom),
      {
        history: false,
        persist: true,
      },
    );
  }
}
