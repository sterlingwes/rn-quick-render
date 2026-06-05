// @react-native-async-storage/async-storage mock. Backed by an in-memory
// Map so reads a screen issues during render/effects resolve to whatever
// was written in the same process (usually nothing → null), without a
// native bridge.

const store = new Map<string, string>();

const AsyncStorage = {
  getItem: (k: string) => Promise.resolve(store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  },
  removeItem: (k: string) => {
    store.delete(k);
    return Promise.resolve();
  },
  clear: () => {
    store.clear();
    return Promise.resolve();
  },
  getAllKeys: () => Promise.resolve([...store.keys()]),
  multiGet: (ks: string[]) =>
    Promise.resolve(ks.map((k) => [k, store.has(k) ? store.get(k)! : null])),
  multiSet: (pairs: [string, string][]) => {
    for (const [k, v] of pairs) store.set(k, v);
    return Promise.resolve();
  },
  multiRemove: (ks: string[]) => {
    for (const k of ks) store.delete(k);
    return Promise.resolve();
  },
  mergeItem: () => Promise.resolve(),
  multiMerge: () => Promise.resolve(),
  flushGetRequests: () => {},
};

export default AsyncStorage;
