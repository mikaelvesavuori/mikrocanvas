import type { DiagramBoard } from "../../interfaces/index.js";

export interface BoardSnapshotRepository {
  get(id: string): Promise<DiagramBoard | null>;
  save(board: DiagramBoard): Promise<void>;
}
