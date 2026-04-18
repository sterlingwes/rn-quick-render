import type { MountInstruction } from "./types";

// Yoga is shipped as an async ESM module (top-level await). Cache the loaded
// instance so downstream callers can just `await getYoga()` without dealing
// with the dynamic import dance each time.
let yogaPromise: Promise<any> | null = null;
async function getYoga(): Promise<any> {
  if (!yogaPromise) {
    // `yoga-layout/load` is a package-exports subpath that TS's `node`
    // moduleResolution doesn't walk. Bypass the static check; runtime
    // resolution works in Node 16+.
    const mod: any = await (Function("return import('yoga-layout/load')") as () => Promise<any>)();
    yogaPromise = mod.loadYoga();
  }
  return yogaPromise;
}

export interface LayoutRect {
  /** Position relative to the parent in dp. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  /** Viewport size used for the layout pass. */
  viewport: { width: number; height: number };
  /** nodeId → computed rect in dp, relative to the parent. */
  rects: Record<number, LayoutRect>;
  /** Root nodeIds in the order they appear in the surface's child set. */
  roots: number[];
}

export interface ComputeLayoutOptions {
  /** Surface width in dp. Defaults to Paparazzi's Pixel 5 (411 dp). */
  width?: number;
  /** Surface height in dp. Defaults to Paparazzi's Pixel 5 (891 dp). */
  height?: number;
}

interface Node {
  nodeId: number;
  viewName: string;
  props: Record<string, any>;
  children: number[];
}

// Rough text metrics. Real Fabric defers this to Minikin on Android / CoreText on
// iOS. We approximate so the tree has believable dimensions — Phase 2's known
// gap is that pixel-perfect text needs a real measurer (Phase 2.5).
const AVG_CHAR_WIDTH_RATIO = 0.55; // lowercase English at Roboto-ish weights
const LINE_HEIGHT_RATIO = 1.25;

function collectParagraphText(root: Node, nodes: Map<number, Node>): string {
  const out: string[] = [];
  const visit = (n: Node) => {
    if (n.viewName === "RCTRawText") {
      const txt = n.props?.text;
      if (typeof txt === "string") out.push(txt);
    }
    for (const childId of n.children) {
      const child = nodes.get(childId);
      if (child) visit(child);
    }
  };
  visit(root);
  return out.join("");
}

function isTextLeaf(viewName: string): boolean {
  return viewName === "RCTParagraph" || viewName === "RCTText";
}

function measureParagraph(text: string, fontSize: number, availableWidth: number): { width: number; height: number } {
  if (text.length === 0) return { width: 0, height: 0 };
  const charW = fontSize * AVG_CHAR_WIDTH_RATIO;
  const lineH = fontSize * LINE_HEIGHT_RATIO;
  const unconstrainedW = text.length * charW;
  const effectiveW = Number.isFinite(availableWidth) && availableWidth > 0
    ? Math.min(unconstrainedW, availableWidth)
    : unconstrainedW;
  const charsPerLine = Math.max(1, Math.floor((effectiveW || unconstrainedW) / charW));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return { width: effectiveW, height: lines * lineH };
}

type YogaEdge = number;

const edgeByKey = (Yoga: any): Record<string, YogaEdge> => ({
  top: Yoga.EDGE_TOP,
  right: Yoga.EDGE_RIGHT,
  bottom: Yoga.EDGE_BOTTOM,
  left: Yoga.EDGE_LEFT,
  horizontal: Yoga.EDGE_HORIZONTAL,
  vertical: Yoga.EDGE_VERTICAL,
  start: Yoga.EDGE_START,
  end: Yoga.EDGE_END,
  all: Yoga.EDGE_ALL,
});

function toYogaValue(raw: unknown): { value: number; percent: boolean } | null {
  if (typeof raw === "number") return { value: raw, percent: false };
  if (typeof raw === "string" && raw.endsWith("%")) {
    const v = parseFloat(raw.slice(0, -1));
    if (!Number.isFinite(v)) return null;
    return { value: v, percent: true };
  }
  return null;
}

// Build the tree implied by a mount-instruction stream. `completeRoot` is the
// commit boundary — only children appended to the child set that matches the
// final `completeRoot` become roots.
function reconstructTree(instructions: MountInstruction[]): { nodes: Map<number, Node>; roots: number[] } {
  const nodes = new Map<number, Node>();
  const childSets = new Map<number, number[]>();
  let roots: number[] = [];

  for (const ins of instructions) {
    switch (ins.op) {
      case "createNode":
        nodes.set(ins.nodeId, {
          nodeId: ins.nodeId,
          viewName: ins.viewName,
          props: ins.props ?? {},
          children: [],
        });
        break;
      case "appendChild": {
        const parent = nodes.get(ins.parentNodeId);
        if (parent) parent.children.push(ins.childNodeId);
        break;
      }
      case "createChildSet":
        childSets.set(ins.childSetId, []);
        break;
      case "appendChildToSet": {
        const set = childSets.get(ins.childSetId);
        if (set) set.push(ins.childNodeId);
        break;
      }
      case "completeRoot": {
        const set = childSets.get(ins.childSetId);
        if (set) roots = set.slice();
        break;
      }
      // Clone/update ops are not exercised by Phase 1 initial-mount fixtures.
      default:
        break;
    }
  }

  return { nodes, roots };
}

function applyStyle(Yoga: any, node: any, style: Record<string, any> | undefined) {
  if (!style) return;
  const edges = edgeByKey(Yoga);

  const setDimension = (key: "Width" | "Height" | "MinWidth" | "MinHeight" | "MaxWidth" | "MaxHeight", raw: unknown) => {
    const v = toYogaValue(raw);
    if (v == null) return;
    if (v.percent) (node as any)[`set${key}Percent`](v.value);
    else (node as any)[`set${key}`](v.value);
  };

  const applyEdgeProp = (method: string, edge: YogaEdge, raw: unknown) => {
    const v = toYogaValue(raw);
    if (v == null) return;
    if (v.percent) (node as any)[`${method}Percent`](edge, v.value);
    else (node as any)[method](edge, v.value);
  };

  // Pass 1: direct sizing + flex props.
  if ("width" in style) setDimension("Width", style.width);
  if ("height" in style) setDimension("Height", style.height);
  if ("minWidth" in style) setDimension("MinWidth", style.minWidth);
  if ("minHeight" in style) setDimension("MinHeight", style.minHeight);
  if ("maxWidth" in style) setDimension("MaxWidth", style.maxWidth);
  if ("maxHeight" in style) setDimension("MaxHeight", style.maxHeight);
  if ("aspectRatio" in style && typeof style.aspectRatio === "number") node.setAspectRatio(style.aspectRatio);

  if (typeof style.flex === "number") node.setFlex(style.flex);
  if (typeof style.flexGrow === "number") node.setFlexGrow(style.flexGrow);
  if (typeof style.flexShrink === "number") node.setFlexShrink(style.flexShrink);
  if ("flexBasis" in style) {
    const v = toYogaValue(style.flexBasis);
    if (v) (v.percent ? node.setFlexBasisPercent(v.value) : node.setFlexBasis(v.value));
  }

  const flexDirectionMap: Record<string, number> = {
    row: Yoga.FLEX_DIRECTION_ROW,
    "row-reverse": Yoga.FLEX_DIRECTION_ROW_REVERSE,
    column: Yoga.FLEX_DIRECTION_COLUMN,
    "column-reverse": Yoga.FLEX_DIRECTION_COLUMN_REVERSE,
  };
  if (style.flexDirection in flexDirectionMap) node.setFlexDirection(flexDirectionMap[style.flexDirection]);

  const flexWrapMap: Record<string, number> = {
    nowrap: Yoga.WRAP_NO_WRAP,
    wrap: Yoga.WRAP_WRAP,
    "wrap-reverse": Yoga.WRAP_WRAP_REVERSE,
  };
  if (style.flexWrap in flexWrapMap) node.setFlexWrap(flexWrapMap[style.flexWrap]);

  const alignMap: Record<string, number> = {
    auto: Yoga.ALIGN_AUTO,
    "flex-start": Yoga.ALIGN_FLEX_START,
    center: Yoga.ALIGN_CENTER,
    "flex-end": Yoga.ALIGN_FLEX_END,
    stretch: Yoga.ALIGN_STRETCH,
    baseline: Yoga.ALIGN_BASELINE,
    "space-between": Yoga.ALIGN_SPACE_BETWEEN,
    "space-around": Yoga.ALIGN_SPACE_AROUND,
  };
  if (style.alignItems in alignMap) node.setAlignItems(alignMap[style.alignItems]);
  if (style.alignSelf in alignMap) node.setAlignSelf(alignMap[style.alignSelf]);
  if (style.alignContent in alignMap) node.setAlignContent(alignMap[style.alignContent]);

  const justifyMap: Record<string, number> = {
    "flex-start": Yoga.JUSTIFY_FLEX_START,
    center: Yoga.JUSTIFY_CENTER,
    "flex-end": Yoga.JUSTIFY_FLEX_END,
    "space-between": Yoga.JUSTIFY_SPACE_BETWEEN,
    "space-around": Yoga.JUSTIFY_SPACE_AROUND,
    "space-evenly": Yoga.JUSTIFY_SPACE_EVENLY,
  };
  if (style.justifyContent in justifyMap) node.setJustifyContent(justifyMap[style.justifyContent]);

  if (style.position === "absolute") node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE);
  else if (style.position === "relative") node.setPositionType(Yoga.POSITION_TYPE_RELATIVE);

  // Edge-addressed props: padding / margin / border / position offsets.
  const edgeGroups: Array<[string, string, string[]]> = [
    ["setPadding", "padding", ["padding", "paddingHorizontal", "paddingVertical", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "paddingStart", "paddingEnd"]],
    ["setMargin", "margin", ["margin", "marginHorizontal", "marginVertical", "marginTop", "marginRight", "marginBottom", "marginLeft", "marginStart", "marginEnd"]],
    ["setBorder", "border", ["borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStartWidth", "borderEndWidth"]],
  ];
  const edgeForSuffix: Record<string, YogaEdge> = {
    "": edges.all, Horizontal: edges.horizontal, Vertical: edges.vertical,
    Top: edges.top, Right: edges.right, Bottom: edges.bottom, Left: edges.left,
    Start: edges.start, End: edges.end,
  };
  for (const [method, base, keys] of edgeGroups) {
    for (const key of keys) {
      if (!(key in style)) continue;
      const suffix = key.slice(base.length).replace("Width", "");
      const edge = edgeForSuffix[suffix] ?? edges.all;
      applyEdgeProp(method, edge, style[key]);
    }
  }

  // `top`/`right`/`bottom`/`left`/`start`/`end` at the style root drive position offsets.
  const positionEdges: Array<[string, YogaEdge]> = [
    ["top", edges.top], ["right", edges.right], ["bottom", edges.bottom],
    ["left", edges.left], ["start", edges.start], ["end", edges.end],
  ];
  for (const [key, edge] of positionEdges) {
    if (key in style) applyEdgeProp("setPosition", edge, style[key]);
  }
}

export async function computeLayout(
  instructions: MountInstruction[],
  opts: ComputeLayoutOptions = {},
): Promise<LayoutResult> {
  const Yoga = await getYoga();
  const { nodes, roots } = reconstructTree(instructions);

  const viewport = { width: opts.width ?? 411, height: opts.height ?? 891 };

  // Build Yoga nodes for every host node in our tree plus a synthetic parent
  // that holds the surface's root children (mirrors what Fabric's C++ root
  // ShadowNode does for us in a real runtime).
  //
  // RCTRawText leaves don't participate in layout — they carry the text string
  // but their visual extent is owned by the enclosing RCTParagraph. We skip
  // them on the Yoga side and rely on the paragraph's measureFunc.
  const yogaNodes = new Map<number, any>();
  for (const node of nodes.values()) {
    if (node.viewName === "RCTRawText") continue;
    const y = Yoga.Node.create();
    applyStyle(Yoga, y, node.props?.style as Record<string, any> | undefined);

    if (isTextLeaf(node.viewName)) {
      const text = collectParagraphText(node, nodes);
      const fontSize = (node.props?.style?.fontSize as number | undefined) ?? 14;
      y.setMeasureFunc((availableWidth: number) => measureParagraph(text, fontSize, availableWidth));
    }

    yogaNodes.set(node.nodeId, y);
  }

  for (const node of nodes.values()) {
    const y = yogaNodes.get(node.nodeId);
    if (!y) continue;
    // Text leaves own their layout via measureFunc; skip inserting children.
    if (isTextLeaf(node.viewName)) continue;
    node.children.forEach((childId, idx) => {
      const child = yogaNodes.get(childId);
      if (child) y.insertChild(child, idx);
    });
  }

  const surfaceRoot = Yoga.Node.create();
  surfaceRoot.setWidth(viewport.width);
  surfaceRoot.setHeight(viewport.height);
  roots.forEach((rootId, idx) => {
    const y = yogaNodes.get(rootId);
    if (y) surfaceRoot.insertChild(y, idx);
  });

  surfaceRoot.calculateLayout(viewport.width, viewport.height, Yoga.DIRECTION_LTR);

  const rects: Record<number, LayoutRect> = {};
  for (const [nodeId, y] of yogaNodes) {
    rects[nodeId] = {
      left: Math.round(y.getComputedLeft() * 1000) / 1000,
      top: Math.round(y.getComputedTop() * 1000) / 1000,
      width: Math.round(y.getComputedWidth() * 1000) / 1000,
      height: Math.round(y.getComputedHeight() * 1000) / 1000,
    };
  }

  surfaceRoot.freeRecursive();

  return { viewport, rects, roots };
}
