import type { BoardRepository } from "../../application/index.js";
import { Board } from "../../domain/index.js";
import type { DiagramBoard, DiagramBoardSummary } from "../../interfaces/index.js";

const databaseName = "mikrocanvas";
const databaseVersion = 1;
const boardStore = "boards";

export class IndexedDbBoardRepository implements BoardRepository {
  async list(): Promise<DiagramBoardSummary[]> {
    const database = await this.open();
    const boards = await this.readAll(database);
    database.close();
    return boards
      .map((board) => Board.toSummary(board))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<DiagramBoard | null> {
    const database = await this.open();
    const transaction = database.transaction(boardStore, "readonly");
    const store = transaction.objectStore(boardStore);
    const board = await requestToPromise<DiagramBoard | undefined>(store.get(id));
    database.close();
    return board ?? null;
  }

  async save(board: DiagramBoard): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(boardStore, "readwrite");
    transaction.objectStore(boardStore).put(board);
    await transactionToPromise(transaction);
    database.close();
  }

  async delete(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(boardStore, "readwrite");
    transaction.objectStore(boardStore).delete(id);
    await transactionToPromise(transaction);
    database.close();
  }

  private async readAll(database: IDBDatabase): Promise<DiagramBoard[]> {
    const transaction = database.transaction(boardStore, "readonly");
    const store = transaction.objectStore(boardStore);
    return requestToPromise<DiagramBoard[]>(store.getAll());
  }

  private open(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) {
      return Promise.reject(new Error("IndexedDB is not available."));
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(boardStore)) {
          const store = database.createObjectStore(boardStore, {
            keyPath: "id",
          });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
