// A consumer app's stock Jest config — the whole point of the spike is
// that this is `preset: "@react-native/jest-preset"` as shipped, not the harness's
// bespoke config. Anything we're forced to add beyond the preset is a
// data point for the packaged preset fragment (record it in FINDINGS.md).
module.exports = {
  preset: "@react-native/jest-preset",
};
