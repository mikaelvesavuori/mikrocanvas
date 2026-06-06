import {
  createBoardSnapshotRepository,
  createRuntimeBoardRepository,
  loadRuntimeConfig,
} from "../config/index.js";
import { configureRuntime, MikroCanvasApp } from "./app.js";

const runtimeConfig = await loadRuntimeConfig();
configureRuntime(
  runtimeConfig,
  createRuntimeBoardRepository(runtimeConfig),
  createBoardSnapshotRepository(runtimeConfig),
);

void new MikroCanvasApp().boot();
