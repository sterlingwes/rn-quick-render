// Drop-in for `react-native/Libraries/BatchedBridge/NativeModules` when
// the harness runs under Jest. Jest ignores require.cache, so the
// stubRequire trick used by `loadFabric` / `loadRealRn` doesn't apply
// — moduleNameMapper in jest.config.js points this file at the path
// instead. Defaults only; per-fixture overrides aren't reachable from
// here (Jest's setupFiles run before fixture modules execute), so
// fixtures that need module-specific seed data should use `jest.doMock`.

import { createNativeModulesProxy } from "./nativeModuleStubs";

const nativeModules = createNativeModulesProxy();
export default nativeModules;
module.exports = { default: nativeModules, __esModule: true };
