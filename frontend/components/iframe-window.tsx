"use client"

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"

export interface IframeWindowHandle {
  postMessage: (message: any, targetOrigin?: string) => void
}

interface IframeWindowProps {
  src: string
  title?: string
  timeoutMs?: number
  className?: string
  allowedOrigins?: string[] | "*"
  onMessage?: (event: MessageEvent) => void
}

const IframeWindow = forwardRef<IframeWindowHandle, IframeWindowProps>(function IframeWindow(
  { src, title = "External App", timeoutMs = 5000, className, allowedOrigins, onMessage },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  const defaultTargetOrigin = useMemo(() => {
    try {
      const url = new URL(src, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
      return url.origin
    } catch {
      return "*"
    }
  }, [src])

  const allowed = useMemo(() => {
    if (allowedOrigins === "*") return "*" as const
    if (Array.isArray(allowedOrigins) && allowedOrigins.length > 0) return allowedOrigins
    const list = new Set<string>()
    if (typeof window !== 'undefined') list.add(window.location.origin)
    if (defaultTargetOrigin) list.add(defaultTargetOrigin)
    return Array.from(list)
  }, [allowedOrigins, defaultTargetOrigin])

  useImperativeHandle(ref, () => ({
    postMessage: (message: any, targetOrigin) => {
      const origin = targetOrigin ?? (allowed === "*" ? "*" : defaultTargetOrigin)
      iframeRef.current?.contentWindow?.postMessage(message, origin)
    },
  }))

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setTimedOut(true)
    }, timeoutMs)
    return () => clearTimeout(timer)
  }, [loaded, timeoutMs])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (allowed !== "*" && !allowed.includes(event.origin)) return
      onMessage?.(event)
      if (process.env.NODE_ENV !== "production") {
        console.debug("[IframeWindow] received message:", event.origin, event.data)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [allowed, onMessage])

  return (
    <div className={`relative w-full h-full overflow-hidden ${className || ""}`}>
      {!loaded && !timedOut && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">页面加载中…</div>
      )}
      {timedOut && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-red-600 bg-white">
          <div>加载失败，请检查对方系统是否正常</div>
          <button
            onClick={() => {
              setTimedOut(false)
              setLoaded(false)
              if (iframeRef.current) {
                const currentSrc = iframeRef.current.src
                iframeRef.current.src = currentSrc
              }
            }}
            className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            重试
          </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </div>
  )
})

export default IframeWindow
