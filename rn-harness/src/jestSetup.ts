import { createCapture } from "./captureStub";

// Shared capture installed before each Jest test file loads its modules.
// The Fabric renderer destructures `nativeFabricUIManager` at module init,
// so the stub must be present in the global scope before any Fabric import.
const capture = createCapture();
(globalThis as any).__DEV__ = true;
(globalThis as any).nativeFabricUIManager = capture.manager;
(globalThis as any).RN$Bridgeless = true;
(globalThis as any).__rnHarnessCapture = capture;
