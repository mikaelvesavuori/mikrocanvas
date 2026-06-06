import type { BoardSnapshotRepository } from "../../application/index.js";
import type { DiagramBoard } from "../../interfaces/index.js";
import { clone } from "../../shared/index.js";

export class HttpBoardSnapshotRepository implements BoardSnapshotRepository {
  constructor(private readonly apiBaseUrl: string) {}

  async get(id: string): Promise<DiagramBoard | null> {
    const response = await fetch(this.url(`/api/boards/${encodeURIComponent(id)}`), {
      cache: "no-store",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to load board snapshot ${id}.`);
    }

    return clone((await response.json()) as DiagramBoard);
  }

  async save(board: DiagramBoard): Promise<void> {
    const response = await fetch(this.url(`/api/boards/${encodeURIComponent(board.id)}`), {
      body: JSON.stringify(board),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    if (!response.ok) {
      throw new Error(`Failed to publish board snapshot ${board.id}.`);
    }
  }

  private url(pathname: string): string {
    return new URL(pathname.replace(/^\//, ""), withTrailingSlash(this.apiBaseUrl)).toString();
  }
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
