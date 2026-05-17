import { createCapture } from "./captureStub";

// Shared capture installed before each Jest test file loads its modules.
// The Fabric renderer destructures `nativeFabricUIManager` at module init,
// so the stub must be present in the global scope before any Fabric import.
//
// The cluster of `RN$*` and `__nativeComponentRegistry__*` globals mirror
// what loadFabric installs under plain Node — Jest's runtime never goes
// through loadFabric() (the existingCapture path short-circuits), so we
// have to mount the same globals here or any real-RN module that probes
// them at load time (AppRegistry calls registerCallableModule which
// reaches `global.RN$registerCallableModule`; AppContainer's dev
// wrapper probes `__nativeComponentRegistry__hasComponent`) blows up.
const capture = createCapture();
(globalThis as any).__DEV__ = true;
(globalThis as any).nativeFabricUIManager = capture.manager;
(globalThis as any).RN$Bridgeless = true;
(globalThis as any).RN$stopSurface = undefined;
(globalThis as any).RN$registerCallableModule = (
  _name: string,
  _moduleOrFactory: unknown,
) => {
  /* no-op */
};
(globalThis as any).__nativeComponentRegistry__hasComponent = () => false;
(globalThis as any).__rnHarnessCapture = capture;
