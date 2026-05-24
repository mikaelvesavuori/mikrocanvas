import type { DiagramBoard, DiagramBoardSummary } from "../../interfaces/index.js";

export interface BoardRepository {
  list(): Promise<DiagramBoardSummary[]>;
  get(id: string): Promise<DiagramBoard | null>;
  save(board: DiagramBoard): Promise<void>;
  delete(id: string): Promise<void>;
}
