import type { BoardService } from "../application/index.js";
import type { DiagramCommandService } from "../domain/index.js";
import type {
  ArrowAnchor,
  ArrowBinding,
  ArrowElement,
  DiagramBoard,
  DiagramElement,
  DiagramTool,
  Point,
} from "../interfaces/index.js";
import {
  distance,
  isShapeTool,
  normalizeRect,
  rectFromPoints,
  rectsIntersect,
} from "../shared/index.js";
import {
  arrowLabelPlacementForPoint,
  arrowLabelRect,
  arrowPathPoints,
  bindingFromTarget,
  elementContainsPoint,
  elementIdAtWorldPoint,
  endpointForArrowOnBoard,
  type GeometryContext,
  getNearestConnectionTarget,
} from "./canvasGeometry.js";
import { hasText } from "./format.js";
import { canvasGridSize } from "./grid.js";
import type { Interaction } from "./interaction.js";
import { isElementLocked, toggleSelection } from "./selectionModel.js";

type CanvasPointerControllerOptions = {
  stage: HTMLElement;
  svg: SVGSVGElement;
  inlineEditor: HTMLTextAreaElement;
  boardService: BoardService;
  commandService: DiagramCommandService;
  geometry: GeometryContext;
  getActiveTool: () => DiagramTool;
  getArrowRoute: () => ArrowElement["route"];
  getBoard: () => DiagramBoard | null;
  getSelectedIds: () => Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  selectTextTarget: (id: string | null) => void;
  isSpacePressed: () => boolean;
  setTool: (tool: DiagramTool) => void;
  openInlineEditor: (id: string) => void;
  closeInlineEditor: () => void;
  render: () => void;
};

type InteractionOf<K extends Interaction["kind"]> = Extract<Interaction, { kind: K }>;
type TransformInteraction = InteractionOf<
  "drag" | "resize" | "arrowHandle" | "arrowLabel" | "arrowRoute"
>;
type ArrowEndpointCandidate = {
  point: Point;
  binding?: ArrowBinding;
  center?: Point;
};
const arrowAnchors: ArrowAnchor[] = ["top", "right", "bottom", "left"];

export class CanvasPointerController {
  private currentInteraction: Interaction | null = null;

  constructor(private readonly options: CanvasPointerControllerOptions) {}

  get interaction() {
    return this.currentInteraction;
  }

  handlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || !this.options.getBoard()) {
      return;
    }

    if (event.target instanceof Node && this.options.inlineEditor.contains(event.target)) {
      return;
    }

    this.options.closeInlineEditor();
    this.options.selectTextTarget(null);
    const target = event.target instanceof Element ? event.target : null;
    const resizeId = target?.closest<SVGElement>("[data-resize-id]")?.dataset.resizeId;
    const arrowHandleElement = target?.closest<SVGElement>("[data-arrow-handle]");
    const arrowLabelId = target?.closest<SVGElement>("[data-arrow-label-id]")?.dataset.arrowLabelId;
    const worldPoint = this.screenToWorld(event);
    const board = this.options.boardService.getActiveBoardSnapshot();
    if (!board) {
      return;
    }

    const activeTool = this.options.getActiveTool();
    const elementId = this.elementIdForPointer(board, worldPoint, event);

    if (
      event.detail > 1 &&
      activeTool === "select" &&
      this.handleSelectDoubleClick(board, elementId, arrowLabelId, event)
    ) {
      return;
    }

    this.options.stage.setPointerCapture(event.pointerId);

    if (
      arrowLabelId &&
      activeTool === "select" &&
      this.beginArrowLabelDrag(board, arrowLabelId, worldPoint, event.pointerId)
    ) {
      return;
    }

    if (resizeId && !board.elements.find((element) => element.id === resizeId)?.locked) {
      this.beginResize(board, resizeId, worldPoint, event.pointerId);
      return;
    }

    if (activeTool === "select" && arrowHandleElement?.dataset.arrowId) {
      const arrowHandle = arrowHandleElement.dataset.arrowHandle;
      const arrow = board.elements.find(
        (element) => element.id === arrowHandleElement.dataset.arrowId,
      );
      if (
        (arrowHandle === "start" || arrowHandle === "end") &&
        arrow?.type === "arrow" &&
        !arrow.locked
      ) {
        this.beginArrowHandleDrag(
          board,
          arrowHandleElement.dataset.arrowId,
          arrowHandle,
          worldPoint,
          event,
        );
        return;
      }
    }

    if (activeTool === "hand" || this.options.isSpacePressed()) {
      this.beginPan(board, event);
      return;
    }

    if (elementId && activeTool === "select") {
      const element = board.elements.find((entry) => entry.id === elementId);
      if (element?.type === "arrow" && !element.locked && this.canAdjustArrowRoute(element)) {
        this.beginArrowRouteDrag(board, element.id, event);
        return;
      }

      this.startElementDrag(elementId, board, worldPoint, event);
      return;
    }

    if (activeTool === "select") {
      this.beginMarquee(worldPoint, event.pointerId);
      return;
    }

    if (activeTool === "arrow") {
      this.beginArrowCreation(board, worldPoint, event.pointerId);
      return;
    }

    if (activeTool === "draw") {
      this.beginDraw(worldPoint, event.pointerId);
      return;
    }

    this.createElementAt(activeTool, worldPoint);
  }

  handlePointerMove(event: PointerEvent) {
    if (
      !this.currentInteraction ||
      !this.options.getBoard() ||
      this.currentInteraction.pointerId !== event.pointerId
    ) {
      return;
    }

    const current = this.currentInteraction;
    const worldPoint = this.screenToWorld(event);
    switch (current.kind) {
      case "pan":
        this.handlePanMove(current, event);
        return;
      case "drag":
        this.handleDragMove(current, worldPoint, event);
        return;
      case "resize":
        this.handleResizeMove(current, worldPoint);
        return;
      case "arrowHandle":
        this.handleArrowHandleMove(current, worldPoint);
        return;
      case "arrowRoute":
        this.handleArrowRouteMove(current, worldPoint);
        return;
      case "arrowLabel":
        this.handleArrowLabelMove(current, worldPoint);
        return;
      case "marquee":
        this.handleMarqueeMove(current, worldPoint);
        return;
      case "createArrow":
        this.handleCreateArrowMove(current, worldPoint);
        return;
      case "draw":
        this.handleDrawMove(current, worldPoint);
    }
  }

  handlePointerUp(event: PointerEvent) {
    if (!this.currentInteraction || this.currentInteraction.pointerId !== event.pointerId) {
      return;
    }

    this.options.stage.releasePointerCapture(event.pointerId);
    this.options.stage.classList.remove("is-dragging", "is-panning");
    const current = this.currentInteraction;
    this.currentInteraction = null;

    switch (current.kind) {
      case "drag":
      case "resize":
      case "arrowHandle":
      case "arrowRoute":
      case "arrowLabel":
        this.commitTransformInteraction(current);
        return;
      case "pan":
        this.finishPan();
        return;
      case "marquee":
        this.finishMarquee(current);
        return;
      case "createArrow":
        this.finishCreateArrow(current);
        return;
      case "draw":
        this.finishDraw(current);
    }
  }

  private beginArrowLabelDrag(
    board: DiagramBoard,
    arrowLabelId: string,
    worldPoint: Point,
    pointerId: number,
  ) {
    const arrow = board.elements.find((element) => element.id === arrowLabelId);
    if (arrow?.type !== "arrow" || arrow.locked) {
      return false;
    }

    const start = endpointForArrowOnBoard(board, arrow, "start", this.options.geometry);
    const end = endpointForArrowOnBoard(board, arrow, "end", this.options.geometry);
    const label = arrowLabelRect(arrow, start, end);
    this.options.setSelectedIds(new Set([arrowLabelId]));
    this.options.selectTextTarget(arrowLabelId);
    this.currentInteraction = {
      kind: "arrowLabel",
      pointerId,
      startBoard: board,
      id: arrowLabelId,
      pointerOffset: {
        x: label.x + label.width / 2 - worldPoint.x,
        y: label.y + label.height / 2 - worldPoint.y,
      },
    };
    this.options.stage.classList.add("is-dragging");
    this.options.render();
    return true;
  }

  private beginResize(board: DiagramBoard, resizeId: string, worldPoint: Point, pointerId: number) {
    const element = board.elements.find((entry) => entry.id === resizeId);
    if (!element || element.locked) {
      return;
    }

    this.currentInteraction = {
      kind: "resize",
      pointerId,
      startWorld: worldPoint,
      startBoard: board,
      id: resizeId,
      rect: this.options.commandService.getElementBounds(element),
    };
  }

  private beginArrowHandleDrag(
    board: DiagramBoard,
    arrowId: string,
    handle: "start" | "end",
    worldPoint: Point,
    event: PointerEvent,
  ) {
    const arrow = board.elements.find((element) => element.id === arrowId);
    if (arrow?.locked) {
      return;
    }

    const boundElementId = this.boundElementIdForArrowHandle(board, arrowId, handle, worldPoint);
    if (boundElementId) {
      this.startElementDrag(boundElementId, board, worldPoint, event);
      return;
    }

    this.currentInteraction = {
      kind: "arrowHandle",
      pointerId: event.pointerId,
      startBoard: board,
      id: arrowId,
      handle,
    };
  }

  private beginArrowRouteDrag(board: DiagramBoard, arrowId: string, event: PointerEvent) {
    const arrow = board.elements.find((element) => element.id === arrowId);
    const worldPoint = this.screenToWorld(event);
    if (event.shiftKey) {
      this.options.setSelectedIds(toggleSelection(this.options.getSelectedIds(), arrowId));
    } else if (!this.options.getSelectedIds().has(arrowId)) {
      this.options.setSelectedIds(new Set([arrowId]));
    }

    this.currentInteraction = {
      kind: "arrowRoute",
      pointerId: event.pointerId,
      startBoard: board,
      startWorld: worldPoint,
      id: arrowId,
      segment:
        arrow?.type === "arrow"
          ? this.arrowRouteSegmentForPoint(board, arrow, worldPoint)
          : undefined,
    };
    this.options.stage.classList.add("is-dragging");
    this.options.render();
  }

  private beginPan(board: DiagramBoard, event: PointerEvent) {
    this.currentInteraction = {
      kind: "pan",
      pointerId: event.pointerId,
      startScreen: { x: event.clientX, y: event.clientY },
      startBoard: board,
      viewport: board.viewport,
    };
    this.options.stage.classList.add("is-panning");
  }

  private beginMarquee(worldPoint: Point, pointerId: number) {
    this.options.setSelectedIds(new Set());
    this.currentInteraction = {
      kind: "marquee",
      pointerId,
      startWorld: worldPoint,
      currentWorld: worldPoint,
    };
    this.options.render();
  }

  private beginArrowCreation(board: DiagramBoard, worldPoint: Point, pointerId: number) {
    this.options.setSelectedIds(new Set());
    const startTarget = getNearestConnectionTarget(board, worldPoint, this.options.geometry);
    const start = startTarget?.point ?? worldPoint;
    const draft = this.options.commandService.createElement("arrow", start, {
      size: { width: 1, height: 1 },
    }) as ArrowElement;
    draft.route = this.options.getArrowRoute();
    if (startTarget) {
      draft.startBinding = bindingFromTarget(startTarget);
    }
    this.currentInteraction = {
      kind: "createArrow",
      pointerId,
      startWorld: start,
      currentWorld: start,
      draft,
    };
    this.options.render();
  }

  private beginDraw(worldPoint: Point, pointerId: number) {
    this.options.setSelectedIds(new Set());
    this.currentInteraction = {
      kind: "draw",
      pointerId,
      points: [worldPoint],
    };
    this.options.render();
  }

  private handlePanMove(current: InteractionOf<"pan">, event: PointerEvent) {
    const delta = {
      x: event.clientX - current.startScreen.x,
      y: event.clientY - current.startScreen.y,
    };
    const next = this.options.commandService.updateBoardViewport(
      current.startBoard,
      current.viewport.x + delta.x,
      current.viewport.y + delta.y,
      current.viewport.zoom,
    );
    void this.options.boardService.replaceActiveBoard(next, {
      history: false,
      persist: false,
    });
  }

  private handleDragMove(current: InteractionOf<"drag">, worldPoint: Point, event: PointerEvent) {
    const rawDelta = {
      x: worldPoint.x - current.startWorld.x,
      y: worldPoint.y - current.startWorld.y,
    };
    const delta = event.shiftKey ? this.snappedDragDelta(current, rawDelta) : rawDelta;
    const next = this.options.commandService.moveElements(current.startBoard, current.ids, delta);
    void this.options.boardService.replaceActiveBoard(next, {
      history: false,
      persist: false,
    });
  }

  private snappedDragDelta(current: InteractionOf<"drag">, delta: Point): Point {
    const bounds = this.selectionBounds(current.startBoard, current.ids);
    if (!bounds) {
      return delta;
    }

    return {
      x: snapToGrid(bounds.x + delta.x) - bounds.x,
      y: snapToGrid(bounds.y + delta.y) - bounds.y,
    };
  }

  private selectionBounds(board: DiagramBoard, ids: string[]) {
    const selectedBounds = ids
      .map((id) => board.elements.find((element) => element.id === id))
      .filter((element): element is DiagramElement => Boolean(element))
      .map((element) => this.options.geometry.getElementBounds(element));
    if (selectedBounds.length === 0) {
      return null;
    }

    const x = Math.min(...selectedBounds.map((rect) => rect.x));
    const y = Math.min(...selectedBounds.map((rect) => rect.y));
    const right = Math.max(...selectedBounds.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...selectedBounds.map((rect) => rect.y + rect.height));
    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }

  private handleResizeMove(current: InteractionOf<"resize">, worldPoint: Point) {
    const width = current.rect.width + (worldPoint.x - current.startWorld.x);
    const height = current.rect.height + (worldPoint.y - current.startWorld.y);
    const next = this.options.commandService.resizeElement(current.startBoard, current.id, {
      x: current.rect.x,
      y: current.rect.y,
      width,
      height,
    });
    void this.options.boardService.replaceActiveBoard(next, {
      history: false,
      persist: false,
    });
  }

  private handleArrowHandleMove(current: InteractionOf<"arrowHandle">, worldPoint: Point) {
    const target = current.startBoard.elements.find((element) => element.id === current.id);
    if (target?.type !== "arrow") {
      return;
    }

    const snapTarget = getNearestConnectionTarget(
      current.startBoard,
      worldPoint,
      this.options.geometry,
      new Set([current.id]),
    );
    this.currentInteraction = {
      ...current,
      snapTarget: snapTarget ?? undefined,
    };
    const endpoint = snapTarget?.point ?? worldPoint;
    const patch =
      current.handle === "start"
        ? {
            start: endpoint,
            startBinding: snapTarget ? bindingFromTarget(snapTarget) : undefined,
          }
        : {
            end: endpoint,
            endBinding: snapTarget ? bindingFromTarget(snapTarget) : undefined,
          };
    const next = this.options.commandService.updateElement(current.startBoard, current.id, patch);
    void this.options.boardService.replaceActiveBoard(next, {
      history: false,
      persist: false,
    });
  }

  private handleArrowRouteMove(current: InteractionOf<"arrowRoute">, worldPoint: Point) {
    const target = current.startBoard.elements.find((element) => element.id === current.id);
    if (target?.type !== "arrow") {
      return;
    }

    const next = this.options.commandService.updateElement(current.startBoard, current.id, {
      bend: routeDragBend(current, worldPoint),
      route: "elbow",
    } as Partial<ArrowElement> as Partial<DiagramElement>);
    void this.options.boardService.replaceActiveBoard(next, {
      history: false,
      persist: false,
    });
  }

  private canAdjustArrowRoute(arrow: ArrowElement) {
    return Boolean(arrow.startBinding || arrow.endBinding || arrow.route === "elbow");
  }

  private arrowRouteSegmentForPoint(
    board: DiagramBoard,
    arrow: ArrowElement,
    point: Point,
  ): InteractionOf<"arrowRoute">["segment"] {
    const start = endpointForArrowOnBoard(board, arrow, "start", this.options.geometry);
    const end = endpointForArrowOnBoard(board, arrow, "end", this.options.geometry);
    const points = arrowPathPoints(start, end, arrow.route, {
      bend: arrow.bend,
      endAnchor: arrow.endBinding?.anchor,
      startAnchor: arrow.startBinding?.anchor,
    });
    let best:
      | {
          bend: Point;
          distance: number;
          orientation: "horizontal" | "vertical";
        }
      | undefined;

    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (!from || !to) {
        continue;
      }

      const orientation = segmentOrientation(from, to);
      if (!orientation) {
        continue;
      }

      const segmentDistance = pointToSegmentDistance(point, from, to);
      if (!best || segmentDistance < best.distance) {
        best = {
          bend: arrow.bend ?? inferredBendForSegment(from, to, orientation),
          distance: segmentDistance,
          orientation,
        };
      }
    }

    return best
      ? {
          bend: best.bend,
          orientation: best.orientation,
        }
      : undefined;
  }

  private handleArrowLabelMove(current: InteractionOf<"arrowLabel">, worldPoint: Point) {
    const arrow = current.startBoard.elements.find((element) => element.id === current.id);
    if (arrow?.type !== "arrow") {
      return;
    }

    const center = {
      x: worldPoint.x + current.pointerOffset.x,
      y: worldPoint.y + current.pointerOffset.y,
    };
    const placement = arrowLabelPlacementForPoint(
      current.startBoard,
      arrow,
      center,
      this.options.geometry,
    );
    const next = this.options.commandService.updateElement(current.startBoard, current.id, {
      labelPosition: placement.position,
      labelOffset: undefined,
    } as Partial<DiagramElement>);
    void this.options.boardService.replaceActiveBoard(next, {
      history: false,
      persist: false,
    });
  }

  private handleMarqueeMove(current: InteractionOf<"marquee">, worldPoint: Point) {
    this.currentInteraction = {
      ...current,
      currentWorld: worldPoint,
    };
    this.options.render();
  }

  private handleCreateArrowMove(current: InteractionOf<"createArrow">, worldPoint: Point) {
    const board = this.options.getBoard();
    const snapTarget = board
      ? getNearestConnectionTarget(board, worldPoint, this.options.geometry)
      : null;
    this.currentInteraction = {
      ...current,
      currentWorld: snapTarget?.point ?? worldPoint,
      snapTarget: snapTarget ?? undefined,
    };
    this.options.render();
  }

  private handleDrawMove(current: InteractionOf<"draw">, worldPoint: Point) {
    const last = current.points.at(-1);
    if (!last || distance(last, worldPoint) > 3) {
      this.currentInteraction = {
        ...current,
        points: [...current.points, worldPoint],
      };
      this.options.render();
    }
  }

  private commitTransformInteraction(current: TransformInteraction) {
    void this.options.boardService.commitCurrentFrom(
      current.kind === "drag" ? current.historyBoard : current.startBoard,
    );
  }

  private finishPan() {
    const board = this.options.boardService.getActiveBoardSnapshot();
    if (board) {
      void this.options.boardService.replaceActiveBoard(board, {
        history: false,
        persist: true,
      });
    }
  }

  private finishMarquee(current: InteractionOf<"marquee">) {
    const board = this.options.getBoard();
    if (!board) {
      return;
    }

    const rect = normalizeRect(current.startWorld, current.currentWorld);
    const clickTolerance = 2 / board.viewport.zoom;
    if (rect.width <= clickTolerance && rect.height <= clickTolerance) {
      this.options.setSelectedIds(new Set());
      this.options.render();
      return;
    }

    this.options.setSelectedIds(
      new Set(
        board.elements
          .filter((element) =>
            rectsIntersect(rect, this.options.commandService.getElementBounds(element)),
          )
          .map((element) => element.id),
      ),
    );
    this.options.render();
  }

  private finishCreateArrow(current: InteractionOf<"createArrow">) {
    const board = this.options.getBoard();
    if (!board) {
      return;
    }

    const snapTarget = current.snapTarget;
    const end =
      distance(current.startWorld, current.currentWorld) < 10 && !snapTarget
        ? { x: current.startWorld.x + 180, y: current.startWorld.y + 88 }
        : current.currentWorld;
    const arrow = {
      ...current.draft,
      end,
      endBinding: snapTarget ? bindingFromTarget(snapTarget) : undefined,
    };
    this.options.setSelectedIds(new Set([arrow.id]));
    void this.options.boardService
      .replaceActiveBoard(this.options.commandService.addElement(board, arrow))
      .then(() => {
        this.options.setTool("select");
        this.options.render();
      });
  }

  private finishDraw(current: InteractionOf<"draw">) {
    const board = this.options.getBoard();
    if (!board || current.points.length < 2) {
      this.options.render();
      return;
    }

    const draw = this.options.commandService.createDrawElement(current.points);
    this.options.setSelectedIds(new Set([draw.id]));
    void this.options.boardService
      .replaceActiveBoard(this.options.commandService.addElement(board, draw))
      .then(() => {
        this.options.setTool("select");
        this.options.render();
      });
  }

  handleDoubleClick(event: MouseEvent) {
    if (event.target instanceof Node && this.options.inlineEditor.contains(event.target)) {
      return;
    }

    const board = this.options.getBoard();
    if (!board) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const arrowLabelId = target?.closest<SVGElement>("[data-arrow-label-id]")?.dataset.arrowLabelId;
    this.handleSelectDoubleClick(
      board,
      this.elementIdForPointer(board, this.screenToWorld(event), event),
      arrowLabelId,
      event,
    );
  }

  private handleSelectDoubleClick(
    board: DiagramBoard,
    elementId: string | null,
    arrowLabelId: string | undefined,
    event: MouseEvent | PointerEvent,
  ) {
    const textTargetId = arrowLabelId ?? elementId;
    const textTarget = textTargetId
      ? board.elements.find((element) => element.id === textTargetId)
      : null;
    if (arrowLabelId) {
      if (!textTarget?.locked) {
        event.preventDefault();
        this.options.openInlineEditor(arrowLabelId);
      }
      return true;
    }

    if (!elementId) {
      return false;
    }

    const element = board.elements.find((entry) => entry.id === elementId);
    if (!element || element.locked) {
      return true;
    }

    event.preventDefault();
    if (element.type === "arrow") {
      if (!this.tightenArrow(element, board)) {
        this.options.openInlineEditor(element.id);
      }
      return true;
    }

    if (hasText(element)) {
      this.options.openInlineEditor(elementId);
    }
    return true;
  }

  private tightenArrow(arrow: ArrowElement, board: DiagramBoard) {
    this.options.setSelectedIds(new Set([arrow.id]));
    this.options.selectTextTarget(null);
    const patch = this.tightenedArrowPatch(arrow, board);
    if (Object.keys(patch).length === 0) {
      return false;
    }

    void this.options.boardService.replaceActiveBoard(
      this.options.commandService.updateElement(
        board,
        arrow.id,
        patch as Partial<ArrowElement> as Partial<DiagramElement>,
      ),
    );
    return true;
  }

  private tightenedArrowPatch(arrow: ArrowElement, board: DiagramBoard): Partial<ArrowElement> {
    const startCandidates = this.arrowEndpointCandidates(board, arrow, "start");
    const endCandidates = this.arrowEndpointCandidates(board, arrow, "end");
    let best: {
      end: ArrowEndpointCandidate;
      score: number;
      start: ArrowEndpointCandidate;
    } | null = null;

    for (const start of startCandidates) {
      for (const end of endCandidates) {
        const points = arrowPathPoints(start.point, end.point, arrow.route, {
          endAnchor: end.binding?.anchor,
          startAnchor: start.binding?.anchor,
        });
        const score =
          routeScore(points) +
          this.anchorFacingPenalty(start, end) +
          this.anchorFacingPenalty(end, start);
        if (!best || score < best.score) {
          best = { end, score, start };
        }
      }
    }

    const patch: Partial<ArrowElement> = {};
    if (arrow.bend !== undefined) {
      patch.bend = undefined;
    }

    if (best && !pointsEqual(arrow.start, best.start.point)) {
      patch.start = best.start.point;
    }
    if (best && !pointsEqual(arrow.end, best.end.point)) {
      patch.end = best.end.point;
    }
    if (best && !bindingsEqual(arrow.startBinding, best.start.binding)) {
      patch.startBinding = best.start.binding;
    }
    if (best && !bindingsEqual(arrow.endBinding, best.end.binding)) {
      patch.endBinding = best.end.binding;
    }

    return patch;
  }

  private arrowEndpointCandidates(
    board: DiagramBoard,
    arrow: ArrowElement,
    endpoint: "start" | "end",
  ): ArrowEndpointCandidate[] {
    const binding = endpoint === "start" ? arrow.startBinding : arrow.endBinding;
    const target = binding
      ? board.elements.find((element) => element.id === binding.elementId)
      : null;
    if (target && target.type !== "arrow" && target.type !== "draw") {
      const bounds = this.options.geometry.getElementBounds(target);
      const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      return arrowAnchors.flatMap((anchor) => {
        const point = this.options.geometry.getConnectionPoint(target, anchor);
        return point ? [{ binding: { elementId: target.id, anchor }, center, point }] : [];
      });
    }

    return [
      {
        binding,
        point: endpoint === "start" ? arrow.start : arrow.end,
      },
    ];
  }

  private anchorFacingPenalty(candidate: ArrowEndpointCandidate, other: ArrowEndpointCandidate) {
    if (!candidate.binding || !candidate.center) {
      return 0;
    }

    const direction = directionForAnchor(candidate.binding.anchor);
    const otherPoint = other.center ?? other.point;
    const vector = {
      x: otherPoint.x - candidate.center.x,
      y: otherPoint.y - candidate.center.y,
    };
    const vectorLength = Math.hypot(vector.x, vector.y);
    if (vectorLength <= 0.5) {
      return 0;
    }

    const alignment = (direction.x * vector.x + direction.y * vector.y) / vectorLength;
    if (alignment >= 0.35) {
      return 0;
    }

    if (alignment >= 0) {
      return 180;
    }

    return 1000 + Math.abs(alignment) * 400;
  }

  private createElementAt(tool: DiagramTool, point: Point) {
    const board = this.options.getBoard();
    if (!board) {
      return;
    }

    const element = this.createElementForPointer(tool, point);
    this.options.setSelectedIds(new Set([element.id]));
    const nextBoard = this.options.commandService.addElement(board, element);
    if (isShapeTool(tool)) {
      void this.options.boardService.replaceActiveBoard(nextBoard).then(() => {
        this.options.render();
      });
      return;
    }

    if (hasText(element)) {
      void this.options.boardService.replaceActiveBoard(nextBoard).then(() => {
        this.options.setTool("select");
        this.options.openInlineEditor(element.id);
      });
      return;
    }

    void this.options.boardService.replaceActiveBoard(nextBoard).then(() => {
      this.options.setTool("select");
      this.options.render();
    });
  }

  private createElementForPointer(tool: DiagramTool, point: Point): DiagramElement {
    const element = this.options.commandService.createElement(tool, this.snapPoint(point));
    if (!isShapeTool(tool)) {
      return element;
    }

    const origin = this.snapPoint({
      x: point.x - element.width / 2,
      y: point.y - element.height / 2,
    });
    return {
      ...element,
      x: origin.x,
      y: origin.y,
    };
  }

  private elementIdFromEvent(event: Event) {
    for (const item of event.composedPath()) {
      if (!(item instanceof Element)) {
        continue;
      }

      const directId = item.getAttribute("data-element-id");
      if (directId) {
        return directId;
      }

      const closestId = item.closest("[data-element-id]")?.getAttribute("data-element-id");
      if (closestId) {
        return closestId;
      }
    }

    return null;
  }

  private startElementDrag(
    elementId: string,
    board: DiagramBoard,
    worldPoint: Point,
    event: PointerEvent,
  ) {
    if (event.shiftKey) {
      this.options.setSelectedIds(toggleSelection(this.options.getSelectedIds(), elementId));
    } else if (!this.options.getSelectedIds().has(elementId)) {
      this.options.setSelectedIds(new Set([elementId]));
    }

    let startBoard = board;
    let historyBoard = board;
    let dragIds = this.mutableIds(board, [...this.options.getSelectedIds()]);
    if (dragIds.length === 0) {
      this.options.stage.releasePointerCapture(event.pointerId);
      this.options.render();
      return;
    }

    if (event.altKey) {
      const duplicated = this.options.commandService.duplicateElements(board, dragIds);
      if (duplicated.ids.length === 0) {
        this.options.stage.releasePointerCapture(event.pointerId);
        this.options.render();
        return;
      }

      startBoard = duplicated.board;
      historyBoard = board;
      dragIds = duplicated.ids;
      this.options.setSelectedIds(new Set(dragIds));
      void this.options.boardService.replaceActiveBoard(startBoard, {
        history: false,
        persist: false,
      });
    }

    this.currentInteraction = {
      kind: "drag",
      pointerId: event.pointerId,
      startWorld: worldPoint,
      startBoard,
      historyBoard,
      ids: dragIds,
    };
    this.options.stage.classList.add("is-dragging");
    this.options.render();
  }

  private mutableIds(board: DiagramBoard, ids: string[]) {
    return ids.filter((id) => {
      const element = board.elements.find((entry) => entry.id === id);
      return element && !isElementLocked(element);
    });
  }

  private boundElementIdForArrowHandle(
    board: DiagramBoard,
    arrowId: string,
    handle: "start" | "end",
    worldPoint: Point,
  ) {
    const arrow = board.elements.find((element) => element.id === arrowId);
    if (arrow?.type !== "arrow") {
      return null;
    }

    const binding = handle === "start" ? arrow.startBinding : arrow.endBinding;
    const boundElement = binding
      ? board.elements.find((element) => element.id === binding.elementId)
      : null;
    if (!boundElement || boundElement.type === "arrow" || boundElement.type === "draw") {
      return null;
    }

    return elementContainsPoint(board, boundElement, worldPoint, this.options.geometry)
      ? boundElement.id
      : null;
  }

  private elementIdForPointer(board: DiagramBoard, worldPoint: Point, event: Event) {
    const eventElementId = this.elementIdFromEvent(event);
    const eventElement = eventElementId
      ? board.elements.find((element) => element.id === eventElementId)
      : null;
    if (eventElement && eventElement.type !== "arrow") {
      return eventElement.id;
    }

    if (eventElement?.type === "arrow") {
      const coveredElement = [...board.elements]
        .reverse()
        .find(
          (element) =>
            element.id !== eventElement.id &&
            element.type !== "arrow" &&
            element.type !== "draw" &&
            elementContainsPoint(board, element, worldPoint, this.options.geometry),
        );
      if (coveredElement) {
        return coveredElement.id;
      }

      return eventElement.id;
    }

    return elementIdAtWorldPoint(board, worldPoint, this.options.geometry);
  }

  private screenToWorld(event: PointerEvent | MouseEvent): Point {
    const board = this.options.getBoard();
    const rect = this.options.svg.getBoundingClientRect();
    if (!board) {
      return { x: 0, y: 0 };
    }

    return {
      x: (event.clientX - rect.left - board.viewport.x) / board.viewport.zoom,
      y: (event.clientY - rect.top - board.viewport.y) / board.viewport.zoom,
    };
  }

  private snapPoint(point: Point): Point {
    return {
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
  }
}

function routeScore(points: Point[]) {
  const bounds = rectFromPoints(points);
  return (
    polylineLength(points) +
    Math.max(0, points.length - 2) * 15 +
    (bounds.width + bounds.height) * 0.08 +
    bounds.width * bounds.height * 0.0008
  );
}

function snapToGrid(value: number) {
  return Math.round(value / canvasGridSize) * canvasGridSize;
}

function routeDragBend(current: InteractionOf<"arrowRoute">, worldPoint: Point): Point {
  if (!current.segment) {
    return worldPoint;
  }

  const delta = {
    x: worldPoint.x - current.startWorld.x,
    y: worldPoint.y - current.startWorld.y,
  };

  if (current.segment.orientation === "vertical") {
    return {
      x: current.segment.bend.x + delta.x,
      y: current.segment.bend.y,
    };
  }

  return {
    x: current.segment.bend.x,
    y: current.segment.bend.y + delta.y,
  };
}

function inferredBendForSegment(
  from: Point,
  to: Point,
  orientation: "horizontal" | "vertical",
): Point {
  if (orientation === "vertical") {
    return { x: from.x, y: to.y };
  }

  return { x: to.x, y: from.y };
}

function segmentOrientation(from: Point, to: Point): "horizontal" | "vertical" | null {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx <= 0.5 && dy > 0.5) {
    return "vertical";
  }

  if (dy <= 0.5 && dx > 0.5) {
    return "horizontal";
  }

  return null;
}

function pointToSegmentDistance(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return distance(point, from);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
  );
  return distance(point, {
    x: from.x + t * dx,
    y: from.y + t * dy,
  });
}

function polylineLength(points: Point[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

function directionForAnchor(anchor: ArrowAnchor): Point {
  if (anchor === "top") {
    return { x: 0, y: -1 };
  }

  if (anchor === "right") {
    return { x: 1, y: 0 };
  }

  if (anchor === "bottom") {
    return { x: 0, y: 1 };
  }

  return { x: -1, y: 0 };
}

function pointsEqual(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

function bindingsEqual(a: ArrowBinding | undefined, b: ArrowBinding | undefined) {
  return a?.elementId === b?.elementId && a?.anchor === b?.anchor;
}
