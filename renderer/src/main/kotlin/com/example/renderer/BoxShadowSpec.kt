package com.example.renderer

/**
 * One drop-shadow spec parsed from a `style.boxShadow` entry.
 *
 * All offsets / radii are in dp; the renderer multiplies by density before
 * painting on the canvas. `color` is the resolved ARGB int.
 *
 * Inset shadows aren't represented here — they need a different draw
 * strategy (clip the view rect, invert) and aren't supported in the
 * Phase 2.5 v1.
 */
data class BoxShadowSpec(
    val offsetX: Float,
    val offsetY: Float,
    val blurRadius: Float,
    val spreadDistance: Float,
    val color: Int,
)
