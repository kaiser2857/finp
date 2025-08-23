"use client"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { X, Bot, Send, Plus, Loader2, Square, RotateCcw, ChevronDown, ChevronRight } from "lucide-react"
import React from "react"
import VegaLiteRenderer from "@/components/widget/vega-lite-renderer"

interface CanvasItem {
  id: string
  title: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isTool?: boolean
  tool?: string
  // New: collapsible support
  collapsible?: boolean
  collapsed?: boolean
  isToolBlock?: boolean
  // New: progress indicator
  inProgress?: boolean
  // New: structured payload for tool results (e.g., Vega-Lite spec)
  payload?: any
}

interface RightPanelProps {
  canvasItems: CanvasItem[]
  chatMessages: ChatMessage[]
  selectedModel: string
  availableModels?: string[]
  provider?: string
  // New: explicit provider selection support
  availableProviders?: string[]
  selectedContext: string[]
  newMessage: string
  isQuerying: boolean
  onClose?: () => void
  onModelChange: (model: string) => void
  // New: provider change callback
  onProviderChange?: (provider: string) => void
  onContextChange: (context: string[]) => void
  onMessageChange: (message: string) => void
  onSendMessage: () => void
  onStop?: () => void
  onRetry?: () => void
  // New: collapse toggler injected from context
  onToggleCollapse?: (id: string) => void
}

export default function RightPanel({
  canvasItems,
  chatMessages,
  selectedModel,
  availableModels = [],
  provider = "openai",
  // New: providers list
  availableProviders = [],
  selectedContext,
  newMessage,
  isQuerying,
  onClose,
  onModelChange,
  // New: provider change
  onProviderChange,
  onContextChange,
  onMessageChange,
  onSendMessage,
  onStop,
  onRetry,
  onToggleCollapse,
}: RightPanelProps) {
  const allIds = canvasItems.map((c) => c.id)
  const allSelected = selectedContext.length > 0 && selectedContext.length === allIds.length

  const bottomRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const toggleItem = (id: string, checked: boolean | string) => {
    if (checked) onContextChange([...new Set([...selectedContext, id])])
    else onContextChange(selectedContext.filter((x) => x !== id))
  }

  const selectAll = () => onContextChange(allIds)
  const clearAll = () => onContextChange([])

  // Helper: collect dataset names referenced in a Vega-Lite spec (recursively through layers)
  const collectDatasetNames = React.useCallback((spec: any): Set<string> => {
    const names = new Set<string>()
    const visit = (s: any) => {
      if (!s || typeof s !== 'object') return
      const d = s.data
      if (d && typeof d === 'object' && typeof d.name === 'string') {
        names.add(d.name)
      }
      if (Array.isArray(s.layer)) {
        for (const l of s.layer) visit(l)
      }
    }
    visit(spec)
    return names
  }, [])

  // Helper: extract query_result aliases mentioned in SQL text
  const extractVirtualAliasesFromSQL = React.useCallback((sql?: string | null): Set<string> => {
    const set = new Set<string>()
    if (!sql || typeof sql !== 'string') return set
    try {
      const re = /\bquery_result(?:_\d+)?\b/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(sql)) !== null) {
        set.add(m[0])
      }
    } catch {}
    return set
  }, [])

  // Build alias->rows map by scanning prior db_query messages (most recent first)
  const buildAliasRowsMap = React.useCallback((untilIndex: number): Record<string, any[]> => {
    const map: Record<string, any[]> = {}
    for (let i = untilIndex - 1; i >= 0; i--) {
      const m = chatMessages[i]
      if (!(m && m.isTool && m.tool === 'db_query')) continue
      const rows = (m.payload && (m.payload.rows || m.payload.result?.rows)) || undefined
      if (!Array.isArray(rows)) continue
      // Try to parse aliases from message content where normalized/injected SQL were appended
      const content = m.content || ''
      // Extract blocks after the markers we added
      let sqls: string[] = []
      try {
        const normMatch = content.match(/-- normalized SQL --[\r\n]+([\s\S]*?)(?:\n--|$)/i)
        if (normMatch && normMatch[1]) sqls.push(normMatch[1])
      } catch {}
      try {
        const injMatch = content.match(/-- injected SQL --[\r\n]+([\s\S]*?)(?:\n--|$)/i)
        if (injMatch && injMatch[1]) sqls.push(injMatch[1])
      } catch {}
      if (sqls.length === 0) sqls = [content]
      const aliases = new Set<string>()
      for (const s of sqls) {
        for (const a of extractVirtualAliasesFromSQL(s)) aliases.add(a)
      }
      // Assign rows to first-seen alias only; keep earlier bindings intact
      for (const a of aliases) {
        if (!(a in map)) map[a] = rows
      }
      // Also set base name if no alias detected and not set yet
      if (aliases.size === 0 && !('query_result' in map)) map['query_result'] = rows
    }
    return map
  }, [chatMessages, extractVirtualAliasesFromSQL])

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5" />
            AI 助手
          </h2>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {chatMessages.map((message, idx) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : message.isTool
                      ? "bg-gray-50 border border-gray-200 text-gray-800"
                      : "bg-gray-100 text-gray-900"
                }`}
              >
                {message.isTool ? (
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      {message.collapsible ? (
                        <button
                          className="inline-flex items-center text-gray-600 hover:text-gray-900"
                          onClick={() => onToggleCollapse?.(message.id)}
                          aria-label={message.collapsed ? 'Expand' : 'Collapse'}
                        >
                          {message.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : null}
                      Tool · {message.tool}
                      {message.inProgress ? <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> : null}
                    </p>
                  </div>
                ) : null}

                {/* Content area */}
                {message.isTool && message.collapsible ? (
                  <div
                    className={`${message.collapsed ? 'hidden' : 'block'} rounded border border-dashed border-gray-200 bg-white/60 max-h-64 overflow-auto p-2 resize-y min-h-[80px]`}
                  >
                    {(() => {
                      // Prefer rendering from structured payload for plot_render
                      if (message.tool === 'plot_render' && message.payload) {
                        const payload = message.payload
                        const spec = (payload?.spec) || (payload?.result?.spec) || payload
                        if (spec && (spec.mark || spec.layer || spec.encoding)) {
                          // If validation issues exist, show them above the chart
                          const issues: string[] | undefined = Array.isArray(payload?.issues) ? payload.issues : undefined
                          const ok: boolean | undefined = typeof payload?.ok === 'boolean' ? payload.ok : undefined

                          // Build datasets with backend-provided bindings if present; otherwise infer from prior db_query
                          let enrichedSpec = spec
                          try {
                            const backendDatasets = (payload?.datasets && typeof payload.datasets === 'object') ? payload.datasets : (payload?.result?.datasets && typeof payload.result.datasets === 'object' ? payload.result.datasets : undefined)
                            if (backendDatasets) {
                              enrichedSpec = { ...(spec || {}), datasets: { ...(spec?.datasets || {}), ...backendDatasets } }
                            } else {
                              const names = collectDatasetNames(spec)
                              if (names.size > 0) {
                                const aliasRows = buildAliasRowsMap(idx)
                                const datasets: Record<string, any[]> = {}
                                for (const n of names) {
                                  if (/^query_result(_\d+)?$/i.test(n) && aliasRows[n]) {
                                    datasets[n] = aliasRows[n]
                                  }
                                }
                                // Fallback base name if referenced but unmapped
                                if (names.has('query_result') && !datasets['query_result']) {
                                  datasets['query_result'] = aliasRows['query_result'] || []
                                }
                                if (Object.keys(datasets).length > 0) {
                                  enrichedSpec = { ...(spec || {}), datasets: { ...(spec?.datasets || {}), ...datasets } }
                                }
                              }
                            }
                          } catch {}

                          return (
                            <div className="w-full">
                              {ok === false && issues && issues.length > 0 ? (
                                <div className="mb-2 text-xs text-red-600 whitespace-pre-wrap">
                                  {issues.slice(0, 5).map((it, i) => (<div key={i}>• {it}</div>))}
                                  {issues.length > 5 ? <div>…以及 {issues.length - 5} 个问题</div> : null}
                                </div>
                              ) : null}
                              <div className="w-full h-64">
                                <VegaLiteRenderer spec={enrichedSpec} />
                              </div>
                            </div>
                          )
                        }
                      }
                      // Fallback to legacy attempt: parse content as JSON and try to extract spec
                      if (message.tool === 'plot_render' && message.content) {
                        try {
                          const json = JSON.parse(message.content)
                          const spec = json?.spec || json?.result?.spec || json?.result
                          if (spec && (spec.mark || spec.layer || spec.encoding)) {
                            // Build datasets, preferring backend-provided
                            let enrichedSpec = spec
                            try {
                              const backendDatasets = (json?.datasets && typeof json.datasets === 'object') ? json.datasets : (json?.result?.datasets && typeof json.result.datasets === 'object' ? json.result.datasets : undefined)
                              if (backendDatasets) {
                                enrichedSpec = { ...(spec || {}), datasets: { ...(spec?.datasets || {}), ...backendDatasets } }
                              } else {
                                const names = collectDatasetNames(spec)
                                if (names.size > 0) {
                                  const aliasRows = buildAliasRowsMap(idx)
                                  const datasets: Record<string, any[]> = {}
                                  for (const n of names) {
                                    if (/^query_result(_\d+)?$/i.test(n) && aliasRows[n]) {
                                      datasets[n] = aliasRows[n]
                                    }
                                  }
                                  if (names.has('query_result') && !datasets['query_result']) {
                                    datasets['query_result'] = aliasRows['query_result'] || []
                                  }
                                  if (Object.keys(datasets).length > 0) {
                                    enrichedSpec = { ...(spec || {}), datasets: { ...(spec?.datasets || {}), ...datasets } }
                                  }
                                }
                              }
                            } catch {}
                            return (
                              <div className="w-full h-64">
                                <VegaLiteRenderer spec={enrichedSpec} />
                              </div>
                            )
                          }
                        } catch {}
                      }
                      // Default: raw text
                      return (
                        <pre className={`m-0 text-xs whitespace-pre-wrap font-mono`}>{message.content}</pre>
                      )
                    })()}
                  </div>
                ) : (
                  <div>
                    {/* If assistant message has a Vega spec payload, render chart above the text */}
                    {message.role === 'assistant' && !message.isTool && message.payload ? (() => {
                      const p = message.payload
                      const spec = p.vegaSpec || p.spec || (p.result && p.result.spec)
                      if (spec && (spec.mark || spec.layer || spec.encoding)) {
                        let enrichedSpec = spec
                        try {
                          const backendDatasets = (p?.datasets && typeof p.datasets === 'object') ? p.datasets : (p?.result?.datasets && typeof p.result.datasets === 'object' ? p.result.datasets : undefined)
                          if (backendDatasets) {
                            enrichedSpec = { ...(spec || {}), datasets: { ...(spec?.datasets || {}), ...backendDatasets } }
                          } else {
                            const names = collectDatasetNames(spec)
                            if (names.size > 0) {
                              const aliasRows = buildAliasRowsMap(idx)
                              const datasets: Record<string, any[]> = {}
                              for (const n of names) {
                                if (/^query_result(_\d+)?$/i.test(n) && aliasRows[n]) {
                                  datasets[n] = aliasRows[n]
                                }
                              }
                              if (names.has('query_result') && !datasets['query_result']) {
                                datasets['query_result'] = aliasRows['query_result'] || []
                              }
                              if (Object.keys(datasets).length > 0) {
                                enrichedSpec = { ...(spec || {}), datasets: { ...(spec?.datasets || {}), ...datasets } }
                              }
                            }
                          }
                        } catch {}
                        return (
                          <div className="w-full h-64 mb-2">
                            <VegaLiteRenderer spec={enrichedSpec} />
                          </div>
                        )
                      }
                      return null
                    })() : null}

                    <pre className={`m-0 text-sm whitespace-pre-wrap ${message.isTool ? 'font-mono' : ''}`}>
                      {message.role === 'assistant' && !message.isTool
                        ? message.content.replace(/^(?:\r?\n)+/, '')
                        : message.content}
                    </pre>
                  </div>
                )}

                <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-gray-200 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1" /> 引用{selectedContext.length ? ` (${selectedContext.length})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuLabel>选择上下文</DropdownMenuLabel>
              <DropdownMenuItem onClick={selectAll} disabled={allSelected}>全选</DropdownMenuItem>
              <DropdownMenuItem onClick={clearAll} disabled={selectedContext.length === 0}>清除</DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="max-h-56 overflow-auto px-1 py-1">
                {canvasItems.map((item) => (
                  <DropdownMenuCheckboxItem
                    key={item.id}
                    checked={selectedContext.includes(item.id)}
                    onCheckedChange={(checked) => toggleItem(item.id, checked)}
                  >
                    <span className="truncate">{item.title}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={availableModels.includes(selectedModel) ? selectedModel : (availableModels[0] || "")}
            onValueChange={onModelChange}
            disabled={availableModels.length === 0}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder={provider === "none" ? "未配置模型" : "选择模型"} />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Input + inline action buttons */}
        <div className="relative">
          <Textarea
            placeholder="询问关于您数据的问题..."
            value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            className="w-full pr-36 min-h-[44px] max-h-[160px] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSendMessage()
              }
            }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <Button
              onClick={onSendMessage}
              size="sm"
              disabled={isQuerying || !newMessage.trim()}
              title="发送"
            >
              {isQuerying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={onStop}
              size="sm"
              variant="outline"
              disabled={!isQuerying}
              title="停止"
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button
              onClick={onRetry}
              size="sm"
              variant="outline"
              title="重试"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
