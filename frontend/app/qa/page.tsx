"use client"

import IframeWindow from "@/components/iframe-window"

export default function QAPage() {
  const src = "http://127.0.0.1:5173/chat"
  const allowedOrigins = (() => {
    try {
      const u = new URL(src, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
      return [u.origin, typeof window !== 'undefined' ? window.location.origin : u.origin]
    } catch {
      return typeof window !== 'undefined' ? [window.location.origin] : []
    }
  })()
  return (
    <div className="h-full w-full">
      <IframeWindow src={src} title="智能问答" allowedOrigins={allowedOrigins} />
    </div>
  )
}
