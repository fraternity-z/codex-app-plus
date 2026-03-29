export function readStoredJson<T>(
  storageKey: string,
  parse: (value: unknown) => T,
  fallback: T,
): T {
  const rawValue = window.localStorage.getItem(storageKey);
  if (rawValue === null) {
    return fallback;
  }
  try {
    return parse(JSON.parse(rawValue) as unknown);
  } catch {
    return fallback;
  }
}

export function writeStoredJson<T>(
  storageKey: string,
  value: T,
  serialize: (value: T) => unknown = (current) => current,
): void {
  window.localStorage.setItem(storageKey, JSON.stringify(serialize(value)));
}
