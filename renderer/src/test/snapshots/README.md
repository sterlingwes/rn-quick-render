# Renderer golden PNGs

One PNG per capture fixture in `rn-harness/out/`, verified pixel-exact
by `SnapshotRendererTest`. Device / font-scale / theme variants live
under `matrix/` (owned by the matrix test classes).

## How to (re)record

```bash
./gradlew :renderer:test -Drenderer.record=true
```

Or download the fresh-renders artifact from the CI run (uploaded on
every run, even failures), eyeball it, and commit the PNGs here.
