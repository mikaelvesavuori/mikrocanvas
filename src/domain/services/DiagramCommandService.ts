import type {
  ArrowAnchor,
  ArrowBinding,
  ArrowElement,
  ArrowHead,
  DiagramBoard,
  DiagramElement,
  DiagramShape,
  DiagramTool,
  DrawElement,
  ElementStyle,
  Point,
  Rect,
} from "../../interfaces/index.js";
import {
  clone,
  createId,
  isShapeTool,
  nowIso,
  rectFromPoints,
  shapeDefinitions,
  type ShapeTool,
} from "../../shared/index.js";
import { Board } from "../entities/index.js";

const minimumElementSize = 28;
const defaultElementSizes: Record<
  Exclude<DiagramTool, ShapeTool>,
  { width: number; height: number }
> = {
  select: { width: 0, height: 0 },
  hand: { width: 0, height: 0 },
  sticky: { width: 180, height: 150 },
  text: { width: 220, height: 68 },
  arrow: { width: 180, height: 90 },
  draw: { width: 0, height: 0 },
  comment: { width: 180, height: 96 },
};

export const palette = {
  sticky: {
    fill: "#fde68a",
    stroke: "#d97706",
    text: "#1f2937",
    strokeWidth: 1.5,
    strokeStyle: "solid",
    fontSize: 18,
    fontWeight: "normal",
    fontStyle: "normal",
  },
  text: {
    fill: "transparent",
    stroke: "transparent",
    text: "#1f2937",
    strokeWidth: 1.5,
    strokeStyle: "solid",
    fontSize: 22,
    fontWeight: "normal",
    fontStyle: "normal",
  },
  blue: {
    fill: "#dbeafe",
    stroke: "#2563eb",
    text: "#1e293b",
    strokeWidth: 1.8,
    strokeStyle: "solid",
    fontSize: 17,
    fontWeight: "normal",
    fontStyle: "normal",
  },
  mint: {
    fill: "#d1fae5",
    stroke: "#059669",
    text: "#1e293b",
    strokeWidth: 1.8,
    strokeStyle: "solid",
    fontSize: 17,
    fontWeight: "normal",
    fontStyle: "normal",
  },
  rose: {
    fill: "#ffe4e6",
    stroke: "#e11d48",
    text: "#1e293b",
    strokeWidth: 1.8,
    strokeStyle: "solid",
    fontSize: 17,
    fontWeight: "normal",
    fontStyle: "normal",
  },
  ink: {
    fill: "transparent",
    stroke: "#334155",
    text: "#1e293b",
    strokeWidth: 2.2,
    strokeStyle: "solid",
    fontSize: 16,
    fontWeight: "normal",
    fontStyle: "normal",
  },
  comment: {
    fill: "#ffffff",
    stroke: "#8b5cf6",
    text: "#1f2937",
    strokeWidth: 1.6,
    strokeStyle: "solid",
    fontSize: 14,
    fontWeight: "normal",
    fontStyle: "normal",
  },
} satisfies Record<string, ElementStyle>;

export type CreateElementOptions = {
  id?: string;
  now?: string;
  text?: string;
  style?: Partial<ElementStyle>;
  size?: Partial<{ width: number; height: number }>;
};

export class DiagramCommandService {
  createElement(
    tool: DiagramTool,
    point: Point,
    options: CreateElementOptions = {},
  ): DiagramElement {
    const now = options.now ?? nowIso();
    const size = {
      ...this.defaultSizeForTool(tool),
      ...options.size,
    };

    const base = {
      id: options.id ?? createId("el"),
      x: Math.round(point.x),
      y: Math.round(point.y),
      width: Math.max(minimumElementSize, Math.round(size.width)),
      height: Math.max(minimumElementSize, Math.round(size.height)),
      rotation: 0,
      style: this.mergeStyle(this.defaultStyleForTool(tool), options.style),
      createdAt: now,
      updatedAt: now,
    };

    if (tool === "sticky") {
      return { ...base, type: "sticky", text: options.text ?? "New thought" };
    }

    if (tool === "text") {
      return { ...base, type: "text", text: options.text ?? "Text" };
    }

    if (tool === "comment") {
      return { ...base, type: "comment", text: options.text ?? "Comment" };
    }

    if (tool === "arrow") {
      const end = {
        x: base.x + size.width,
        y: base.y + size.height,
      };
      return {
        ...base,
        type: "arrow",
        width: Math.abs(end.x - base.x),
        height: Math.abs(end.y - base.y),
        start: { x: base.x, y: base.y },
        end,
        arrowHead: "end",
        text: options.text ?? "",
      };
    }

    if (tool === "draw") {
      return {
        ...base,
        type: "draw",
        width: 1,
        height: 1,
        points: [point],
      };
    }

    return {
      ...base,
      type: "shape",
      shape: this.shapeFromTool(tool),
      text: options.text ?? "",
    };
  }

  createDrawElement(points: Point[], options: CreateElementOptions = {}): DrawElement {
    const now = options.now ?? nowIso();
    const bounds = rectFromPoints(points);
    return {
      id: options.id ?? createId("el"),
      type: "draw",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rotation: 0,
      points: points.map((point) => ({
        x: Math.round(point.x),
        y: Math.round(point.y),
      })),
      style: this.mergeStyle(palette.ink, options.style),
      createdAt: now,
      updatedAt: now,
    };
  }

  addElement(board: DiagramBoard, element: DiagramElement, now = nowIso()): DiagramBoard {
    return Board.touch(
      {
        ...board,
        elements: [...board.elements, this.touchElement(element, now)],
      },
      now,
    );
  }

  updateElement(
    board: DiagramBoard,
    elementId: string,
    patch: Partial<DiagramElement>,
    now = nowIso(),
  ): DiagramBoard {
    const target = board.elements.find((element) => element.id === elementId);
    if (!target || (target.locked && !isLockOnlyPatch(patch))) {
      return board;
    }

    return Board.touch(
      {
        ...board,
        elements: board.elements.map((element) =>
          element.id === elementId
            ? this.normalizeElement({
                ...element,
                ...patch,
                updatedAt: now,
              } as DiagramElement)
            : element,
        ),
      },
      now,
    );
  }

  updateElements(
    board: DiagramBoard,
    patches: Array<{ id: string; patch: Partial<DiagramElement> }>,
    now = nowIso(),
  ): DiagramBoard {
    const patchMap = new Map(patches.map((entry) => [entry.id, entry.patch]));
    const hasMutablePatch = board.elements.some((element) => {
      const patch = patchMap.get(element.id);
      return patch && (!element.locked || isLockOnlyPatch(patch));
    });
    if (!hasMutablePatch) {
      return board;
    }

    return Board.touch(
      {
        ...board,
        elements: board.elements.map((element) => {
          const patch = patchMap.get(element.id);
          return patch && (!element.locked || isLockOnlyPatch(patch))
            ? this.normalizeElement({
                ...element,
                ...patch,
                updatedAt: now,
              } as DiagramElement)
            : element;
        }),
      },
      now,
    );
  }

  removeElements(board: DiagramBoard, elementIds: string[], now = nowIso()): DiagramBoard {
    const idSet = new Set(elementIds);
    const hasRemovableElement = board.elements.some(
      (element) => idSet.has(element.id) && !element.locked,
    );
    if (!hasRemovableElement) {
      return board;
    }

    return Board.touch(
      {
        ...board,
        elements: board.elements.filter((element) => !idSet.has(element.id) || element.locked),
      },
      now,
    );
  }

  moveElements(
    board: DiagramBoard,
    elementIds: string[],
    delta: Point,
    now = nowIso(),
  ): DiagramBoard {
    const idSet = new Set(
      elementIds.filter((id) => !board.elements.find((element) => element.id === id)?.locked),
    );
    if (idSet.size === 0) {
      return board;
    }

    const movedElements = board.elements.map((element) => {
      if (!idSet.has(element.id)) {
        return element;
      }

      if (element.type === "arrow") {
        return this.normalizeElement({
          ...element,
          x: element.x + delta.x,
          y: element.y + delta.y,
          start: {
            x: element.start.x + delta.x,
            y: element.start.y + delta.y,
          },
          end: { x: element.end.x + delta.x, y: element.end.y + delta.y },
          startBinding: undefined,
          endBinding: undefined,
          updatedAt: now,
        });
      }

      if (element.type === "draw") {
        return this.normalizeElement({
          ...element,
          x: element.x + delta.x,
          y: element.y + delta.y,
          points: element.points.map((point) => ({
            x: point.x + delta.x,
            y: point.y + delta.y,
          })),
          updatedAt: now,
        });
      }

      return this.normalizeElement({
        ...element,
        x: element.x + delta.x,
        y: element.y + delta.y,
        updatedAt: now,
      });
    });

    return Board.touch(
      {
        ...board,
        elements: this.refreshConnectedArrows(movedElements, idSet, now),
      },
      now,
    );
  }

  resizeElement(board: DiagramBoard, elementId: string, rect: Rect, now = nowIso()): DiagramBoard {
    if (board.elements.find((element) => element.id === elementId)?.locked) {
      return board;
    }

    const elements = board.elements.map((element) =>
      element.id === elementId
        ? this.normalizeElement({
            ...element,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.max(minimumElementSize, Math.round(rect.width)),
            height: Math.max(minimumElementSize, Math.round(rect.height)),
            updatedAt: now,
          } as DiagramElement)
        : element,
    );

    return Board.touch(
      {
        ...board,
        elements: this.refreshConnectedArrows(elements, new Set([elementId]), now),
      },
      now,
    );
  }

  duplicateElements(
    board: DiagramBoard,
    elementIds: string[],
    now = nowIso(),
  ): { board: DiagramBoard; ids: string[] } {
    const idSet = new Set(elementIds);
    const duplicated = this.cloneElements(
      board.elements.filter((element) => idSet.has(element.id) && !element.locked),
      { x: 24, y: 24 },
      now,
    );
    if (duplicated.length === 0) {
      return { board, ids: [] };
    }

    return {
      board: Board.touch({ ...board, elements: [...board.elements, ...duplicated] }, now),
      ids: duplicated.map((element) => element.id),
    };
  }

  pasteElements(
    board: DiagramBoard,
    elements: DiagramElement[],
    offset: Point,
    now = nowIso(),
  ): { board: DiagramBoard; ids: string[] } {
    const pasted = this.cloneElements(elements, offset, now);
    return {
      board: Board.touch({ ...board, elements: [...board.elements, ...pasted] }, now),
      ids: pasted.map((element) => element.id),
    };
  }

  reorderElements(
    board: DiagramBoard,
    elementIds: string[],
    direction: "front" | "back",
    now = nowIso(),
  ): DiagramBoard {
    const idSet = new Set(elementIds);
    const selected = board.elements.filter((element) => idSet.has(element.id) && !element.locked);
    if (selected.length === 0) {
      return board;
    }

    const rest = board.elements.filter((element) => !idSet.has(element.id) || element.locked);
    return Board.touch(
      {
        ...board,
        elements: direction === "front" ? [...rest, ...selected] : [...selected, ...rest],
      },
      now,
    );
  }

  updateBoardViewport(
    board: DiagramBoard,
    x: number,
    y: number,
    zoom: number,
    now = nowIso(),
  ): DiagramBoard {
    return Board.touch(
      {
        ...board,
        viewport: {
          x: Math.round(x),
          y: Math.round(y),
          zoom: Number(zoom.toFixed(3)),
          gridVisible: board.viewport.gridVisible,
        },
      },
      now,
    );
  }

  updateBoardGridVisibility(
    board: DiagramBoard,
    gridVisible: boolean,
    now = nowIso(),
  ): DiagramBoard {
    return Board.touch(
      {
        ...board,
        viewport: {
          ...board.viewport,
          gridVisible,
        },
      },
      now,
    );
  }

  getElementBounds(element: DiagramElement): Rect {
    if (element.type === "arrow") {
      return rectFromPoints([element.start, element.end, ...(element.bend ? [element.bend] : [])]);
    }

    if (element.type === "draw") {
      return rectFromPoints(element.points);
    }

    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
  }

  getConnectionPoint(element: DiagramElement, anchor: ArrowAnchor): Point | null {
    if (element.type === "arrow" || element.type === "draw") {
      return null;
    }

    const bounds = this.getElementBounds(element);
    if (anchor === "top") {
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    }

    if (anchor === "right") {
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    }

    if (anchor === "bottom") {
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    }

    return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  }

  normalizeBoard(board: DiagramBoard): DiagramBoard {
    return {
      ...board,
      viewport: {
        ...Board.defaultViewport(),
        ...board.viewport,
        gridVisible: board.viewport.gridVisible !== false,
      },
      elements: board.elements.map((element) => this.normalizeElement(element)),
    };
  }

  private defaultStyleForTool(tool: DiagramTool): ElementStyle {
    if (tool === "sticky") {
      return palette.sticky;
    }

    if (tool === "text") {
      return palette.text;
    }

    if (tool === "comment") {
      return palette.comment;
    }

    if (tool === "arrow" || tool === "draw") {
      return palette.ink;
    }

    if (isShapeTool(tool)) {
      return palette[shapeDefinitions[tool].palette];
    }

    return palette.blue;
  }

  private defaultSizeForTool(tool: DiagramTool): { width: number; height: number } {
    if (isShapeTool(tool)) {
      return shapeDefinitions[tool].defaultSize;
    }

    return defaultElementSizes[tool];
  }

  private shapeFromTool(tool: DiagramTool): DiagramShape {
    if (isShapeTool(tool)) {
      return tool;
    }

    return "rectangle";
  }

  private mergeStyle(style: ElementStyle, patch: Partial<ElementStyle> | undefined): ElementStyle {
    return {
      ...style,
      ...patch,
    };
  }

  private touchElement<T extends DiagramElement>(element: T, now: string): T {
    return {
      ...element,
      updatedAt: now,
    };
  }

  private normalizeElement<T extends DiagramElement>(element: T): T {
    if (element.type === "arrow") {
      const arrow = element as ArrowElement;
      return {
        ...arrow,
        style: this.normalizeStyle(arrow.style),
        x: Math.min(arrow.start.x, arrow.end.x),
        y: Math.min(arrow.start.y, arrow.end.y),
        width: Math.max(1, Math.abs(arrow.end.x - arrow.start.x)),
        height: Math.max(1, Math.abs(arrow.end.y - arrow.start.y)),
        arrowHead: normalizeArrowHead(arrow.arrowHead),
        labelPosition:
          arrow.labelPosition === undefined
            ? undefined
            : Math.max(0, Math.min(1, arrow.labelPosition)),
      } as T;
    }

    if (element.type === "draw") {
      const draw = element as DrawElement;
      const bounds = rectFromPoints(draw.points);
      return {
        ...draw,
        style: this.normalizeStyle(draw.style),
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      } as T;
    }

    return {
      ...element,
      style: this.normalizeStyle(element.style),
      width: Math.max(minimumElementSize, element.width),
      height: Math.max(minimumElementSize, element.height),
    };
  }

  private normalizeStyle(style: ElementStyle): ElementStyle {
    return {
      ...style,
      strokeStyle: style.strokeStyle ?? "solid",
      fontWeight: style.fontWeight === "bold" ? "bold" : "normal",
      fontStyle: style.fontStyle === "italic" ? "italic" : "normal",
    };
  }

  private cloneElements(elements: DiagramElement[], offset: Point, now: string): DiagramElement[] {
    const idMap = new Map(elements.map((element) => [element.id, createId("el")]));

    return elements.map((element) => {
      const next = clone(element);
      next.id = idMap.get(element.id) ?? createId("el");
      next.x += offset.x;
      next.y += offset.y;
      next.createdAt = now;
      next.updatedAt = now;

      if (next.type === "arrow") {
        next.start = {
          x: next.start.x + offset.x,
          y: next.start.y + offset.y,
        };
        next.end = {
          x: next.end.x + offset.x,
          y: next.end.y + offset.y,
        };
        if (next.bend) {
          next.bend = {
            x: next.bend.x + offset.x,
            y: next.bend.y + offset.y,
          };
        }
        next.startBinding = this.remapBinding(next.startBinding, idMap);
        next.endBinding = this.remapBinding(next.endBinding, idMap);
      }

      if (next.type === "draw") {
        next.points = next.points.map((point) => ({
          x: point.x + offset.x,
          y: point.y + offset.y,
        }));
      }

      return next;
    });
  }

  private remapBinding(
    binding: ArrowBinding | undefined,
    idMap: Map<string, string>,
  ): ArrowBinding | undefined {
    if (!binding) {
      return undefined;
    }

    const elementId = idMap.get(binding.elementId);
    return elementId ? { ...binding, elementId } : undefined;
  }

  private refreshConnectedArrows(
    elements: DiagramElement[],
    changedIds: Set<string>,
    now: string,
  ): DiagramElement[] {
    const elementMap = new Map(elements.map((element) => [element.id, element]));

    return elements.map((element) => {
      if (element.type !== "arrow") {
        return element;
      }

      let next = element;
      if (element.startBinding && changedIds.has(element.startBinding.elementId)) {
        const target = elementMap.get(element.startBinding.elementId);
        const point = target ? this.getConnectionPoint(target, element.startBinding.anchor) : null;
        if (point) {
          next = { ...next, start: point, updatedAt: now };
        }
      }

      if (element.endBinding && changedIds.has(element.endBinding.elementId)) {
        const target = elementMap.get(element.endBinding.elementId);
        const point = target ? this.getConnectionPoint(target, element.endBinding.anchor) : null;
        if (point) {
          next = { ...next, end: point, updatedAt: now };
        }
      }

      return this.normalizeElement(next);
    });
  }
}

function normalizeArrowHead(arrowHead: ArrowHead | undefined): ArrowHead {
  return arrowHead === "none" ||
    arrowHead === "start" ||
    arrowHead === "end" ||
    arrowHead === "both"
    ? arrowHead
    : "end";
}

function isLockOnlyPatch(patch: Partial<DiagramElement>) {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === "locked";
}
