export function clone<T>(value: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}
