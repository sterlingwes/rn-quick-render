export type ColorScheme = "light" | "dark";

export interface ScreenSnapshotOptions {
  /** Artifact base name; also the golden name the verify step diffs against. */
  name: string;
  /** Device profiles the render step fans out to. Default ["pixel5"]. */
  devices?: string[];
  /** Font-scale buckets the render step fans out to. Default ["default"]. */
  fontScales?: string[];
  /** Capture once per scheme via RN's useColorScheme(). Dark writes `<name>__dark.json`. */
  colorSchemes?: ColorScheme[];
  /** Where artifacts + manifests go. Default $RN_QUICK_RENDER_SNAPS_DIR or <cwd>/__screensnaps__. */
  outDir?: string;
}

export interface CapturedArtifact {
  scheme: ColorScheme | null;
  artifactPath: string;
  instructions: unknown[];
}

export interface ScreenSnapshotResult {
  artifacts: CapturedArtifact[];
  artifactPath: string;
  instructions: unknown[];
}

export function screenSnapshot(
  element: unknown,
  opts: ScreenSnapshotOptions,
): ScreenSnapshotResult;
