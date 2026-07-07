import React from "react";
import { Text, View, useColorScheme } from "react-native";

// Derives its palette from the platform useColorScheme() hook — the
// same boundary real theme systems read — so a per-scheme capture
// produces genuinely different props, not just a flag.
export function ThemedBanner() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  return (
    <View style={{ padding: 12, backgroundColor: dark ? "#111111" : "#FAFAFA" }}>
      <Text style={{ fontSize: 16, color: dark ? "#EEEEEE" : "#222222" }}>
        {dark ? "Dark mode" : "Light mode"}
      </Text>
    </View>
  );
}
