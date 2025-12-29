const storage = new Map<string, string>();

const localStorageShim: Storage = {
  get length() {
    return storage.size;
  },
  clear() {
    storage.clear();
  },
  getItem(key: string) {
    return storage.has(key) ? storage.get(key) ?? null : null;
  },
  key(index: number) {
    return Array.from(storage.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storage.delete(key);
  },
  setItem(key: string, value: string) {
    storage.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageShim,
  configurable: true,
});

if (typeof globalThis.window !== 'undefined') {
  Object.defineProperty(globalThis.window, 'localStorage', {
    value: localStorageShim,
    configurable: true,
  });
}
