import type { BoardRepository, BoardSnapshotRepository } from "../application/index.js";
import { HttpBoardSnapshotRepository, IndexedDbBoardRepository } from "../infrastructure/index.js";
import type { RuntimeConfig } from "./runtimeConfig.js";

export function createRuntimeBoardRepository(_config: RuntimeConfig): BoardRepository {
  return new IndexedDbBoardRepository();
}

export function createBoardSnapshotRepository(
  config: RuntimeConfig,
): BoardSnapshotRepository | null {
  if (config.mode === "api" && config.boardSnapshots.enabled) {
    return new HttpBoardSnapshotRepository(config.apiBaseUrl);
  }

  return null;
}
