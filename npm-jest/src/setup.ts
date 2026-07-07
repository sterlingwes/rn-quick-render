// Optional setupFiles entry:
//
//   // jest.config.js
//   module.exports = {
//     preset: "@react-native/jest-preset",
//     setupFiles: ["rn-quick-render-jest/setup"],
//   };
//
// Not required for most apps — `screenSnapshot` installs both shims
// lazily on first use. Add this only if your app's own code touches
// RN's DOM APIs (NativeDOM) before the first capture, in which case the
// lazy jest.doMock would arrive too late to replace the module.
import { installNativeDomMock } from "./shims";

installNativeDomMock();
