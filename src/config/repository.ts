import type { BoardRepository } from "../application/index.js";
import { HttpBoardRepository, IndexedDbBoardRepository } from "../infrastructure/index.js";
import type { RuntimeConfig } from "./runtimeConfig.js";

export function createRuntimeBoardRepository(config: RuntimeConfig): BoardRepository {
  if (config.mode === "api" && config.onlineBoards.enabled) {
    return new HttpBoardRepository(config.apiBaseUrl);
  }

  return new IndexedDbBoardRepository();
}
