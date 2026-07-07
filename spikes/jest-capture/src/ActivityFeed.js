import React from "react";
import { ScrollView, Text, View } from "react-native";

// ScrollView-rooted on purpose: the Jest preset's ScrollView mock emits
// a single host node (no RCTScrollContentView), and without capture-side
// wrapper synthesis the renderer paints only the first row.
const ROWS = [
  { label: "Row one", color: "#E53935" },
  { label: "Row two", color: "#43A047" },
  { label: "Row three", color: "#1E88E5" },
];

export function ActivityFeed() {
  return (
    <ScrollView style={{ width: 320, height: 400 }}>
      {ROWS.map(({ label, color }) => (
        <View key={label} style={{ height: 60, backgroundColor: color, padding: 12 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 16 }}>{label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
