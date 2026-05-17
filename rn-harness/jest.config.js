/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  setupFiles: ["<rootDir>/src/jestSetup.ts"],
  // Platform-aware resolver — picks `Foo.android.js` for relative
  // requires inside react-native/**, mirroring src/babelRegister.ts.
  resolver: "<rootDir>/src/jestRnResolver.js",
  moduleNameMapper: {
    // Replace the two RN internals the Fabric renderer touches at module init.
    // See src/loadFabric.ts for the rationale.
    "^react-native/Libraries/ReactPrivate/ReactNativePrivateInitializeCore$": "<rootDir>/src/empty.ts",
    "^react-native/Libraries/ReactPrivate/ReactNativePrivateInterface$": "<rootDir>/src/privateInterfaceStub.ts",
    // Real-RN fixtures (those using loadRealRn) need the bridge
    // surfaces stubbed too. Under plain Node loadRealRn handles this
    // via require.cache; under Jest the same swap has to flow through
    // moduleNameMapper because Jest ignores require.cache.
    "^react-native/Libraries/BatchedBridge/NativeModules$": "<rootDir>/src/nativeModulesJestStub.ts",
    "^react-native/Libraries/TurboModule/TurboModuleRegistry$": "<rootDir>/src/turboModuleRegistryJestStub.ts",
  },
  transform: {
    // Our own sources — ts-jest.
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false, isolatedModules: true }],
    // Image assets — same shape as the assetRequireHook produces under
    // plain Node, so fixtures importing PNGs via require() get the
    // identical source object in both runtimes.
    "\\.(png|jpe?g|gif|webp)$": "<rootDir>/src/jestAssetTransformer.js",
    // RN's Flow-annotated source — babel-jest with the RN preset (see
    // babel.config.js). Scoped via transformIgnorePatterns below; the
    // entry here is what runs once a file is allowed past the ignore.
    "^.+\\.(js|jsx)$": "babel-jest",
  },
  // Default Jest ignores everything under node_modules from
  // transformation. RN ships uncompiled source, so we have to opt
  // it (and the @react-native/* siblings) back in.
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native)/)",
  ],
};
