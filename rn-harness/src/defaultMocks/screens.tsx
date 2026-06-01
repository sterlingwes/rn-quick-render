// react-native-screens mock. Screen containers pass through to a <View>;
// the enable* toggles are no-ops. Enough for a real screen that calls
// enableScreens() at module init and wraps content in a Screen to load
// and render its resting tree.

import { placeholderView } from "./placeholder";

export const Screen = placeholderView("Screen");
export const ScreenContainer = placeholderView("ScreenContainer");
export const ScreenStack = placeholderView("ScreenStack");
export const ScreenStackHeaderConfig = placeholderView("ScreenStackHeaderConfig");
export const NativeScreen = placeholderView("NativeScreen");
export const NativeScreenContainer = placeholderView("NativeScreenContainer");

export const enableScreens = () => {};
export const enableFreeze = () => {};
export const screensEnabled = () => false;

export default { Screen, ScreenContainer, ScreenStack, enableScreens, enableFreeze };
