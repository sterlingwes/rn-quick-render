// Stand-in for bluesky-social-app's `#/logger` module.
//
// Real `#/logger` imports `nanoid/non-secure`, `#/env`, console /
// sentry transports, and a `LogContext` enum from
// `#/logger/types`. The harness has none of those resolved as
// runtime deps, and the actual logger output doesn't affect the
// rendered tree at all. The mock just exposes the symbols
// `StepInterests` (via its `saveInterests` callback) and other
// pulled-in modules import — `logger.info` / `logger.error` /
// `Logger.create()` — as no-ops.

const noopLogger = {
  debug: () => {},
  info: () => {},
  log: () => {},
  warn: () => {},
  error: () => {},
  addTransport: () => {},
};

export const logger = noopLogger;

export class Logger {
  static Context = {} as const;
  static Level = {} as const;

  static create() {
    return noopLogger;
  }
}
