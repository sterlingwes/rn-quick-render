// @react-native-community/netinfo mock. Reports a connected wifi state so
// screens that gate content on connectivity render their online branch;
// subscriptions are no-op unsubscribers.

const state = {
  type: "wifi",
  isConnected: true,
  isInternetReachable: true,
  details: { isConnectionExpensive: false },
};

export const fetch = () => Promise.resolve(state);
export const refresh = () => Promise.resolve(state);
export const addEventListener = (_cb: unknown) => () => {};
export const useNetInfo = () => state;
export const configure = () => {};

export default { fetch, refresh, addEventListener, useNetInfo, configure };
