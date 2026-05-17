// Stand-in for `@lingui/core/macro`.
//
// In a real bsky build, `babel-plugin-macros` (or the bundled lingui
// preset) consumes `msg`, `t`, `plural`, etc. at compile time and
// erases the import. The harness doesn't run that transform — so at
// runtime the import has to actually resolve to *something*.
//
// We provide thin runtime equivalents:
//   - `msg` and `t` accept a tagged-template invocation, interpolate
//     any `${value}` slots into the literal, and return a
//     `MessageDescriptor`-shaped object (`{id, message, values}`).
//     This is what `_(msg`foo ${name}`)` in PasswordUpdatedForm
//     consumes — our `linguiReact.useLingui()` mock unwraps the
//     `message` field.
//   - `plural` / `select` collapse to their `other` branch
//     (cardinality / selection logic is out of scope for a structural
//     snapshot).
//
// Match the runtime call pattern, not the build-time tagged form —
// the call is what executes when no macro plugin transforms it.

export type MessageDescriptor = {
  id: string;
  message: string;
  values?: Record<string, unknown>;
};

function interpolate(strings: TemplateStringsArray, values: unknown[]): string {
  let out = "";
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) out += String(values[i]);
  });
  return out;
}

export function msg(
  strings: TemplateStringsArray,
  ...values: unknown[]
): MessageDescriptor {
  const text = interpolate(strings, values);
  const valueMap: Record<string, unknown> = {};
  values.forEach((v, i) => {
    valueMap[String(i)] = v;
  });
  return { id: text, message: text, values: valueMap };
}

export function t(strings: TemplateStringsArray, ...values: unknown[]): string {
  return interpolate(strings, values);
}

export function plural(
  _value: number,
  branches: { other: string } & Record<string, string>,
): string {
  // Real plural picks one of `one`/`few`/`many`/`other` based on the
  // CLDR rules for the active locale. The structural snapshot only
  // needs a stable string; `other` is the universal fallback.
  return branches.other;
}

export function select(
  value: string | number,
  branches: { other: string } & Record<string, string>,
): string {
  return branches[String(value)] ?? branches.other;
}

export function defineMessage(
  descriptor: Partial<MessageDescriptor> & { message: string },
): MessageDescriptor {
  return {
    id: descriptor.id ?? descriptor.message,
    message: descriptor.message,
    values: descriptor.values,
  };
}
