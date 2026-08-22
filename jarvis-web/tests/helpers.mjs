/** Test environment shims — localStorage + minimal browser globals. */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
globalThis.navigator = { onLine: true };
globalThis.document = {
  documentElement: { classList: { toggle() {}, add() {}, remove() {} }, style: { setProperty() {} } },
  addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  hidden: false,
};
globalThis.window = { addEventListener() {}, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1 };
export { store };
