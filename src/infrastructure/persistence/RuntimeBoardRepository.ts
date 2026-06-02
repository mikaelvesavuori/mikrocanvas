import type { BoardRepository } from "../../application/index.js";
import type { DiagramBoard, DiagramBoardSummary } from "../../interfaces/index.js";

export class RuntimeBoardRepository implements BoardRepository {
  constructor(private repository: BoardRepository) {}

  use(repository: BoardRepository): void {
    this.repository = repository;
  }

  list(): Promise<DiagramBoardSummary[]> {
    return this.repository.list();
  }

  get(id: string): Promise<DiagramBoard | null> {
    return this.repository.get(id);
  }

  save(board: DiagramBoard): Promise<void> {
    return this.repository.save(board);
  }

  delete(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}
