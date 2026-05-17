// Babel config used by Jest (via babel-jest) for files under
// `node_modules/react-native` and `node_modules/@react-native/*`.
// Our own `.ts` / `.tsx` files are transformed by ts-jest (see
// jest.config.js's `transform` map) — they don't reach this config.
module.exports = {
  presets: [require.resolve("@react-native/babel-preset")],
};
