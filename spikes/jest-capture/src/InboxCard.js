import React from "react";
import { Image, Text, View } from "react-native";
import { useUnreadCount } from "./useUnreadCount";

// 12x12 pink PNG. A data: URI keeps the spike independent of Metro's
// asset pipeline; the renderer decodes data: sources natively.
// (Generated with pngjs — layoutlib's BitmapFactory rejects some
// hand-minified 1x1 PNGs, so keep this a well-formed encoder output.)
const DOT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAKklEQVR4AZXBAQEAIAyAME4NyxnbNj4D27xzP4FEEkkkkUQSSSSRRBJJtGxVAmpTsKsjAAAAAElFTkSuQmCC";

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
