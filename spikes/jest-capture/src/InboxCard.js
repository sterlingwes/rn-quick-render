import React from "react";
import { Image, Text, View } from "react-native";
import { useUnreadCount } from "./useUnreadCount";

// 1x1 magenta PNG. A data: URI keeps the spike independent of Metro's
// asset pipeline; the renderer decodes data: sources natively.
const DOT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIA1nGB5gAAAABJRU5ErkJggg==";

export function InboxCard() {
  const unread = useUnreadCount();
  return (
    <View
      style={{
        width: 320,
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Image source={{ uri: DOT }} style={{ width: 12, height: 12, marginRight: 8 }} />
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#111111" }}>Inbox</Text>
      </View>
      <Text style={{ fontSize: 14, color: unread > 0 ? "#D81B60" : "#757575" }}>
        {unread > 0 ? `${unread} unread messages` : "All caught up"}
      </Text>
    </View>
  );
}
