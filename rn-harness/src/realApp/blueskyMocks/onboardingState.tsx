// Stand-in for bluesky-social-app's `#/screens/Onboarding/state`.
//
// The real module ships an OnboardingContext reducer (~250 lines)
// plus `useOnboardingInternalState()` that throws if not mounted
// under a `<Context.Provider>`. The harness never mounts that
// provider, so calling the real hook from `StepInterests` would
// crash on render.
//
// The mock returns a snapshot-shaped state object directly — no
// context, no reducer. `selectedInterests` is populated with a
// handful of plausible picks so the rendered grid shows both
// selected (dark) and unselected (grey) pills. Bumping this list
// is the easiest way to vary the snapshot.

import { useMemo } from "react";

const SELECTED_INTERESTS = ["art", "tech", "music", "photography"];

export function useOnboardingInternalState() {
  return useMemo(
    () => ({
      state: {
        activeStep: "interests" as const,
        activeStepIndex: 1,
        totalSteps: 4,
        canGoBack: true,
        stepTransitionDirection: "Forward" as const,
        screens: {
          profile: true,
          interests: true,
          "suggested-accounts": true,
          "suggested-starterpacks": true,
          "find-contacts-intro": false,
          "find-contacts": false,
          finished: true,
        },
        interestsStepResults: {
          selectedInterests: SELECTED_INTERESTS,
        },
        profileStepResults: {
          isCreatedAvatar: false,
          image: undefined,
          imageUri: "",
          imageMime: "",
        },
      },
      dispatch: () => {
        /* no-op: snapshot doesn't dispatch */
      },
    }),
    [],
  );
}
