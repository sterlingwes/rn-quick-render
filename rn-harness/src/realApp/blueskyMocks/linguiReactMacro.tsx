// Stand-in for `@lingui/react/macro`.
//
// In a real bsky build, the lingui babel preset rewrites
// `<Trans>Password updated!</Trans>` into
// `<Trans id="..." message="..." />` (where `<Trans>` is then the
// runtime component from `@lingui/react`). The harness doesn't run
// that rewrite, so at runtime `<Trans>` is called with literal
// React children — which we render as-is via a Fragment, preserving
// any inline text or nested `<Text>` spans for the structural
// capture.
//
// `useLingui` is also re-exported here because some bsky callers
// import it from the macro package rather than `@lingui/react`. We
// delegate to the runtime mock so behaviour stays in one place.

import * as React from "react";

export { useLingui } from "./linguiReact";

export function Trans({
  children,
}: {
  children?: React.ReactNode;
  id?: string;
  message?: string;
  values?: Record<string, unknown>;
}) {
  return <>{children}</>;
}
