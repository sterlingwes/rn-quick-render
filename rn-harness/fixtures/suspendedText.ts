import React, { Suspense } from "react";
import { RCTView, RCTParagraph, RCTRawText } from "./_dsl";

// Concurrent-root fixture: a Suspense boundary around a child that throws
// a promise on first render. The harness's renderConcurrent() captures
// two completeRoot calls inside a single React.act flush — the fallback
// frame, then the resolved frame after settle() resolves the promise.
//
// Module-level state is fine because the harness renders this fixture
// exactly once per process (no theme variants, no re-require).

let resolveSuspense: (() => void) | null = null;
let resolvedName: string | null = null;
let pending: Promise<void> | null = null;

function useSuspendedName(): string {
  if (resolvedName !== null) return resolvedName;
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      resolveSuspense = () => {
        resolvedName = "Alice";
        resolve();
      };
    });
  }
  throw pending;
}

function Greeting() {
  const name = useSuspendedName();
  return React.createElement(
    RCTParagraph,
    { style: { fontSize: 18, color: "#1A1A1A", fontWeight: "600" } },
    React.createElement(RCTRawText, { text: `Hello, ${name}` }),
  );
}

const fallback = React.createElement(
  RCTParagraph,
  { style: { fontSize: 18, color: "#999999" } },
  React.createElement(RCTRawText, { text: "Loading…" }),
);

const element = React.createElement(
  RCTView,
  { style: { padding: 16, backgroundColor: "#FFFFFF" } },
  React.createElement(
    Suspense,
    { fallback },
    React.createElement(Greeting),
  ),
);

export default {
  type: "concurrent" as const,
  element,
  settle: async () => {
    resolveSuspense?.();
  },
};
