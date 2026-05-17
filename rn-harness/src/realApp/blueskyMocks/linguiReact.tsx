// Stand-in for `@lingui/react`'s runtime exports.
//
// `PasswordUpdatedForm` uses `useLingui()` for the `_` translator
// function: `_(msg`Close alert`)` resolves the message descriptor
// returned by our `linguiCoreMacro.msg` mock back to a string. Other
// real-bsky callers spread the result, so we keep the same
// `{ i18n, _, t }` shape lingui itself returns.
//
// `<Trans>` is also re-exported here (from the macro mock) so
// callers that import `Trans` from the runtime package instead of
// the macro package keep working.

import * as React from "react";
import type { ReactNode } from "react";
import type { MessageDescriptor } from "./linguiCoreMacro";

export { Trans } from "./linguiReactMacro";

type Translatable = MessageDescriptor | string;

function translate(input: Translatable): string {
  if (typeof input === "string") return input;
  return input.message ?? input.id ?? "";
}

const i18n = {
  _: translate,
  t: translate,
  locale: "en",
  date(value: Date | number | string): string {
    const d = value instanceof Date ? value : new Date(value);
    return d.toISOString();
  },
};

export function useLingui() {
  return {
    i18n,
    _: translate,
    // Real `useLingui` from `@lingui/react/macro` returns `t` so
    // callers can do `const {t: l} = useLingui()`. The runtime
    // package mostly returns `i18n` + `_`, but exposing `t` here
    // too keeps both shapes happy.
    t: translate,
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
