# Fabric mount instruction catalogue

Captured from React Native 0.85.1's `ReactFabric-dev.js` running in Node 22
against the stubs in `rn-harness/`. Goldens live in `rn-harness/out/*.json`.

## The seam

Fabric's JS renderer calls a single global object installed by the native
runtime: `globalThis.nativeFabricUIManager`. In a real device this is a JSI
binding that trampolines into C++; in our harness it's a pure-JS recorder
(see `rn-harness/src/captureStub.ts`).

The renderer destructures this global eagerly at module init:

```js
// react-native/Libraries/Renderer/implementations/ReactFabric-dev.js:18694-18711
var _nativeFabricUIManage = nativeFabricUIManager,
    createNode = _nativeFabricUIManage.createNode,
    cloneNodeWithNewChildren = _nativeFabricUIManage.cloneNodeWithNewChildren,
    cloneNodeWithNewChildrenAndProps = _nativeFabricUIManage.cloneNodeWithNewChildrenAndProps,
    cloneNodeWithNewProps = _nativeFabricUIManage.cloneNodeWithNewProps,
    createChildNodeSet = _nativeFabricUIManage.createChildSet,
    appendChildNode = _nativeFabricUIManage.appendChild,
    appendChildNodeToSet = _nativeFabricUIManage.appendChildToSet,
    completeRoot = _nativeFabricUIManage.completeRoot,
    registerEventHandler = _nativeFabricUIManage.registerEventHandler,
    FabricDiscretePriority = _nativeFabricUIManage.unstable_DiscreteEventPriority,
    FabricContinuousPriority = _nativeFabricUIManage.unstable_ContinuousEventPriority,
    FabricIdlePriority = _nativeFabricUIManage.unstable_IdleEventPriority,
    fabricGetCurrentEventPriority = _nativeFabricUIManage.unstable_getCurrentEventPriority;
```

That means the stub must be installed before the renderer file is first
required — which is why `rn-harness/src/loadFabric.ts` is ordering-sensitive.

## Instruction types

The stable call surface is **10 functions** that produce the mount-instruction
stream plus a handful of measure / command / event methods that don't. Each
entry below maps the Fabric call to its intended Android view op — that's the
mapping Phase 2's translator has to implement.

### Tree-construction ops

| Fabric call | When emitted | Android view op | Notes |
| --- | --- | --- | --- |
| `createNode(reactTag, viewName, surfaceId, props, eventEmitter)` | First time a host fiber commits | Instantiate a `View` of the mapped Android class | `viewName` is the key into `ReactNativeViewConfigRegistry`. `props` is the output of `createAttributePayload(newProps, viewConfig.validAttributes)`. |
| `cloneNode(node)` | Paper-compat path, unused in current RN | — | Emitted if the reconciler needs a structural clone without prop changes. We have not observed it in any fixture. |
| `cloneNodeWithNewChildren(node)` | Children change but props are identical | `ViewGroup.removeAllViews()` + re-attach | Fabric treats node identity as immutable; "mutation" is clone-then-swap. |
| `cloneNodeWithNewProps(node, newProps)` | Props change but children are identical | `view.updateProperties(diff)` | `newProps` is the diff from `diffAttributePayloads`. |
| `cloneNodeWithNewChildrenAndProps(node, newProps)` | Both props and children change | Combine of the two above | The common case for interactive updates. |
| `createChildSet(surfaceId)` | Once per commit, at the root | No-op (the child set is a transient holder) | Returned handle is only used with `appendChildToSet` and `completeRoot`. |
| `appendChild(parent, child)` | Building a new subtree | `ViewGroup.addView(child)` | Always inside a clone — never mutates in place. |
| `appendChildToSet(childSet, child)` | Attaching a top-level child to a root | Equivalent of `appendChild` for the surface's root ViewGroup | |
| `completeRoot(surfaceId, childSet)` | End of commit | Apply the built child set to the surface's root view | This is the single atomic "display the new frame" signal. |

### Runtime ops (captured but not part of the mount stream)

| Fabric call | Purpose |
| --- | --- |
| `registerEventHandler(cb)` | One-time: Fabric registers a JS callback the native side uses to dispatch synthetic events. Happens once per runtime, not per render. |
| `measure / measureInWindow / measureLayout` | Synchronous reads of the native shadow-tree layout. Returns `[]` in our Node stub because we don't run Yoga — see _Known gaps_ below. |
| `findNodeAtPoint` | Inspector/hit-test. |
| `setIsJSResponder(node, blockNative, isJSResponder)` | Gesture responder coordination (the piece `react-native-gesture-handler` cares about). |
| `dispatchCommand(node, command, args)` | Imperative view commands (`scrollToOffset`, `focus`, …). |
| `sendAccessibilityEvent(node, eventType)` | Accessibility hooks. |

### Event priorities

`unstable_DiscreteEventPriority`, `unstable_ContinuousEventPriority`, and
`unstable_IdleEventPriority` are integer constants the scheduler uses to bucket
event-driven updates. Not mount instructions; exposing constants to JS.

## Observed commit shape

Every successful root commit in our fixtures follows the same structure:

```
createNode  (leaf-first, child before parent)
createNode  …
createNode  …                        ← all host nodes for the initial tree
createChildSet(surfaceId)
appendChildToSet(childSet, rootNode)
completeRoot(surfaceId, childSet)
```

For an all-fresh initial mount there are **no clone ops** — clones only appear
on updates after the first commit. `registerEventHandler` fires exactly once
per Fabric runtime, ahead of the first commit.

Examples in `rn-harness/out/`:

| Fixture | Instructions | What it exercises |
| --- | --- | --- |
| `simpleView.json` | 4 | Single `RCTView`; the minimum commit shape. |
| `nestedViews.json` | 20 | 9 views across 2 rows × 3 columns + 2 row containers + 1 outer. |
| `textAndImage.json` | 16 | `RCTImageView` + two `RCTParagraph`/`RCTRawText` stacks. |
| `scrollView.json` | 18 | `RCTScrollView` → `RCTScrollContentView` → 6 rows. |
| `conditional.json` | 26 | Component boundaries (`<Card>`), `null` children, repeated siblings. |

Re-run anytime with `npm --prefix rn-harness run capture`.

## Self-containment check

The plan asked whether the instruction stream is fully self-contained (no JS
callbacks needed to reconstruct the view tree). For pure structural mount the
answer is **yes**:

- `createNode` carries `viewName` + `props` in full. The Phase 2 translator
  maps `viewName` → Android view class and `props` → view-property calls.
- `appendChild` / `appendChildToSet` / `completeRoot` encode the tree shape
  without ambiguity.
- `reactTag` is monotonic and referenced by later ops.

For update flows the stream also self-contains, because `cloneNodeWithNewProps`
and its siblings emit the full new-props diff and the updated child ordering.

There are two categories where the stream is _not_ self-contained:

1. **Text measurement.** Fabric defers `measureText` to the host platform via
   a JSI callback. Without a measurer, Yoga can't size text nodes.
   We will need to ship our own (HarfBuzz + ICU, or layoutlib's Minikin
   wrapper).
2. **Imperative commands driven from native.** `dispatchCommand` and
   `setIsJSResponder` are typically JS→native, but a few libraries
   (`react-native-reanimated` worklets, gesture handler) commit mount changes
   from native threads without JS awareness. Those won't appear in our stream
   because they're invisible to the JS renderer. Phase 3's native module
   audit handles this.

## Known gaps in the Node capture

These deliver slightly different streams vs. a real device; track them
against goldens when Phase 2 starts pixel-diffing.

- **No layout metrics.** Real Fabric runs Yoga in C++ and the layout result
  is attached to each ShadowNode. Our `measure*` stubs return nothing.
  Phase 2 will either run `yoga-layout` from Node alongside the capture or
  delegate to layoutlib's measure pass.
- **No public-instance method calls.** Apps that call `ref.measure()` will
  see no-op under the stub; instruction-stream tests aren't a good fit for
  that path.
- **Event handler is registered once.** Per-event dispatch is out of scope
  for Phase 1 (we're not driving user input in Node).
- **No concurrent-root work.** We render with `concurrentRoot=false` to get
  a synchronous commit. In a real app, concurrent updates can fragment the
  stream across multiple `completeRoot` calls. Worth adding a fixture for
  Phase 2 if the translator has to handle interleaved commits.

## Cross-references into RN source

All line numbers are for `react-native@0.85.1`.

- Destructure of `nativeFabricUIManager`:
  `node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-dev.js:18694-18711`
- `render()` entry point:
  `…/ReactFabric-dev.js:19021-19085`
- `createAttributePayload` boundary:
  `…/ReactFabric-dev.js:10051-10054`
- `diffAttributePayloads` boundary:
  `…/ReactFabric-dev.js:10004-10008`
- `ReactNativeViewConfigRegistry.get` seam for viewName → config:
  `…/ReactFabric-dev.js:18810-18811`
- Root commit sequence (`createChildSet` → `appendChildToSet` → `completeRoot`):
  `…/ReactFabric-dev.js:15902-15964`

The RN renderer is synced verbatim from `facebook/react` at publish time, so
these line numbers drift per release. Re-verify whenever we bump RN.
