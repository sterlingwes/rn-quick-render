package com.example.renderer

import android.graphics.Typeface
import java.io.File

/**
 * Resolves React Native `fontFamily` names to [Typeface] instances.
 *
 * RN apps reference fonts by string ("Inter", "Roboto Mono", "SF Pro"),
 * the same name that appears in `style.fontFamily`. The font itself is
 * shipped under `android/app/src/main/assets/fonts/` and registered with
 * the system at install time. In our headless renderer there is no
 * install step — callers register fonts up-front via [register] (one
 * entry per family name → loaded [Typeface]) and the rest of the
 * pipeline asks the registry to resolve each family it encounters.
 *
 * Lookup order in [resolve]:
 *   1. Custom registrations from [register] / [registerFile].
 *   2. Built-in family names handled by [Typeface.create] —
 *      `"sans-serif"`, `"serif"`, `"monospace"`, etc.
 *   3. [Typeface.DEFAULT] as the final fallback, with a one-line
 *      diagnostic to stderr so missing fonts don't fail silently.
 *
 * The registry is intentionally immutable from the renderer's
 * perspective — register everything before constructing
 * [SnapshotRenderer], then read-only at render time.
 */
class FontRegistry {

    private val byFamily: MutableMap<String, Typeface> = mutableMapOf()
    private val warned: MutableSet<String> = mutableSetOf()

    /** Register a pre-loaded [Typeface] under [family]. */
    fun register(family: String, typeface: Typeface): FontRegistry {
        byFamily[family] = typeface
        return this
    }

    /**
     * Load a `.ttf` (or `.otf`) from disk and register it under [family].
     * Equivalent to `register(family, Typeface.createFromFile(file))`.
     */
    fun registerFile(family: String, file: File): FontRegistry {
        require(file.isFile) { "Font file not found: ${file.absolutePath}" }
        return register(family, Typeface.createFromFile(file))
    }

    /**
     * Resolve [family] + [weight] (one of [Typeface.NORMAL] / [Typeface.BOLD]
     * / [Typeface.ITALIC] / [Typeface.BOLD_ITALIC]) to a [Typeface].
     *
     * `family == null` falls straight through to [Typeface.DEFAULT] with
     * the requested weight — that's the no-fontFamily case and not a
     * "missing font" situation, so it doesn't warn.
     */
    fun resolve(family: String?, weight: Int = Typeface.NORMAL): Typeface {
        if (family.isNullOrEmpty()) return Typeface.create(Typeface.DEFAULT, weight)
        val custom = byFamily[family]
        if (custom != null) return Typeface.create(custom, weight)
        // Fall through to the system loader — Typeface.create("serif", ...)
        // returns the platform serif face, etc. If the family isn't known
        // to the platform either, the call returns Typeface.DEFAULT.
        val resolved = Typeface.create(family, weight)
        if (resolved == Typeface.DEFAULT || resolved == Typeface.create(Typeface.DEFAULT, weight)) {
            // Likely missed — Typeface.create silently falls back to DEFAULT.
            if (warned.add(family)) {
                System.err.println(
                    "[FontRegistry] fontFamily=\"$family\" not registered; falling back to default."
                )
            }
        }
        return resolved
    }

    /** True if [family] has a custom registration (system families don't count). */
    fun hasCustom(family: String?): Boolean = family != null && byFamily.containsKey(family)

    companion object {
        /** A no-op registry — every lookup falls through to the platform default. */
        val EMPTY: FontRegistry = FontRegistry()
    }
}
