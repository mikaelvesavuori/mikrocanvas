import type {
  ArrowAnchor,
  ArrowElement,
  DiagramBoard,
  DiagramViewport,
  Point,
  Rect,
} from "../interfaces/index.js";

export type Interaction =
  | {
      kind: "pan";
      pointerId: number;
      startScreen: Point;
      startBoard: DiagramBoard;
      viewport: DiagramViewport;
    }
  | {
      kind: "drag";
      pointerId: number;
      startWorld: Point;
      startBoard: DiagramBoard;
      historyBoard: DiagramBoard;
      ids: string[];
    }
  | {
      kind: "resize";
      pointerId: number;
      startWorld: Point;
      startBoard: DiagramBoard;
      id: string;
      rect: Rect;
    }
  | {
      kind: "arrowHandle";
      pointerId: number;
      startBoard: DiagramBoard;
      id: string;
      handle: "start" | "end";
      snapTarget?: ConnectionTarget;
    }
  | {
      kind: "arrowRoute";
      pointerId: number;
      startBoard: DiagramBoard;
      startWorld: Point;
      id: string;
      segment?: {
        orientation: "horizontal" | "vertical";
        bend: Point;
      };
    }
  | {
      kind: "arrowLabel";
      pointerId: number;
      startBoard: DiagramBoard;
      id: string;
      pointerOffset: Point;
    }
  | {
      kind: "marquee";
      pointerId: number;
      startWorld: Point;
      currentWorld: Point;
    }
  | {
      kind: "createArrow";
      pointerId: number;
      startWorld: Point;
      currentWorld: Point;
      draft: ArrowElement;
      snapTarget?: ConnectionTarget;
    }
  | {
      kind: "draw";
      pointerId: number;
      points: Point[];
    };

export type ConnectionTarget = {
  elementId: string;
  anchor: ArrowAnchor;
  point: Point;
  bounds: Rect;
  distance: number;
};
