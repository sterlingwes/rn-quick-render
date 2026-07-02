// Stands in for a module backed by native storage / network — the kind
// of dependency a consumer app already mocks in its Jest suite. If the
// capture path sees the real implementation instead of the test's mock,
// the spike fails loudly.
export function useUnreadCount() {
  throw new Error(
    "useUnreadCount: real implementation reached — the test's jest.mock was not applied",
  );
}
