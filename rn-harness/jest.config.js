/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  setupFiles: ["<rootDir>/src/jestSetup.ts"],
  moduleNameMapper: {
    // Replace the two RN internals the Fabric renderer touches at module init.
    // See src/loadFabric.ts for the rationale.
    "^react-native/Libraries/ReactPrivate/ReactNativePrivateInitializeCore$": "<rootDir>/src/empty.ts",
    "^react-native/Libraries/ReactPrivate/ReactNativePrivateInterface$": "<rootDir>/src/privateInterfaceStub.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false, isolatedModules: true }],
  },
};
