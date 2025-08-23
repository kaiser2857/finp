"use client"

import React from "react"
import type { VisualizationSpec, EmbedOptions, Result as EmbedResult } from "vega-embed"

interface VegaLiteRendererProps {
  spec: VisualizationSpec | any
  className?: string
  options?: EmbedOptions
}

// Lightweight wrapper around vega-embed. Renders once and updates on spec change.
export default function VegaLiteRenderer({ spec, className, options }: VegaLiteRendererProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const viewRef = React.useRef<EmbedResult | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const el = containerRef.current
    if (!el) return

    // Clear previous rendering before embedding new one
    el.innerHTML = ""

    // Provide defaults for nicer sizing (prefer SVG to avoid Node 'canvas' module)
    const merged: EmbedOptions = {
      actions: false,
      renderer: "svg",
      ...(options || {}),
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const loadVegaEmbed = async (attempt = 1): Promise<any> => {
      try {
        const mod = await import("vega-embed")
        return (mod as any).default ?? (mod as any)
      } catch (e) {
        // Dev server may 404 the chunk before it’s ready; retry a few times
        if (attempt < 5) {
          await sleep(300 * attempt + 200)
          return loadVegaEmbed(attempt + 1)
        }
        // As a last resort, load from a CDN as an ESM bundle so charts still render in dev
        try {
          // @ts-ignore - dynamic import of external URL used as a safe fallback in the browser only
          const cdnMod = await import(
            // @ts-ignore
            /* webpackIgnore: true */ "https://esm.sh/vega-embed@7.0.2?bundle&target=es2020"
          )
          return (cdnMod as any).default ?? (cdnMod as any)
        } catch {
          throw e
        }
      }
    }

    ;(async () => {
      try {
        const doEmbed = await loadVegaEmbed()
        // Attempt embed with a retry as well, in case the module loaded but assets lag
        const tryEmbed = async (attempt = 1) => {
          try {
            if (!containerRef.current || cancelled) return
            const res: EmbedResult = await doEmbed(el, spec as VisualizationSpec, merged)
            if (!cancelled) viewRef.current = res
          } catch (err) {
            if (attempt < 3) {
              await sleep(250 * attempt + 150)
              return tryEmbed(attempt + 1)
            }
            // swallow render errors in UI
          }
        }
        await tryEmbed()
      } catch (e) {
        // swallow import errors in UI
      }
    })()

    return () => {
      cancelled = true
      try { (viewRef.current as any)?.view?.finalize?.() } catch {}
      viewRef.current = null
    }
  }, [spec, options])

  return <div ref={containerRef} className={className || "w-full h-full"} />
}
