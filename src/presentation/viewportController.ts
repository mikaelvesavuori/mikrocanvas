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

type TouchGesture = {
  startDistance: number;
  startViewport: DiagramViewport;
  startWorldAtCenter: Point;
};

export class ViewportController {
  private readonly touchPointers = new Map<number, Point>();
  private touchGesture: TouchGesture | null = null;
  private suppressTouchPointers = false;

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

  handlePointerDown(event: PointerEvent) {
    if (event.pointerType !== "touch") {
      return false;
    }

    this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touchPointers.size >= 2) {
      this.suppressTouchPointers = true;
      this.startTouchGesture();
      this.capturePointer(event);
      event.preventDefault();
      return true;
    }

    return this.suppressTouchPointers;
  }

  handlePointerMove(event: PointerEvent) {
    if (event.pointerType !== "touch" || !this.touchPointers.has(event.pointerId)) {
      return false;
    }

    this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touchGesture && this.touchPointers.size >= 2) {
      this.applyTouchGesture();
      event.preventDefault();
      return true;
    }

    if (this.suppressTouchPointers) {
      event.preventDefault();
      return true;
    }

    return false;
  }

  handlePointerUp(event: PointerEvent) {
    if (event.pointerType !== "touch") {
      return false;
    }

    const handled = this.suppressTouchPointers || this.touchGesture !== null;
    this.touchPointers.delete(event.pointerId);
    if (this.touchPointers.size >= 2) {
      this.startTouchGesture();
    } else {
      this.touchGesture = null;
    }

    if (handled && this.touchPointers.size === 0) {
      this.suppressTouchPointers = false;
      this.persistViewport();
    } else if (this.touchPointers.size === 0) {
      this.suppressTouchPointers = false;
    }

    if (handled) {
      event.preventDefault();
    }
    return handled;
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

  private startTouchGesture() {
    const board = this.options.getBoard();
    const points = primaryTouchPoints(this.touchPointers);
    if (!board || points.length < 2) {
      return;
    }

    const center = touchCenter(points);
    const rect = this.options.stage.getBoundingClientRect();
    this.touchGesture = {
      startDistance: touchDistance(points),
      startViewport: board.viewport,
      startWorldAtCenter: {
        x: (center.x - rect.left - board.viewport.x) / board.viewport.zoom,
        y: (center.y - rect.top - board.viewport.y) / board.viewport.zoom,
      },
    };
  }

  private applyTouchGesture() {
    const board = this.options.getBoard();
    const points = primaryTouchPoints(this.touchPointers);
    if (!board || !this.touchGesture || points.length < 2) {
      return;
    }

    const rect = this.options.stage.getBoundingClientRect();
    const center = touchCenter(points);
    const zoomFactor = touchDistance(points) / Math.max(1, this.touchGesture.startDistance);
    const zoom = clamp(this.touchGesture.startViewport.zoom * zoomFactor, minimumZoom, maximumZoom);
    const x = center.x - rect.left - this.touchGesture.startWorldAtCenter.x * zoom;
    const y = center.y - rect.top - this.touchGesture.startWorldAtCenter.y * zoom;
    void this.options.boardService.replaceActiveBoard(
      this.options.commandService.updateBoardViewport(board, x, y, zoom),
      {
        history: false,
        persist: false,
      },
    );
  }

  private persistViewport() {
    const board = this.options.getBoard();
    if (!board) {
      return;
    }

    void this.options.boardService.replaceActiveBoard(board, {
      history: false,
      persist: true,
    });
  }

  private capturePointer(event: PointerEvent) {
    try {
      this.options.stage.setPointerCapture(event.pointerId);
    } catch {
      // Touch gestures still work if the browser has already released this pointer.
    }
  }
}

function primaryTouchPoints(touchPointers: Map<number, Point>) {
  return [...touchPointers.values()].slice(0, 2);
}

function touchCenter(points: Point[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function touchDistance(points: Point[]) {
  const [first, second] = points;
  if (!first || !second) {
    return 1;
  }

  return Math.hypot(second.x - first.x, second.y - first.y);
}
