import { createRuntimeBoardRepository, loadRuntimeConfig } from "../config/index.js";
import { configureRuntime, MikroCanvasApp } from "./app.js";

const runtimeConfig = await loadRuntimeConfig();
configureRuntime(runtimeConfig, createRuntimeBoardRepository(runtimeConfig));

void new MikroCanvasApp().boot();
