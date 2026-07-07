"use strict";

// src/shims.ts
var g = globalThis;
function installNativeDomMock() {
  if (g.__rnQuickRenderNativeDomMocked) return;
  g.__rnQuickRenderNativeDomMocked = true;
  if (typeof jest === "undefined") {
    throw new Error(
      "rn-quick-render-jest must run inside a Jest test environment"
    );
  }
  const nativeDomSpec = "react-native/src/private/webapis/dom/nodes/specs/NativeDOM";
  try {
    require.resolve(nativeDomSpec);
  } catch {
    return;
  }
  jest.doMock(
    nativeDomSpec,
    () => ({
      __esModule: true,
      default: {
        linkRootNode: (rootTag, _instanceHandle) => ({
          __nativeDomRootShadowNode: rootTag
        }),
        getParentNode: () => null,
        getChildNodes: () => [],
        isConnected: () => false,
        compareDocumentPosition: () => 0,
        getTextContent: () => "",
        getBoundingClientRect: () => [0, 0, 0, 0],
        getOffset: () => [null, 0, 0],
        getScrollPosition: () => [0, 0],
        getScrollSize: () => [0, 0],
        getInnerSize: () => [0, 0],
        getBorderWidth: () => [0, 0, 0, 0],
        getTagName: () => "",
        getElementById: () => null,
        hasPointerCapture: () => false,
        setPointerCapture: () => {
        },
        releasePointerCapture: () => {
        },
        measure: () => {
        },
        measureInWindow: () => {
        },
        measureLayout: () => {
        },
        setNativeProps: () => {
        }
      }
    })
  );
}

// src/setup.ts
installNativeDomMock();
