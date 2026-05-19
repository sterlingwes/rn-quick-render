// Stand-in for bluesky-social-app's `#/analytics` module.
//
// Real `#/analytics` is a ~240-line provider that wires up
// GrowthBook, device IDs, geolocation, session IDs, the logger,
// and a metric-dispatch chain. It throws from `useAnalytics()` if
// not mounted inside `AnalyticsFeaturesContext`.
//
// `StepInterests` only reads `ax.metric(...)` inside the
// `saveInterests` callback, which the snapshot never invokes. So
// the mock just hands back a no-op `metric` function and an empty
// stub logger. If a future fixture exercises an analytics-reading
// render path, extend here.

const noopLogger = {
  debug: () => {},
  info: () => {},
  log: () => {},
  warn: () => {},
  error: () => {},
  useChild: () => noopLogger,
  Context: {},
};

export function useAnalytics() {
  return {
    metric: () => {},
    logger: noopLogger,
    metadata: {},
    features: {
      enabled: () => false,
    },
  };
}

export const useAnalyticsBase = useAnalytics;
