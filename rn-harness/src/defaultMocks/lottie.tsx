// lottie-react-native mock. A Lottie animation has no resting host the
// renderer understands; collapse it to a placeholder <View> sized by the
// style the caller passes (animations don't run in a single-frame capture).

import { placeholderView } from "./placeholder";

const LottieView = placeholderView("LottieView");

export default LottieView;
export { LottieView };
