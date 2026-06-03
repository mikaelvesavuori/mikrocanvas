import type { ShapeTool } from "../shared/index.js";

export type DiagramElementType = "sticky" | "text" | "shape" | "arrow" | "draw" | "comment";

export type DiagramShape = ShapeTool;

export type ArrowAnchor = "top" | "right" | "bottom" | "left";

export type ArrowRoute = "straight" | "elbow";

export type ArrowHead = "none" | "start" | "end" | "both";

export type ArrowBinding = {
  elementId: string;
  anchor: ArrowAnchor;
};

export type DiagramTool =
  | "select"
  | "hand"
  | "sticky"
  | "text"
  | DiagramShape
  | "arrow"
  | "draw"
  | "comment";

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Rect = Point & Size;

export type ElementStyle = {
  fill: string;
  stroke: string;
  text: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed";
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
};

export type BaseDiagramElement = {
  id: string;
  type: DiagramElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked?: boolean;
  style: ElementStyle;
  createdAt: string;
  updatedAt: string;
};

export type StickyElement = BaseDiagramElement & {
  type: "sticky";
  text: string;
};

export type TextElement = BaseDiagramElement & {
  type: "text";
  text: string;
};

export type ShapeElement = BaseDiagramElement & {
  type: "shape";
  shape: DiagramShape;
  text: string;
};

export type ArrowElement = BaseDiagramElement & {
  type: "arrow";
  start: Point;
  end: Point;
  route?: ArrowRoute;
  arrowHead?: ArrowHead;
  bend?: Point;
  labelPosition?: number;
  labelOffset?: Point;
  startBinding?: ArrowBinding;
  endBinding?: ArrowBinding;
  text: string;
};

export type DrawElement = BaseDiagramElement & {
  type: "draw";
  points: Point[];
};

export type CommentElement = BaseDiagramElement & {
  type: "comment";
  text: string;
};

export type DiagramElement =
  | StickyElement
  | TextElement
  | ShapeElement
  | ArrowElement
  | DrawElement
  | CommentElement;

export type DiagramViewport = {
  x: number;
  y: number;
  zoom: number;
  gridVisible?: boolean;
};

export type DiagramBoard = {
  id: string;
  title: string;
  elements: DiagramElement[];
  viewport: DiagramViewport;
  createdAt: string;
  updatedAt: string;
};

export type DiagramBoardSummary = {
  id: string;
  title: string;
  elementCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DiagramPersistenceState = {
  status: "error" | "idle" | "saved" | "saving";
  message?: string;
  updatedAt?: string;
};

export type DiagramAppState = {
  boards: DiagramBoardSummary[];
  activeBoard: DiagramBoard | null;
  storageAvailable: boolean;
  persistence: DiagramPersistenceState;
  canUndo: boolean;
  canRedo: boolean;
};

export type ExportedDiagramFile = {
  format: "mikrocanvas.board";
  version: 1;
  exportedAt: string;
  board: DiagramBoard;
};
