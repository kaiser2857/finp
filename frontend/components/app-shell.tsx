"use client"

import React, { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import ResizableLayout from "@/components/resizable-layout"
import LeftSidebar from "@/components/left-sidebar"
import RightPanel from "@/components/right-panel"
import { useApi } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { AiProvider, useAiContext } from "@/hooks/use-ai-context"
import { api } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface AppShellProps {
  children: React.ReactNode
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

function AppShellInner({ children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDashboardRoute = pathname === "/" || pathname?.startsWith("/dashboard")

  const [apiState, apiActions] = useApi()

  // Dashboard selection
  const [selectedDashboard, setSelectedDashboard] = useState<string>("")

  // Select dashboard from query param if present
  useEffect(() => {
    const qId = searchParams?.get("dashboard")
    if (!qId) return
    if (selectedDashboard === qId) return
    // If dashboards loaded, try to find and select it
    const found = apiState.dashboards.find(d => d.id === qId)
    if (found) {
      setSelectedDashboard(found.id)
      apiActions.selectDashboard(found)
    }
    // If not found yet, leave it; the auto-select effect below will handle when dashboards arrive
  }, [searchParams, apiState.dashboards, apiActions, selectedDashboard])

  // Auto-select first dashboard when dashboards load, or sync local state when currentDashboard changes
  useEffect(() => {
    if (apiState.dashboards.length > 0) {
      if (!apiState.currentDashboard) {
        // If query param exists and matches a dashboard, prefer that; otherwise choose first
        const qId = searchParams?.get("dashboard")
        const target = apiState.dashboards.find(d => d.id === qId) || apiState.dashboards[0]
        setSelectedDashboard(target.id)
        apiActions.selectDashboard(target)
      } else if (selectedDashboard !== apiState.currentDashboard.id) {
        setSelectedDashboard(apiState.currentDashboard.id)
      }
    }
  }, [apiState.dashboards, apiState.currentDashboard, apiActions, selectedDashboard, searchParams])

  // Create dashboard dialog
  const [showCreateDashboard, setShowCreateDashboard] = useState(false)
  const [newDashboardName, setNewDashboardName] = useState("")
  const [newDashboardDescription, setNewDashboardDescription] = useState("")

  const createDashboard = useCallback(async () => {
    if (!newDashboardName.trim()) return
    const dashboard = await apiActions.createDashboard({
      name: newDashboardName,
      description: newDashboardDescription || null,
    })
    if (dashboard) {
      setSelectedDashboard(dashboard.id)
      apiActions.selectDashboard(dashboard)
      setNewDashboardName("")
      setNewDashboardDescription("")
      setShowCreateDashboard(false)
      router.push("/")
    }
  }, [newDashboardName, newDashboardDescription, apiActions, router])

  // AI Context (global)
  const { state: aiState, actions: aiActions } = useAiContext()
  const { toast } = useToast()

  const isValidUUID = (id?: string) => !!id && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id.trim())

  // If navigates away from dashboard, hide right panel
  useEffect(() => {
    if (!isDashboardRoute) {
      aiActions.closeRightPanel()
    }
  }, [isDashboardRoute, aiActions])

  const onSendMessage = useCallback(async () => {
    if (!aiState.newMessage.trim()) return
    aiActions.setIsQuerying(true)
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: aiState.newMessage,
      timestamp: new Date(),
    }
    aiActions.pushMessage(userMsg)
    aiActions.setNewMessage("")

    try {
      // Build chart context from selected components (filter to UUIDs only)
      const selectedIds = (aiState.selectedContext || []).filter(isValidUUID)
      let chartContext: any = undefined
      let component_id: string | undefined = undefined

      if (selectedIds.length > 0) {
        try {
          const contexts = await Promise.all(
            selectedIds.map(async (id) => {
              try {
                return await api.getEnhancedChartContext(id)
              } catch (e) {
                const title = aiState.canvasItems.find(c => c.id === id)?.title || id
                toast({ title: "上下文获取失败", description: `组件 ${title} 的图表上下文加载失败` })
                console.error("Failed to fetch chart context for", id, e)
                return null
              }
            })
          )
          const filtered = contexts.filter(Boolean)
          if (filtered.length === 1) {
            chartContext = filtered[0]
            component_id = selectedIds[0]
          } else if (filtered.length > 1) {
            chartContext = { components: filtered }
          }
        } catch (e) {
          console.error("Failed to aggregate chart contexts", e)
        }
      }

      // Provide a minimal fallback context to avoid backend 400 when nothing selected
      if (!chartContext) {
        chartContext = { tables: [{ name: 'sample_data', columns: ['date','value','category'] }] }
      }

      // Start streaming with AbortController for Stop
      let assistantId: string | null = null
      let assistantTextBuf = ""
      // Per-tool message mapping for separate boxes
      const toolMsgMap: Record<string, string> = {}
      const ctrl = new AbortController()
      aiActions.registerAbortController(ctrl)
      let sawStreamError = false
      let sawAnyContent = false
      let lastPlotPayload: any = null
      await api.askAgentStream({ question: userMsg.content, chartContext, component_id, provider: aiState.provider, model: aiState.selectedModel }, (evt) => {
        if (evt.type === 'tool_call_started') {
          // Create a new collapsible box per tool call
          const preview = evt.arguments ? JSON.stringify(evt.arguments).slice(0, 500) : ''
          const toolMsgId = aiActions.startToolMessage(evt.tool, preview)
          toolMsgMap[evt.tool] = toolMsgId
          aiActions.setMessageInProgress(toolMsgId, true)
          // If db_query, append normalized/injected SQL for transparency
          try {
            if (evt.tool === 'db_query') {
              if ((evt as any).normalized_sql) aiActions.appendToMessage(toolMsgId, `\n-- normalized SQL --\n${(evt as any).normalized_sql}\n`)
              if ((evt as any).injected_sql && (evt as any).injected_sql !== (evt as any).normalized_sql) {
                aiActions.appendToMessage(toolMsgId, `\n-- injected SQL --\n${(evt as any).injected_sql}\n`)
              }
            }
          } catch {}
        } else if (evt.type === 'tool_chunk') {
          const toolId = toolMsgMap[evt.tool]
          if (toolId) aiActions.appendToMessage(toolId, evt.delta)
        } else if (evt.type === 'tool_result') {
          const toolId = toolMsgMap[evt.tool]
          if (toolId) {
            aiActions.appendToMessage(toolId, `\n✓ done\n`)
            // Save structured payload for UI rendering (e.g., Vega-Lite spec)
            aiActions.setMessagePayload(toolId, evt.result)
            aiActions.setMessageInProgress(toolId, false)
            // Auto-expand when a valid plot_render spec is present
            try {
              if (evt.tool === 'plot_render') {
                const payload: any = evt.result
                lastPlotPayload = payload
                // If assistant already started, also attach spec payload so chart appears at the end
                if (assistantId) aiActions.setMessagePayload(assistantId, payload)
                const spec = (payload?.spec) || (payload?.result?.spec) || payload
                const valid = spec && (spec.mark || spec.layer || spec.encoding)
                const ok = (payload && (payload.ok === true || payload.ok === undefined))
                if (valid && ok) {
                  aiActions.setMessageCollapsed(toolId, false)
                }
              }
            } catch {}
          }
        } else if (evt.type === 'chunk') {
          sawAnyContent = true
          if (!assistantId) {
            // Ensure final answer appears after any tool boxes by creating it lazily here
            assistantId = aiActions.startAssistantMessage()
            // If we already have a plot spec, attach it so the chart renders in the final card
            if (lastPlotPayload) aiActions.setMessagePayload(assistantId, lastPlotPayload)
          }
          assistantTextBuf += evt.delta
          aiActions.appendToMessage(assistantId, evt.delta)
        } else if (evt.type === 'done') {
          if (!assistantId) {
            // No chunks came, create final answer card now
            assistantId = aiActions.startAssistantMessage()
            if (lastPlotPayload) aiActions.setMessagePayload(assistantId, lastPlotPayload)
          }
          if ((evt as any).answer) {
            // If we already received chunks, do not append the full answer again to avoid duplication.
            if (!sawAnyContent) {
              assistantTextBuf += (evt as any).answer
            }
            // Sanitize: strip trailing fenced code blocks containing JSON/specs
            try {
              const cleaned = assistantTextBuf
                .replace(/```json[\s\S]*?```\s*$/i, '')
                .replace(/```\s*[\s\S]*?```\s*$/i, '')
              aiActions.setMessageContent(assistantId, cleaned)
            } catch {
              if (!sawAnyContent) aiActions.appendToMessage(assistantId, (evt as any).answer)
            }
          }
        } else if (evt.type === 'error') {
          sawStreamError = true
          // Try graceful fallback once when streaming fails (network, CORS, server 400, etc.)
          if (!assistantId) assistantId = aiActions.startAssistantMessage()
          aiActions.appendToMessage(assistantId, `\n[Stream error] ${evt.error}`)
        }
      }, ctrl.signal)

      // Fallback: if stream errored and produced no content, call non-streaming endpoint
      if (sawStreamError && !sawAnyContent) {
        const resp = await apiActions.askAgent({ question: userMsg.content, chartContext, component_id, provider: aiState.provider, model: aiState.selectedModel })
        const text = resp?.answer || resp?.text || resp?.error || ""
        if (!assistantId) assistantId = aiActions.startAssistantMessage()
        if (text) aiActions.appendToMessage(assistantId, `\n${text}`)
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // Stopped by user
      } else {
        console.error("Streaming failed, falling back to non-streaming askAgent", e)
        try {
          // Reuse the built context and identifiers
          const selectedIds = (aiState.selectedContext || []).filter(isValidUUID)
          let chartContext: any = undefined
          let component_id: string | undefined = undefined
          if (selectedIds.length > 0) {
            try {
              const contexts = await Promise.all(selectedIds.map((id) => api.getEnhancedChartContext(id)))
              const filtered = contexts.filter(Boolean)
              if (filtered.length === 1) { chartContext = filtered[0]; component_id = selectedIds[0] }
              else if (filtered.length > 1) { chartContext = { components: filtered } }
            } catch {}
          }
          if (!chartContext) { chartContext = { tables: [{ name: 'sample_data', columns: ['date','value','category'] }] } }

          const response = await apiActions.askAgent({ question: userMsg.content, chartContext, component_id, provider: aiState.provider, model: aiState.selectedModel })
          const text = response?.answer || response?.text || ""
          const assistantId = aiActions.startAssistantMessage()
          aiActions.appendToMessage(assistantId, text)
        } catch (err) {
          const assistantId = aiActions.startAssistantMessage()
          aiActions.appendToMessage(assistantId, "[Agent error]")
          toast({ title: "AI 错误", description: "无法获取AI响应" })
        }
      }
    } finally {
      aiActions.setIsQuerying(false)
      aiActions.registerAbortController(null)
    }
  }, [aiState.newMessage, aiState.selectedContext, aiState.provider, aiState.selectedModel, apiActions, aiActions, toast])

  const onStop = useCallback(() => {
    aiActions.stopStreaming()
    aiActions.appendToLastAssistantMessage("\n[stopped]\n")
  }, [aiActions])

  const onRetry = useCallback(() => {
    if (aiState.chatMessages.length === 0) return
    const lastUser = [...aiState.chatMessages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    aiActions.setNewMessage(lastUser.content)
    onSendMessage()
  }, [aiActions, aiState.chatMessages, onSendMessage])

  const leftPanel = (
    <LeftSidebar
      selectedDashboard={selectedDashboard}
      onDashboardSelect={(id) => {
        setSelectedDashboard(id)
        const dash = apiState.dashboards.find((d) => d.id === id)
        if (dash) apiActions.selectDashboard(dash)
        if (!isDashboardRoute) router.push("/")
      }}
      onCreateDashboard={() => setShowCreateDashboard(true)}
      dashboards={apiState.dashboards}
      loading={apiState.loading.dashboards}
      onDeleteDashboard={async (id) => {
        const ok = await apiActions.deleteDashboard(id)
        if (ok) {
          if (selectedDashboard === id) {
            const remaining = apiState.dashboards.filter(d => d.id !== id)
            const next = remaining[0]
            if (next) {
              setSelectedDashboard(next.id)
              apiActions.selectDashboard(next)
              router.push("/")
            } else {
              setSelectedDashboard("")
              router.push("/")
            }
          }
        }
        return ok
      }}
      onUpdateDashboard={apiActions.updateDashboard}
    />
  )

  const rightPanel = isDashboardRoute ? (
    <RightPanel
      canvasItems={aiState.canvasItems}
      chatMessages={aiState.chatMessages}
      selectedModel={aiState.selectedModel}
      availableModels={aiState.availableModels}
      provider={aiState.provider}
      availableProviders={aiState.availableProviders}
      selectedContext={aiState.selectedContext}
      newMessage={aiState.newMessage}
      isQuerying={aiState.isQuerying}
      onModelChange={aiActions.setSelectedModel}
      onProviderChange={aiActions.setProvider}
      onContextChange={aiActions.setSelectedContext}
      onMessageChange={aiActions.setNewMessage}
      onSendMessage={onSendMessage}
      onClose={aiActions.closeRightPanel}
      onStop={onStop}
      onRetry={onRetry}
      onToggleCollapse={aiActions.toggleMessageCollapse}
    />
  ) : null

  return (
    <>
      <Dialog open={showCreateDashboard} onOpenChange={setShowCreateDashboard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新看板</DialogTitle>
            <DialogDescription>创建一个新的看板来组织您的数据分析</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="dashboard-name" className="text-sm font-medium">看板名称</label>
              <Input id="dashboard-name" value={newDashboardName} onChange={(e) => setNewDashboardName(e.target.value)} placeholder="输入看板名称" />
            </div>
            <div>
              <label htmlFor="dashboard-description" className="text-sm font-medium">描述（可选）</label>
              <Textarea id="dashboard-description" value={newDashboardDescription} onChange={(e) => setNewDashboardDescription(e.target.value)} placeholder="输入看板描述" rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDashboard(false)}>取消</Button>
              <Button onClick={createDashboard} disabled={apiState.loading.dashboards}>
                {apiState.loading.dashboards && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                创建
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ResizableLayout
        leftPanel={leftPanel}
        centerPanel={children}
        rightPanel={rightPanel}
        showRightPanel={isDashboardRoute && aiState.showRightPanel}
        onRightPanelAction={isDashboardRoute ? aiActions.openRightPanel : undefined}
        leftMinWidth={50}
        leftMaxWidth={250}
        rightMinWidth={50}
        rightMaxWidth={9999}
        leftDefaultWidth={256}
        rightDefaultWidth={384}
      />
    </>
  )
}

export default function AppShell(props: AppShellProps) {
  return (
    <AiProvider>
      <AppShellInner {...props} />
    </AiProvider>
  )
}
