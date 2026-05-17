// Jest counterpart to the require.cache stub in `loadRealRn`. See
// `nativeModulesJestStub.ts` for the rationale (Jest ignores
// require.cache, so moduleNameMapper handles the swap instead).

import { createTurboModuleRegistry } from "./nativeModuleStubs";

const registry = createTurboModuleRegistry();
module.exports = registry;
export const get = registry.get;
export const getEnforcing = registry.getEnforcing;
