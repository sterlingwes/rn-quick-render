# Phase 2 golden PNGs

Per-fixture PNG goldens for `SnapshotRendererTest`. One PNG per Phase 1 fixture:

- `simpleView.png`
- `nestedViews.png`
- `textAndImage.png`
- `scrollView.png`
- `conditional.png`

## How to (re)record

```bash
./gradlew :renderer:test -Drenderer.record=true
```

Or, on first CI run when no goldens exist, download the
`phase2-fresh-renders` artifact from the failing job and commit the PNGs
to this directory.
