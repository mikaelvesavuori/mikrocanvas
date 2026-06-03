import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, join, normalize, relative } from "node:path";
import { Board } from "../../../src/domain/index.js";
import type { DiagramBoard } from "../../../src/interfaces/index.js";
import type { MikroCanvasConfig } from "../config.js";
import type { BoardSnapshot, MikroCanvasDatabase } from "../database/MikroCanvasDatabase.js";

const deleteTokenHeader = "x-mikrocanvas-delete-token";

export interface AppServerOptions {
  config: MikroCanvasConfig;
  database: MikroCanvasDatabase;
  staticRoot: string;
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class AppServer {
  private listeningPort: number;
  private server: Server | null = null;

  constructor(private readonly options: AppServerOptions) {
    this.listeningPort = options.config.port;
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolveStart, rejectStart) => {
      this.server?.once("error", rejectStart);
      this.server?.listen(this.options.config.port, this.options.config.host, () => {
        const address = this.server?.address();
        if (address && typeof address === "object") {
          this.listeningPort = address.port;
        }
        resolveStart();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolveStop, rejectStop) => {
      this.server?.close((error) => (error ? rejectStop(error) : resolveStop()));
      this.server?.closeIdleConnections();
    });
    this.server = null;
  }

  getBaseUrl(): string {
    return `http://${this.options.config.host}:${this.listeningPort}`;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!request.url || !request.method) {
      sendJson(response, 400, { error: "Invalid request." });
      return;
    }

    applyCors(request, response, this.options.config.appUrl);

    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }

    const url = new URL(request.url, this.getBaseUrl());

    try {
      if (await this.handleSystemRoutes(request, response, url)) {
        return;
      }

      if (await this.handleBoardRoutes(request, response, url)) {
        return;
      }

      if (
        request.method === "GET" &&
        serveStatic(this.options.staticRoot, url.pathname, response)
      ) {
        return;
      }

      if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
        const served = serveStatic(this.options.staticRoot, "/", response);
        if (served) {
          return;
        }
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }

      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error.",
      });
    }
  }

  private async handleSystemRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (
      request.method === "GET" &&
      (url.pathname === "/api/health" || url.pathname === "/health")
    ) {
      sendJson(response, 200, {
        onlineBoards: true,
        service: "mikrocanvas-api",
        status: "healthy",
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/config.json") {
      sendJson(response, 200, createPublicRuntimeConfig(this.getBaseUrl()));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/openapi.json") {
      sendJson(response, 200, createOpenApiSchema(this.getBaseUrl()));
      return true;
    }

    return false;
  }

  private async handleBoardRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (request.method === "POST" && url.pathname === "/api/boards") {
      const input = await readJson<{ title?: string }>(request);
      const board = Board.create(input.title?.trim() || "Untitled board");
      const deleteToken = createCapabilityToken();
      const snapshot = this.options.database.saveBoard(board, {
        deleteTokenHash: hashCapabilityToken(deleteToken),
      });
      sendBoard(response, 201, snapshot, {
        "X-MikroCanvas-Delete-Token": deleteToken,
      });
      return true;
    }

    const match = url.pathname.match(/^\/api\/boards\/([^/]+)$/);
    if (!match) {
      return false;
    }

    const id = decodeURIComponent(match[1] ?? "");
    if (!id.trim()) {
      throw new HttpError(400, "Board ID is required.");
    }

    if (request.method === "GET") {
      const snapshot = this.options.database.getBoard(id);
      if (!snapshot) {
        sendJson(response, 404, { error: "Board not found." });
        return true;
      }

      sendBoard(response, 200, snapshot);
      return true;
    }

    if (request.method === "PUT") {
      const board = await readJson<DiagramBoard>(request);
      assertBoardInput(board, id);
      sendBoard(
        response,
        200,
        this.options.database.saveBoard(board, {
          deleteTokenHash: hashOptionalCapabilityToken(getHeader(request, deleteTokenHeader)),
        }),
      );
      return true;
    }

    if (request.method === "DELETE") {
      const snapshot = this.options.database.getBoard(id);
      if (!snapshot) {
        sendJson(response, 404, { error: "Board not found." });
        return true;
      }

      if (!this.canDeleteBoard(request, id)) {
        sendJson(response, 403, {
          error: "Delete token or admin token is required to delete this board.",
        });
        return true;
      }

      this.options.database.deleteBoard(id);
      response.writeHead(204, { "Cache-Control": "no-store" }).end();
      return true;
    }

    sendJson(response, 405, { error: "Method not allowed." });
    return true;
  }

  private canDeleteBoard(request: IncomingMessage, id: string): boolean {
    if (isAdminRequest(request, this.options.config.adminToken)) {
      return true;
    }

    const storedHash = this.options.database.getDeleteTokenHash(id);
    const providedHash = hashOptionalCapabilityToken(getHeader(request, deleteTokenHeader));
    return Boolean(storedHash && providedHash && secureEqual(storedHash, providedHash));
  }
}

async function readJson<T>(request: IncomingMessage, maxBytes = 8_000_000): Promise<T> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;

    if (bytes > maxBytes) {
      throw new HttpError(413, "Payload is too large.");
    }

    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function assertBoardInput(board: DiagramBoard, expectedId: string): void {
  if (!board || typeof board !== "object") {
    throw new HttpError(400, "Board payload is required.");
  }

  if (board.id !== expectedId) {
    throw new HttpError(400, "Board payload ID must match the URL ID.");
  }

  if (!board.title || !Array.isArray(board.elements) || !board.viewport) {
    throw new HttpError(400, "Board payload is not a valid MikroCanvas board.");
  }
}

function sendBoard(
  response: ServerResponse,
  statusCode: number,
  snapshot: BoardSnapshot,
  headers: OutgoingHttpHeaders = {},
): void {
  sendJson(response, statusCode, snapshot.board, {
    ...createBoardHeaders(snapshot),
    ...headers,
  });
}

function createBoardHeaders(snapshot: BoardSnapshot): Record<string, string> {
  return {
    ETag: `"board-${snapshot.revision}"`,
    "X-Board-Revision": String(snapshot.revision),
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: OutgoingHttpHeaders = {},
): void {
  const json = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(json),
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(json);
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedAppUrl: string,
): void {
  const origin = request.headers.origin;
  if (origin && origin === getUrlOrigin(allowedAppUrl)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, if-match, x-board-revision, x-mikrocanvas-delete-token",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}

function getHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function isAdminRequest(request: IncomingMessage, adminToken: string): boolean {
  if (!adminToken) {
    return false;
  }

  const authorization = getHeader(request, "authorization");
  return secureEqual(authorization, `Bearer ${adminToken}`);
}

function createCapabilityToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashOptionalCapabilityToken(token: string): string | null {
  const normalized = token.trim();
  return normalized ? hashCapabilityToken(normalized) : null;
}

function hashCapabilityToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function serveStatic(root: string, requestPath: string, response: ServerResponse): boolean {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = normalize(join(root, safePath));
  const normalizedRoot = normalize(root);
  const relativePath = relative(normalizedRoot, filePath);

  if (
    relativePath.startsWith("..") ||
    relativePath === "" ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    return false;
  }

  response.writeHead(200, {
    "Cache-Control": staticCacheControl(filePath),
    "Content-Type": contentType(filePath),
  });
  createReadStream(filePath).pipe(response);
  return true;
}

function staticCacheControl(_filePath: string): string {
  return "no-store";
}

function getUrlOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function createPublicRuntimeConfig(apiBaseUrl: string) {
  return {
    apiBaseUrl,
    mode: "api",
    onlineBoards: {
      enabled: true,
    },
  };
}

function createOpenApiSchema(baseUrl: string) {
  return {
    info: {
      title: "MikroCanvas API",
      version: "1.0.0",
    },
    openapi: "3.1.0",
    paths: {
      "/config.json": {
        get: {
          summary: "Get browser runtime config",
        },
      },
      "/api/boards": {
        post: {
          summary: "Create an empty board",
        },
      },
      "/api/boards/{boardId}": {
        delete: {
          summary: "Delete an open board by ID",
        },
        get: {
          summary: "Load an open board by ID",
        },
        put: {
          summary: "Save an open board by ID",
        },
      },
      "/api/health": {
        get: {
          summary: "Check API health",
        },
      },
    },
    servers: [{ url: baseUrl }],
  };
}
