import type { DiagramBoard, DiagramBoardSummary, DiagramViewport } from "../../interfaces/index.js";
import { clone, createId, nowIso } from "../../shared/index.js";

function defaultViewport(): DiagramViewport {
  return { x: 0, y: 0, zoom: 1, gridVisible: true };
}

function create(title = "Untitled board", now = nowIso()): DiagramBoard {
  return {
    id: createId("board"),
    title,
    elements: [],
    viewport: defaultViewport(),
    createdAt: now,
    updatedAt: now,
  };
}

function toSummary(board: DiagramBoard): DiagramBoardSummary {
  return {
    id: board.id,
    title: board.title,
    elementCount: board.elements.length,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

function cloneBoard(board: DiagramBoard): DiagramBoard {
  return clone(board);
}

function touch(board: DiagramBoard, now = nowIso()): DiagramBoard {
  return {
    ...board,
    updatedAt: now,
  };
}

export const Board = {
  create,
  defaultViewport,
  toSummary,
  clone: cloneBoard,
  touch,
};
