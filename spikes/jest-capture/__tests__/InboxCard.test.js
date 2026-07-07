import React from "react";
import TestRenderer from "react-test-renderer";
import { InboxCard } from "../src/InboxCard";
import { ThemedBanner } from "../src/ThemedBanner";
import { screenSnapshot } from "rn-quick-render-jest";

// The consumer's pre-existing mock — the real useUnreadCount throws to
// prove the capture path can only succeed by inheriting this mock.
jest.mock("../src/useUnreadCount", () => ({
  useUnreadCount: () => 3,
}));

test("existing-style test still passes (react-test-renderer)", () => {
  let tree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(<InboxCard />);
  });
  expect(JSON.stringify(tree.toJSON())).toContain("3 unread messages");
});

test("screenSnapshot captures a renderable stream with the test's mocks applied", () => {
  const { artifactPath, instructions } = screenSnapshot(<InboxCard />, {
    name: "inboxCard",
    devices: ["pixel5", "tablet"],
    fontScales: ["default", "a11y"],
  });

  // Host components came through Fabric, not a mocked-out tree.
  const creates = instructions.filter((i) => i.op === "createNode");
  const viewNames = creates.map((i) => i.viewName);
  expect(viewNames).toEqual(expect.arrayContaining(["RCTView", "RCTImageView"]));
  expect(viewNames.some((n) => n === "RCTText" || n === "RCTParagraph")).toBe(true);

  // The jest.mock above flowed into the captured props (unread = 3).
  const raw = JSON.stringify(instructions);
  expect(raw).toContain("3 unread messages");

  // The artifact on disk is the renderer's input shape.
  const artifact = JSON.parse(require("fs").readFileSync(artifactPath, "utf8"));
  expect(artifact).toMatchObject({ fixture: "inboxCard" });
  expect(Array.isArray(artifact.instructions)).toBe(true);
});

test("capture is order-independent: a later capture of the same element is identical", () => {
  // Without normalization this would fail — Fabric's tag counter keeps
  // climbing across renders in the process, so a second capture of the
  // same element embeds different reactTags. This is the fragility that
  // forced append-only fixture ordering in the harness repo.
  const first = screenSnapshot(<InboxCard />, { name: "inboxCard-a" });
  const second = screenSnapshot(<InboxCard />, { name: "inboxCard-b" });
  expect(second.instructions).toEqual(first.instructions);
});

test("colorSchemes captures per-scheme artifacts through the real useColorScheme boundary", () => {
  const { artifacts } = screenSnapshot(<ThemedBanner />, {
    name: "themedBanner",
    colorSchemes: ["light", "dark"],
  });

  expect(artifacts.map((a) => a.scheme)).toEqual(["light", "dark"]);
  expect(artifacts[1].artifactPath).toMatch(/themedBanner__dark\.json$/);

  const light = JSON.stringify(artifacts[0].instructions);
  const dark = JSON.stringify(artifacts[1].instructions);
  expect(light).toContain("Light mode");
  expect(light).toContain("#FAFAFA");
  expect(dark).toContain("Dark mode");
  expect(dark).toContain("#111111");
});
