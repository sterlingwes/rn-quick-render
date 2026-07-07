# Rendering components from a real app

The harness's job is the runtime plumbing: boot `react-native` under
Node, intercept the mount stream, paint it. Everything *above* the
component being rendered — props, providers, data — is yours to supply,
the same way a Storybook story works. This doc explains what the
harness gives you for free, what you configure, and where the line is.

## The contract in one example

A real-app fixture is a thin wrapper around the target component that
supplies everything it reads:

```tsx
// fixtures/realApp/inboxScreen.ts
import InboxScreen from "<your-app>/src/screens/InboxScreen";
import { withMockProviders } from "./_providers";

export default withMockProviders(
  <InboxScreen route={{ params: { folderId: "inbox" } }} navigation={mockNav} />,
  {
    redux: { inbox: { unread: 3, items: SAMPLE_ITEMS } },
    query: { "/inbox": SAMPLE_INBOX_RESPONSE },
  },
);
```

Concretely, you bring:

- **Props** — concrete values for everything the component reads.
- **Context providers** — mocked `NavigationContainer`, Redux
  `Provider`, `QueryClientProvider`, theming providers, with fixture
  data. If the component calls `useNavigation` or `useSelector`, the
  provider has to supply something usable.
- **Network and storage** — mock the HTTP/GraphQL client with the
  response shape the component expects. Native storage no-ops by
  default; override it if the component reads synchronously (below).
- **Animated values** — animations resolve to their initial value. If a
  component only matters at an animated mid-state, hoist that state to
  a prop.
- **Unsupported children** — a `<MapView>` or charting library either
  gets swapped for a placeholder in your wrapper, or accepts the
  labeled-rect fallback the renderer paints.

This boundary is deliberate: the harness renders what you hand it; it
does not guess what production state would have been.

## What the harness handles for you

### The default mock layer

Heavy native-backed libraries don't need hand-written stubs. A curated
pack (always on, `rn-harness/src/defaultMocks/`) maps the usual
suspects — `react-native-reanimated`, `react-native-svg`,
`react-native-gesture-handler`, `react-native-screens`,
`react-native-safe-area-context`,
`@react-native-async-storage/async-storage`,
`@react-native-community/netinfo`, `lottie-react-native`,
`react-native-fast-image` — to placeholder `<View>`s that flow through
the normal mount stream. One mock serves both render engines.

For anything else that fails to resolve, an opt-in catch-all routes the
import to a permissive proxy instead of throwing:

```ts
loadRealRn({ autoMockUnresolved: true });
// or: RN_HARNESS_AUTOMOCK_UNRESOLVED=1
```

The registry (`src/defaultMocks/registry.js`) is shared by the
plain-Node resolver (`babelRegister`) and the Jest resolver
(`jestRnResolver.js`) — add mappings there, not in both.

### The native-module shim

`NativeModules` / `TurboModuleRegistry` resolve through three tiers:

1. **Per-fixture overrides** — highest precedence:
   ```ts
   loadRealRn({ nativeModules: { AsyncLocalStorage: { getItem: () => null } } });
   ```
2. **Sync defaults** — modules whose callers need a real return value
   (`PlatformConstants.getConstants()` and friends) get small static
   constants objects.
3. **Deep no-op proxy** — any other module access returns a function
   returning `undefined`, which stops the overwhelming majority of
   crashes with zero per-module work.

If a component reads from a native module synchronously during render,
supply the data via tier 1 — that's also useful documentation of what
the screen actually depends on.

### Assets

`require('./img.png')` works. Under plain Node an installed require
hook produces the same Metro-shaped source object the packager would;
under Jest an asset transformer produces the identical shape. Sources
resolve to `data:`/`file://` URIs the renderer decodes directly. HTTP
image sources are deliberately unsupported — snapshot tests should pin
assets locally.

### Fonts

Pass your app's font directory to the renderer (`--fonts
android/app/src/main/assets/fonts`, or `fonts` in a batch manifest).
Every `.ttf`/`.otf` registers by filename; built-in families
(`sans-serif`, `serif`, `monospace`) resolve natively; unknown families
fall back to Roboto with a deduped warning on stderr so silent
fallbacks stay visible.

Not yet automated: reading `react-native.config.js` family aliasing —
today the filename is the family name.

### Theme

`setColorScheme("dark")` overrides RN's `useColorScheme()` hook — the
platform API well-behaved theme systems derive from — so flipping the
scheme flows through your app's real theming path. Themed captures
write separate JSONs (`out/<fixture>__dark.json`); the renderer never
needs a theme parameter because the palette is baked into the captured
props.

### Entry points

- `renderFixture(element)` — hand an element straight to Fabric.
- `renderFrames([a, b, …])` — sequential commits into one surface;
  exercises the update path.
- `renderConcurrent({ element, settle })` — Suspense-driven capture:
  fallback commit, `settle()` resolves the suspended promise, resolved
  commit.
- `captureFromAppKey(appKey, appProps)` — mounts through
  `AppRegistry`/`AppContainer`, matching what a device's
  `ReactRootView` constructs.

## Choosing what to render

Experience from the integration fixtures (four screens from
`bluesky-social-app`, ramped from an 11-line divider to a full
onboarding screen): the mocking cost scales with the *dependency
depth*, not the visual complexity. A screen-sized component whose
providers fit in one readable fixture file is a good target; a screen
that demands a real backend, a live navigation graph, or an animation
timeline is not — snapshot the screens it's composed of instead.

That per-target mocking cost is also the motivation for the [Jest
capture proposal](proposals/jest-capture.md): apps with existing test
suites have already paid it once, inside their own Jest config, and the
harness should be able to piggyback on it rather than duplicate it.
