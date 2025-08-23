"use client"

import React, { createContext, useContext, useMemo, useState, useEffect } from "react"
import { api } from "@/lib/api"

export interface AiCanvasItemRef {
  id: string
  title: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  // Optional: mark messages that are tool traces for special rendering
  isTool?: boolean
  tool?: string
  // New: collapsible container support (used for tool-call blocks)
  collapsible?: boolean
  collapsed?: boolean
  // Optional: mark this message as a grouped tool block
  isToolBlock?: boolean
  // New: show running/done state for tool calls
  inProgress?: boolean
  // New: structured payload for tool results (e.g., plot_render spec)
  payload?: any
}

export interface AiRuntimeConfig {
  provider: string
  models: string[]
  defaultModel?: string | null
  streaming?: boolean
  // New: list of providers for multi-provider support
  providers?: Array<{ provider: string; models: string[]; defaultModel?: string | null; streaming?: boolean }>
}

interface AiContextState {
  // UI state
  showRightPanel: boolean
  selectedModel: string
  availableModels: string[]
  provider: string
  // New: available providers from backend config (sanitized)
  availableProviders: string[]

  // Canvas state exposed to AI panel
  canvasItems: AiCanvasItemRef[]
  selectedContext: string[]

  // Chat state (messages kept globally for persistence across pages in dashboard area)
  chatMessages: ChatMessage[]
  newMessage: string
  isQuerying: boolean
}

interface AiContextActions {
  openRightPanel: () => void
  closeRightPanel: () => void
  setSelectedModel: (m: string) => void
  // New: allow explicit provider selection
  setProvider: (p: string) => void

  setCanvasItems: (items: AiCanvasItemRef[]) => void
  addToContext: (id: string) => void
  removeFromContext: (id: string) => void
  setSelectedContext: (ids: string[]) => void

  pushMessage: (m: ChatMessage) => void
  setNewMessage: (m: string) => void
  setIsQuerying: (q: boolean) => void
  clearChat: () => void
  startAssistantMessage: () => string
  appendToMessage: (id: string, delta: string) => void
  // New: append text to the last assistant message
  appendToLastAssistantMessage: (delta: string) => void
  // New helpers for tool trace rendering
  // Deprecated: start a single-tool message (kept for compatibility)
  startToolMessage: (tool: string, argsPreview?: string) => string
  // New: grouped tool-call block (collapsible by default)
  startToolBlock: () => string
  // Toggle collapse state for a given message id
  toggleMessageCollapse: (id: string) => void
  // New: directly set collapse state
  setMessageCollapsed: (id: string, collapsed: boolean) => void
  // Mark tool box running/done
  setMessageInProgress: (id: string, running: boolean) => void
  // New: set structured payload for a message
  setMessagePayload: (id: string, payload: any) => void
  // New: directly set full content of a message (used to sanitize final answer)
  setMessageContent: (id: string, content: string) => void

  // Streaming control
  registerAbortController: (ctrl: AbortController | null) => void
  stopStreaming: () => void
}

const AiContext = createContext<{ state: AiContextState; actions: AiContextActions } | null>(null)

export function AiProvider({ children }: { children: React.ReactNode }) {
  const [showRightPanel, setShowRightPanel] = useState(false)
  const [selectedModel, setSelectedModelState] = useState("gpt-4")
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [provider, setProvider] = useState<string>("none")
  // New: providers list for UI
  const [availableProviders, setAvailableProviders] = useState<string[]>([])

  const providersRef = React.useRef<Array<{ provider: string; models: string[]; defaultModel?: string | null }>>([])
  const modelOwnerRef = React.useRef<Record<string, string>>({})

  const [canvasItems, setCanvasItems] = useState<AiCanvasItemRef[]>([])
  const [selectedContext, setSelectedContext] = useState<string[]>([])

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isQuerying, setIsQuerying] = useState(false)

  // Hold current streaming abort controller without causing re-renders
  const abortRef = React.useRef<AbortController | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getAiConfig()
        const pList = (cfg as any).providers as Array<{ provider: string; models: string[]; defaultModel?: string | null }>|undefined
        // Load persisted prefs if any
        let persistedModel: string | null = null
        let persistedProvider: string | null = null
        try {
          persistedModel = localStorage.getItem("ai.selectedModel")
          persistedProvider = localStorage.getItem("ai.provider")
        } catch {}

        if (pList && pList.length > 0) {
          providersRef.current = pList
          setAvailableProviders(pList.map(p => p.provider))
          const map: Record<string, string> = {}
          const flat: string[] = []
          for (const p of pList) {
            for (const m of (p.models || [])) {
              if (!(m in map)) map[m] = p.provider
              if (!flat.includes(m)) flat.push(m)
            }
          }
          modelOwnerRef.current = map
          setAvailableModels(flat)

          // Prefer persisted model if valid, else backend default or first
          let targetModel = (persistedModel && flat.includes(persistedModel)) ? persistedModel : undefined
          if (!targetModel) {
            const firstP = pList[0]
            targetModel = (firstP.defaultModel && flat.includes(firstP.defaultModel)) ? firstP.defaultModel : (flat[0] || "")
          }
          if (targetModel) {
            setSelectedModelState(targetModel)
            const owner = modelOwnerRef.current[targetModel]
            setProvider(owner || persistedProvider || pList[0].provider)
          } else {
            setProvider(pList[0].provider)
          }
        } else {
          providersRef.current = []
          modelOwnerRef.current = {}
          setAvailableProviders(cfg.provider ? [cfg.provider] : [])
          setProvider(cfg.provider)
          const models = (cfg.models && cfg.models.length > 0) ? cfg.models : (cfg.defaultModel ? [cfg.defaultModel] : [])
          setAvailableModels(models)
          // Prefer persisted if valid
          const target = (persistedModel && models.includes(persistedModel)) ? persistedModel : cfg.defaultModel
          if (target) setSelectedModelState(target)
        }
      } catch (e) {
        // ignore
      }
    })()
  }, [])

  // Persist preferences
  useEffect(() => {
    try {
      if (selectedModel) localStorage.setItem("ai.selectedModel", selectedModel)
      if (provider) localStorage.setItem("ai.provider", provider)
    } catch {}
  }, [selectedModel, provider])

  const value = useMemo(() => {
    const state: AiContextState = {
      showRightPanel,
      selectedModel,
      availableModels,
      provider,
      availableProviders,
      canvasItems,
      selectedContext,
      chatMessages,
      newMessage,
      isQuerying,
    }

    const actions: AiContextActions = {
      openRightPanel: () => setShowRightPanel(true),
      closeRightPanel: () => setShowRightPanel(false),
      setSelectedModel: (m: string) => {
        setSelectedModelState(m)
        const owner = modelOwnerRef.current[m]
        if (owner) setProvider(owner)
      },
      setProvider: (p: string) => {
        setProvider(p)
        // Optional: keep current model; advanced logic (filtering models by provider) can be added later
      },
      setCanvasItems: (items) => setCanvasItems(items),
      addToContext: (id: string) => setSelectedContext((prev) => (prev.includes(id) ? prev : [...prev, id])),
      removeFromContext: (id: string) => setSelectedContext((prev) => prev.filter((x) => x !== id)),
      setSelectedContext: (ids: string[]) => setSelectedContext(ids),
      pushMessage: (m: ChatMessage) => setChatMessages((prev) => [...prev, m]),
      setNewMessage: (m: string) => setNewMessage(m),
      setIsQuerying: (q: boolean) => setIsQuerying(q),
      clearChat: () => setChatMessages([]),
      startAssistantMessage: () => {
        const id = (Date.now() + Math.random()).toString()
        const msg: ChatMessage = { id, role: "assistant", content: "", timestamp: new Date() }
        setChatMessages((prev) => [...prev, msg])
        return id
      },
      appendToMessage: (id: string, delta: string) => {
        setChatMessages((prev) => prev.map(m => m.id === id ? { ...m, content: m.content + delta } : m))
      },
      appendToLastAssistantMessage: (delta: string) => {
        setChatMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === 'assistant' && !prev[i].isTool) {
              const updated = [...prev]
              updated[i] = { ...updated[i], content: updated[i].content + delta }
              return updated
            }
          }
          return prev
        })
      },
      startToolMessage: (tool: string, argsPreview?: string) => {
        const id = (Date.now() + Math.random()).toString()
        // Initialize content with arguments preview only; header is rendered separately.
        const initial = argsPreview ? argsPreview + "\n" : ""
        const msg: ChatMessage = {
          id,
          role: "assistant",
          content: initial,
          timestamp: new Date(),
          isTool: true,
          tool,
          collapsible: true,
          collapsed: true,
          inProgress: true,
        }
        setChatMessages((prev) => [...prev, msg])
        return id
      },
      startToolBlock: () => {
        const id = (Date.now() + Math.random()).toString()
        const msg: ChatMessage = {
          id,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isTool: true,
          isToolBlock: true,
          tool: "Tool Calls",
          collapsible: true,
          collapsed: true,
        }
        setChatMessages((prev) => [...prev, msg])
        return id
      },
      toggleMessageCollapse: (id: string) => {
        setChatMessages((prev) => prev.map(m => m.id === id ? { ...m, collapsed: !m.collapsed } : m))
      },
      setMessageCollapsed: (id: string, collapsed: boolean) => {
        setChatMessages((prev) => prev.map(m => m.id === id ? { ...m, collapsed } : m))
      },
      setMessageInProgress: (id: string, running: boolean) => {
        setChatMessages((prev) => prev.map(m => m.id === id ? { ...m, inProgress: running } : m))
      },
      setMessagePayload: (id: string, payload: any) => {
        setChatMessages((prev) => prev.map(m => m.id === id ? { ...m, payload } : m))
      },
      setMessageContent: (id: string, content: string) => {
        setChatMessages((prev) => prev.map(m => m.id === id ? { ...m, content } : m))
      },
      registerAbortController: (ctrl: AbortController | null) => { abortRef.current = ctrl },
      stopStreaming: () => {
        try { abortRef.current?.abort() } catch {}
        abortRef.current = null
        setIsQuerying(false)
      },
    }

    return { state, actions }
  }, [showRightPanel, selectedModel, availableModels, provider, availableProviders, canvasItems, selectedContext, chatMessages, newMessage, isQuerying])

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>
}

export function useAiContext() {
  const ctx = useContext(AiContext)
  if (!ctx) throw new Error("useAiContext must be used within AiProvider")
  return ctx
}
