"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { Loader2 } from "lucide-react"

interface TextMarkdownProps {
  componentId: string
  value: string
  onChange?: (next: string) => void
  // When true, hide toolbar/status header (for dialog middle column edit-only UX)
  hideToolbar?: boolean
  // If provided, lock the UI to this mode. Useful to force edit-only.
  fixedMode?: Mode
}

type Mode = "split" | "edit" | "preview"

export default function TextMarkdown({ componentId, value, onChange, hideToolbar, fixedMode }: TextMarkdownProps) {
  const [text, setText] = useState<string>(value || "")
  const [mode, setMode] = useState<Mode>(fixedMode || "split")
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lastSavedRef = useRef<string>(value || "")
  const timerRef = useRef<any>(null)
  const mountedRef = useRef<boolean>(false)

  // keep prop in sync if componentId changes or external update happens
  useEffect(() => {
    // avoid clobbering local edits if only value changes rapidly with same content
    if (value !== text && value !== lastSavedRef.current) {
      setText(value || "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentId])

  // Lock mode when fixedMode changes
  useEffect(() => {
    if (fixedMode) setMode(fixedMode)
  }, [fixedMode])

  const doSave = useCallback(async (content: string) => {
    if (!componentId) return
    try {
      setSaving(true)
      setError(null)
      // Replace config for text component (backend treats PATCH and merges server-side)
      await api.updateEnhancedComponent(componentId, {
        config: { encoding: { content }, mark: "text", options: { markdown: true } },
      } as any)
      lastSavedRef.current = content
      setSavedAt(Date.now())
    } catch (e: any) {
      setError(e?.message || "保存失败")
    } finally {
      setSaving(false)
    }
  }, [componentId])

  // debounce autosave
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (text === lastSavedRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { doSave(text) }, 800)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, doSave])

  const statusEl = useMemo(() => {
    if (saving) return (
      <span className="text-xs text-gray-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 保存中…</span>
    )
    if (error) return <span className="text-xs text-red-600">{error}</span>
    if (savedAt) return <span className="text-xs text-gray-400">已保存 {new Date(savedAt).toLocaleTimeString()}</span>
    return null
  }, [saving, savedAt, error])

  const handleChange = (next: string) => {
    setText(next)
    onChange?.(next)
  }

  // shortcut: Ctrl/Cmd+S to save immediately
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
        if (text !== lastSavedRef.current) doSave(text)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [text, doSave])

  const editor = (
    <textarea
      className="w-full h-full resize-none outline-none p-3 text-sm font-mono bg-white border rounded-md"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="支持 Markdown（表格、列表、任务列表、链接、代码块等）。Ctrl/Cmd+S 手动保存。"
    />
  )

  const preview = (
    <div className="prose max-w-none prose-sm sm:prose-base p-3 overflow-auto border rounded-md bg-white">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || "_暂无内容_"}</ReactMarkdown>
    </div>
  )

  // Use locked mode if provided
  const effectiveMode = fixedMode || mode

  return (
    <div className="h-full w-full flex flex-col gap-2">
      {!hideToolbar && (
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded p-1">
            <Button variant={effectiveMode === "edit" ? "default" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setMode("edit")} disabled={!!fixedMode}>编辑</Button>
            <Button variant={effectiveMode === "preview" ? "default" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setMode("preview")} disabled={!!fixedMode}>预览</Button>
            <Button variant={effectiveMode === "split" ? "default" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setMode("split")} disabled={!!fixedMode}>分屏</Button>
          </div>
          <div>{statusEl}</div>
        </div>
      )}

      {effectiveMode === "edit" && (
        <div className="flex-1 min-h-[200px]">{editor}</div>
      )}
      {effectiveMode === "preview" && (
        <div className="flex-1 min-h-[200px]">{preview}</div>
      )}
      {effectiveMode === "split" && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 min-h-[220px]">
          <div className="min-h-[200px]">{editor}</div>
          <div className="min-h-[200px]">{preview}</div>
        </div>
      )}
    </div>
  )
}
