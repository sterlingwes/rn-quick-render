import React from "react";
import { RCTView, paragraph } from "../src/dsl";

// Chat message list: avatar, name, message preview, unread badge.
// Flex row + circle shapes + nested text.

function Avatar() {
  return React.createElement(RCTView, {
    style: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#E0E0E0",
      marginEnd: 12,
    },
  });
}

function Badge({ count }: { count: number }) {
  return React.createElement(
    RCTView,
    {
      style: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "#007AFF",
        alignItems: "center",
        justifyContent: "center",
      },
    },
    paragraph(String(count), { fontSize: 11, fontWeight: "600", color: "#FFFFFF" }),
  );
}

function ChatRow({
  name,
  message,
  unread,
}: {
  name: string;
  message: string;
  unread?: number;
}) {
  return React.createElement(
    RCTView,
    {
      style: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        backgroundColor: "#FFFFFF",
      },
    },
    React.createElement(Avatar),
    React.createElement(
      RCTView,
      { style: { flexDirection: "column", flex: 1 } },
      paragraph(name, { fontSize: 15, fontWeight: "500", color: "#1A1A1A" }),
      paragraph(message, { fontSize: 13, color: "#888888" }),
    ),
    unread ? React.createElement(Badge, { count: unread }) : null,
  );
}

export default React.createElement(
  RCTView,
  { style: { flexDirection: "column", backgroundColor: "#F5F5F5" } },
  React.createElement(ChatRow, {
    name: "Jane Cooper",
    message: "Hey, did you see the latest renders?",
    unread: 3,
  }),
  React.createElement(ChatRow, { name: "Alex Chen", message: "The build passed!" }),
  React.createElement(ChatRow, {
    name: "Sam Wilson",
    message: "Can you review the PR?",
    unread: 1,
  }),
);
