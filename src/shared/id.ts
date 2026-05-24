export function createId(prefix = "id") {
  const cryptoValue = globalThis.crypto?.randomUUID?.();
  if (cryptoValue) {
    return `${prefix}_${cryptoValue.replaceAll("-", "").slice(0, 18)}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
