// Replaces react-native/Libraries/ReactPrivate/ReactNativePrivateInitializeCore.
// That module imports InitializeCore which pulls in the RN runtime. We skip
// it entirely — the Fabric renderer does not need anything it sets up.
export {};
