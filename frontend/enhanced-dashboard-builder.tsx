"use client"

import type React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, Save, RefreshCw, Loader2, PlusSquare } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useApi } from "@/hooks/use-api"
import DashboardCanvas from "@/components/dashboard-canvas"
import { AddTemplateComponentDialog } from "@/components/add-template-component-dialog"
import { api, EnhancedComponent, QueryResult } from "@/lib/api"
import { useSearchParams } from "next/navigation"
import { useAiContext } from "@/hooks/use-ai-context"

interface CanvasItem {
  id: string
  type: "widget" | "file"
  title: string
  content?: string
  fileType?: string
  fileUrl?: string
  widgetType?: string
  data?: any
  width: number
  height: number
  order: number
  minimized?: boolean
  widthRatio?: number
}

export default function EnhancedDashboardBuilder() {
  const { toast } = useToast()
  const [apiState] = useApi()
  const searchParams = useSearchParams()
  const dashboardIdFromUrl = searchParams?.get("dashboard") || ""
  const addTemplateParam = (searchParams?.get("addTemplate") || "") as any as "bar" | "line" | "candlestick" | "table" | "metric" | "text" | "watchlist" | ""

  // Prefer URL dashboard id, fallback to api state
  const effectiveDashboardId = dashboardIdFromUrl || apiState.currentDashboard?.id || ""

  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([])
  const { state: aiState, actions: aiActions } = useAiContext()
  const [loadingItems, setLoadingItems] = useState(false)
  // 保存节流：避免频繁写入
  const saveTimerRef = useRef<any>(null)
  const lastSavedSigRef = useRef<string>("")

  // Add-from-template dialog state
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [defaultTemplateType, setDefaultTemplateType] = useState<"bar" | "line" | "candlestick" | "table" | "metric" | "text" | "watchlist" | undefined>(undefined)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [componentToEdit, setComponentToEdit] = useState<EnhancedComponent | null>(null)

  // When addTemplate query param is present, open dialog and preselect type
  useEffect(() => {
    if (addTemplateParam) {
      setDefaultTemplateType(addTemplateParam as any)
      setDialogMode("create")
      setComponentToEdit(null)
      setShowAddTemplate(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTemplateParam])

  const openCreateDialog = useCallback((preset?: typeof defaultTemplateType) => {
    if (preset) setDefaultTemplateType(preset)
    setDialogMode("create")
    setComponentToEdit(null)
    setShowAddTemplate(true)
  }, [])

  // helpers: map enhanced component type to canvas widget type label
  const mapComponentTypeToWidgetType = (t: string, comp?: EnhancedComponent): string => {
    if (t === "bar" || t === "line" || t === "candlestick") return "Chart Widget"
    if (t === "table") return "Table Widget"
    if (t === "metric") return "Metric Widget"
    if (t === "text") return "Text Widget"
    if (t === "watchlist") return "Watchlist Widget"
    if (t === "custom" && (comp as any)?.config?.mark === "watchlist") return "Watchlist Widget"
    return "widget"
  }

  const isValidUUID = (id?: string) => !!id && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id.trim())

  // Transform query result to canvas data structures for simple rendering
  const toChartData = (comp: EnhancedComponent, result: QueryResult) => {
    const enc = comp.config?.encoding || {}
    const xField: string | undefined = enc.x
    const yField: string | undefined = enc.y
    const colorField: string | undefined = enc.color
    const seriesList: Array<{ y: string; label?: string; name?: string; color?: string }> = Array.isArray(enc.series)
      ? enc.series.filter((s: any) => s && typeof s.y === 'string')
      : []

    const rows = result.data || []
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316"]

    // When multi-series is configured, y can be omitted; require x + seriesList
    if (!xField || (!yField && seriesList.length === 0)) {
      return { labels: [], datasets: [], chartType: comp.component_type }
    }

    // Build labels as union of unique X values in row order
    const labels: string[] = Array.from(new Set(rows.map((r: any) => String(r[xField]))))

    // Multi-series path: each configured series references a Y column
    if (seriesList.length > 0) {
      const datasets = seriesList.map((s, i) => {
        const key = s.y
        const label = (s.label || s.name || s.y) as string
        const color = s.color || palette[i % palette.length]
        const data = labels.map((x) => {
          const bucketRows = rows.filter((r: any) => String(r[xField]) === x)
          const sum = bucketRows.reduce((acc: number, r: any) => {
            const v = Number(r[key])
            return acc + (Number.isFinite(v) ? v : 0)
          }, 0)
          return sum
        })
        return { label, data, color }
      })
      const stacked = !!(comp.config?.options?.stacked)
      return { labels, datasets, chartType: comp.component_type, stacked }
    }

    // Legacy single-series path with optional color grouping
    const seriesMap: Record<string, number[]> = {}

    const seriesKeys = colorField ? Array.from(new Set(rows.map((r: any) => String(r[colorField])))) : [yField!]
    for (const key of seriesKeys) {
      seriesMap[key] = []
    }

    for (const x of labels) {
      const bucketRows = rows.filter((r: any) => String(r[xField]) === x)
      if (colorField) {
        const bySeries = new Map<string, number>()
        for (const r of bucketRows) {
          const sKey = String(r[colorField])
          const val = Number(r[yField!])
          bySeries.set(sKey, (bySeries.get(sKey) || 0) + (Number.isFinite(val) ? val : 0))
        }
        for (const key of seriesKeys) {
          seriesMap[key].push(bySeries.get(String(key)) || 0)
        }
      } else {
        const sum = bucketRows.reduce((acc: number, r: any) => acc + (Number.isFinite(Number(r[yField!])) ? Number(r[yField!]) : 0), 0)
        seriesMap[yField!]?.push(sum)
      }
    }

    const datasets = Object.keys(seriesMap).map((k, i) => ({ label: String(k), data: seriesMap[k], color: palette[i % palette.length] }))

    const stacked = !!(comp.config?.options?.stacked)
    return { labels, datasets, chartType: comp.component_type, stacked }
  }

  const toCandlestickData = (comp: EnhancedComponent, result: QueryResult) => {
    const enc = comp.config?.encoding || {}
    const xField = enc.x, o = enc.open, h = enc.high, l = enc.low, c = enc.close
    const vField: string | undefined = enc.volume
    const rows = result.data || []
    const cols = (result.columns || []).map((c) => c.name || "")

    // Heuristically detect symbol/company fields from datasource (broadened patterns)
    const findCol = (patterns: RegExp[]): string | undefined => {
      for (const pat of patterns) {
        const hit = cols.find((n) => pat.test(String(n)))
        if (hit) return hit
      }
      return undefined
    }
    const symbolCol = findCol([
      /^(symbol|ticker|code|stock_code|证券代码|股票代码|代码|标的)$/i,
      /(ticker|symbol)$/i,
    ])
    const nameCol = findCol([
      /^(name|company|company_name|security_name|公司名|公司名称|简称|名称)$/i,
    ])

    let detectedSymbol: string | undefined
    if (symbolCol) {
      const unique = Array.from(new Set(rows.map((r: any) => String(r[symbolCol])))).filter(Boolean)
      detectedSymbol = unique.length === 1 ? String(unique[0]) : undefined
    }
    if (!detectedSymbol) {
      // fallback from component name like "AAPL K线" => AAPL
      const m = String(comp.name || "").toUpperCase().match(/\b([A-Z]{1,5})\b/)
      detectedSymbol = m ? m[1] : undefined
    }

    const labels = rows.map((r: any) => String(r[xField]))
    const datasets = [
      {
        label: "OHLC",
        data: rows.map((r: any) => ({ o: Number(r[o]), h: Number(r[h]), l: Number(r[l]), c: Number(r[c]), v: vField !== undefined ? Number(r[vField]) : undefined })),
        color: "#3b82f6",
      },
    ]
    return { labels, datasets, chartType: "candlestick", symbol: detectedSymbol, companyName: nameCol ? rows[0]?.[nameCol] : undefined }
  }

  const toTableData = (result: QueryResult) => {
    const headers = result.columns?.map((c) => c.name) || []
    const rows = (result.data || []).map((r) => headers.map((h) => String(r[h] ?? "")))
    return { headers, rows }
  }

  const toMetricData = (comp: EnhancedComponent, result: QueryResult) => {
    const enc = comp.config?.encoding || {}
    const valueField: string | undefined = enc.value
    const first = (result.data || [])[0] || {}
    const value = valueField ? first[valueField] : undefined
    const subtitle = comp.config?.options?.subtitle || ""
    return { title: comp.name, value: value ?? "-", change: 0, subtitle }
  }

  const toTextData = (comp: EnhancedComponent) => {
    const content = comp.config?.encoding?.content || comp.config?.content || ""
    const options = comp.config?.options || {}
    return { title: comp.name, content, options }
  }

  const toWatchlistData = (comp: EnhancedComponent, result: QueryResult) => {
    const enc: any = comp.config?.encoding || {}
    const dateField: string | undefined = enc.date
    const symbolField: string | undefined = enc.symbol
    const priceField: string | undefined = enc.price
    // Optional hints no longer required; we'll auto-derive metrics when possible

    const rows: any[] = (result?.data as any[]) || []
    const cols = (result?.columns || []).map((c) => c.name || "")

    if (!dateField || !symbolField || !priceField || rows.length === 0) {
      return { dateLabel: undefined, items: [] as any[] }
    }

    // Hidden in-code overrides; user asked not to expose UI. Component-level overrides still take precedence if provided.
    const defaultStaticOverrides: Record<string, { eps?: number; shares?: number; pe?: number; marketCap?: number }> = {
      NVDA: { eps: 2.50, shares: 2470000000 },
      AAPL: { eps: 6.50, shares: 15500000000 },
    }

    // Read static per-symbol overrides from component config options
    const staticOverrides: Record<string, { eps?: number; shares?: number; pe?: number; marketCap?: number }> =
      { ...(defaultStaticOverrides || {}), ...( (comp as any)?.config?.options?.staticOverrides || {} ) }
    const getOverrideFor = (symRaw: string) => {
      const keyU = String(symRaw || "").toUpperCase()
      return (
        staticOverrides[symRaw] ||
        staticOverrides[keyU] ||
        staticOverrides[String(symRaw || "").toLowerCase()] ||
        undefined
      )
    }

    const parseDate = (v: any): number => {
      if (v == null) return -Infinity
      const d = new Date(v)
      if (!isNaN(d.getTime())) return d.getTime()
      return typeof v === "string" ? (Date.parse(v) || -Infinity) : (Number(v) || -Infinity)
    }

    // Flexible numeric parser: supports $, commas, K/M/B/T, and Chinese units 万/亿/十亿
    const parseNum = (val: any): number | null => {
      if (val == null) return null
      if (typeof val === "number") return Number.isFinite(val) ? val : null
      let s = String(val).trim()
      if (!s) return null
      // remove currency symbols and whitespace
      s = s.replace(/[$¥€£\s]/g, "")
      // handle percentages left to callers
      // detect Chinese units
      let multiplier = 1
      if (/十亿/.test(s)) { multiplier = 1e9; s = s.replace(/十亿.*/, "") }
      else if (/亿/.test(s)) { multiplier = 1e8; s = s.replace(/亿.*/, "") }
      else if (/万/.test(s)) { multiplier = 1e4; s = s.replace(/万.*/, "") }
      // handle English unit suffixes
      const unitMatch = s.match(/([kKmMbBtT])\b(?![a-zA-Z])/)
      if (unitMatch) {
        const u = unitMatch[1].toLowerCase()
        if (u === 'k') multiplier = 1e3
        else if (u === 'm') multiplier = 1e6
        else if (u === 'b') multiplier = 1e9
        else if (u === 't') multiplier = 1e12
        s = s.replace(/([kKmMbBtT])\b(?![a-zA-Z])/, "")
      }
      // remove commas and other thousand separators
      s = s.replace(/,/g, "")
      // remove trailing words like shares/股
      s = s.replace(/(shares?|股|pcs)\b.*$/i, "")
      const n = Number(s)
      if (!Number.isFinite(n)) return null
      return n * multiplier
    }

    // Identify helpful columns heuristically (not required)
    const findCol = (patterns: RegExp[]): string | undefined => {
      for (const pat of patterns) {
        const hit = cols.find((n) => pat.test(String(n)))
        if (hit) return hit
      }
      return undefined
    }
    const nameCol = findCol([/^(name|company|company_name|公司名|公司名称)$/i])
    const peCol = findCol([/^(pe|pe_ratio|peratio|p\/?e|市盈率)$/i])
    const epsCol = findCol([/^(eps(\s*\(ttm\))?|ttm\s*eps|earnings.?per.?share|每股收益)$/i])
    const mcapCol = findCol([/^(market.?cap|mkt.?cap|marketcap|市值|总市值)$/i])
    const sharesCol = findCol([/^(shares.?outstanding|outstanding.?shares|shares\b|流通股|总股本|发行股本)$/i])
    const volCol = findCol([/^(volume|day.?volume|vol|成交量)$/i])

    // Latest date grouping
    let latestTs = -Infinity
    let latestVal: any = null
    for (const r of rows) {
      const ts = parseDate(r[dateField])
      if (ts > latestTs) { latestTs = ts; latestVal = r[dateField] }
    }
    const latestRows = rows.filter((r) => String(r[dateField]) === String(latestVal))

    // Build symbol -> sorted rows
    const bySymbol = new Map<string, Array<{ ts: number; r: any }>>()
    for (const r of rows) {
      const sym = String(r[symbolField] ?? "")
      if (!sym) continue
      const ts = parseDate(r[dateField])
      if (!bySymbol.has(sym)) bySymbol.set(sym, [])
      bySymbol.get(sym)!.push({ ts, r })
    }
    for (const [sym, arr] of bySymbol) arr.sort((a, b) => a.ts - b.ts)

    const getPrevBefore = (arr: Array<{ ts: number; r: any }>, ts: number) => {
      let prev: { ts: number; r: any } | undefined
      for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].ts < ts) { prev = arr[i]; break } }
      return prev
    }
    const getClosestOnOrBefore = (arr: Array<{ ts: number; r: any }>, target: number) => {
      let best: { ts: number; r: any } | undefined
      for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].ts <= target) { best = arr[i]; break } }
      return best
    }
    const getLatestNonNullOnOrBefore = (arr: Array<{ ts: number; r: any }>, ts: number, col?: string): number | null => {
      if (!col) return null
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].ts <= ts) {
          const v = parseNum(arr[i].r[col])
          if (v != null) return v
        }
      }
      return null
    }

    const oneDay = 24 * 3600 * 1000
    const weekTarget = (t: number) => t - 7 * oneDay
    const monthTarget = (t: number) => t - 30 * oneDay
    const yearTarget = (t: number) => t - 365 * oneDay

    const logoMap: Record<string, string> = {
      AAPL: "🍎", MSFT: "🪟", GOOGL: "🔍", GOOG: "🔍", AMZN: "🛒", META: "📘", TSLA: "🚗", NVDA: "🟢", NFLX: "🎬", AMD: "🔥",
      BABA: "🐉", TSM: "🏭", JPM: "🏦", BAC: "🏦", V: "💳", MA: "💳", DIS: "🏰", ORCL: "🐙", INTC: "💻", IBM: "🟦",
    }

    const items = latestRows.map((r) => {
      const sym = String(r[symbolField] ?? "")
      const symU = sym.toUpperCase()
      const ov = getOverrideFor(sym)
      const price = Number.isFinite(Number(r[priceField])) ? Number(r[priceField]) : parseNum(r[priceField])
      const series = bySymbol.get(sym) || []
      const prev = getPrevBefore(series, latestTs)
      const prevPrice = prev ? (Number.isFinite(Number(prev.r[priceField])) ? Number(prev.r[priceField]) : parseNum(prev.r[priceField])) : null

      const w = getClosestOnOrBefore(series, weekTarget(latestTs))
      const m = getClosestOnOrBefore(series, monthTarget(latestTs))
      const y = getClosestOnOrBefore(series, yearTarget(latestTs))

      const wPrice = w ? (Number.isFinite(Number(w.r[priceField])) ? Number(w.r[priceField]) : parseNum(w.r[priceField])) : null
      const mPrice = m ? (Number.isFinite(Number(m.r[priceField])) ? Number(m.r[priceField]) : parseNum(m.r[priceField])) : null
      const yPrice = y ? (Number.isFinite(Number(y.r[priceField])) ? Number(y.r[priceField]) : parseNum(y.r[priceField])) : null

      const absDay = (price != null && prevPrice != null) ? (price - prevPrice) : null
      const pctDay = (price != null && prevPrice != null && prevPrice !== 0) ? (absDay! / prevPrice) * 100 : null
      const pctWeek = (price != null && wPrice != null && wPrice !== 0) ? ((price - wPrice) / wPrice) * 100 : null
      const pctMonth = (price != null && mPrice != null && mPrice !== 0) ? ((price - mPrice) / mPrice) * 100 : null
      const pctYear = (price != null && yPrice != null && yPrice !== 0) ? ((price - yPrice) / yPrice) * 100 : null

      const name = nameCol ? (r[nameCol] as any as string) : undefined

      // Derive P/E when possible: priority = override.pe > override.eps > provided P/E > price/EPS(backfill)
      const peProvidedRaw = peCol ? parseNum(r[peCol]) : null
      const epsLatest = epsCol ? parseNum(r[epsCol]) : null
      const epsBackfill = getLatestNonNullOnOrBefore(series, latestTs, epsCol)
      const epsEffective = epsLatest != null ? epsLatest : epsBackfill
      const peFromOverride = (() => {
        if (ov && ov.pe != null && Number.isFinite(ov.pe)) return ov.pe!
        if (ov && ov.eps != null && Number.isFinite(ov.eps) && price != null && ov.eps !== 0) return price / ov.eps
        return null
      })()
      const peRatio = (peFromOverride != null && Number.isFinite(peFromOverride)) ? peFromOverride
        : ((peProvidedRaw != null && Number.isFinite(peProvidedRaw)) ? peProvidedRaw
          : (price != null && epsEffective != null && epsEffective !== 0 ? price / epsEffective : null))

      // Derive Market Cap: priority = override.marketCap > override.shares > provided mcap > price*shares(backfill)
      const mcapProvidedRaw = mcapCol ? parseNum(r[mcapCol]) : null
      const sharesLatest = sharesCol ? parseNum(r[sharesCol]) : null
      const sharesBackfill = getLatestNonNullOnOrBefore(series, latestTs, sharesCol)
      const sharesEffective = sharesLatest != null ? sharesLatest : sharesBackfill
      const mcapFromOverride = (() => {
        if (ov && ov.marketCap != null && Number.isFinite(ov.marketCap)) return ov.marketCap!
        if (ov && ov.shares != null && Number.isFinite(ov.shares) && price != null) return price * ov.shares
        return null
      })()
      const marketCap = (mcapFromOverride != null && Number.isFinite(mcapFromOverride)) ? mcapFromOverride
        : ((mcapProvidedRaw != null && Number.isFinite(mcapProvidedRaw)) ? mcapProvidedRaw
          : (price != null && sharesEffective != null ? price * sharesEffective : null))

      const dayVolume = volCol ? parseNum(r[volCol]) : null

      const logo = logoMap[symU]

      return {
        symbol: sym,
        name,
        logo,
        last: price ?? null,
        dayChange: absDay,
        dayChangePercent: pctDay,
        weekChange: pctWeek,
        monthChange: pctMonth,
        yearChange: pctYear,
        peRatio,
        marketCap,
        dayVolume,
      }
    })

    return { dateLabel: Number.isFinite(latestTs) ? new Date(latestTs).toLocaleDateString() : undefined, items }
  }

  // Load enhanced components for current dashboard and map to canvas items
  const loadCanvasItems = async (dashIdParam?: string) => {
    const id = dashIdParam || effectiveDashboardId
    if (!id) return
    setLoadingItems(true)
    try {
      const components = await api.getEnhancedComponents(id)
      // Execute queries in parallel where needed
      const results = await Promise.all(
        components.map(async (comp) => {
          if (comp.component_type === "text") return { comp, result: null as unknown as QueryResult }
          try {
            const res = await api.executeComponentQuery(comp.id)
            return { comp, result: res as unknown as QueryResult }
          } catch (e) {
            console.error("Failed to execute component query", comp.id, e)
            return { comp, result: { data: [], columns: [], row_count: 0, execution_time_ms: 0, cached: false } as QueryResult }
          }
        })
      )

      const items: CanvasItem[] = results.map(({ comp, result }) => {
        const widgetType = mapComponentTypeToWidgetType(comp.component_type as any, comp)
        let data: any
        const resolvedType = (comp.component_type as any) === "custom" && (comp as any)?.config?.mark === "watchlist" ? "watchlist" : comp.component_type
        switch (resolvedType) {
          case "bar":
          case "line":
            data = toChartData(comp, result as QueryResult)
            break
          case "candlestick":
            data = toCandlestickData(comp, result as QueryResult)
            break
          case "table":
            data = toTableData(result as QueryResult)
            break
          case "metric":
            data = toMetricData(comp, result as QueryResult)
            break
          case "text":
            data = toTextData(comp)
            break
          case "watchlist":
            data = toWatchlistData(comp, result as QueryResult)
            break
          default:
            data = {}
        }
        return {
          id: comp.id,
          type: "widget",
          title: comp.name,
          widgetType,
          data,
          width: comp.width || 350,
          height: comp.height || 280,
          order: comp.order_index ?? 0,
          minimized: false,
          // 读取后端配置中的相对宽度，供前端按比例渲染
          widthRatio: (comp as any)?.config?.widthRatio ?? undefined,
        }
      })

      // 合并本地未保存的 widthRatio，避免点击“刷新”后丢失相对宽度
      const localMap = new Map(canvasItems.map(i => [i.id, i]))
      const mergedItems = items.map(it => {
        const local = localMap.get(it.id)
        return local && (it.widthRatio == null) && (local.widthRatio != null)
          ? { ...it, widthRatio: local.widthRatio }
          : it
      })

      setCanvasItems(mergedItems)
      // Update AI context with lightweight refs for right panel
      aiActions.setCanvasItems(mergedItems.map(it => ({ id: it.id, title: it.title })))
    } catch (error) {
      console.error('Failed to load enhanced components:', error)
    } finally {
      setLoadingItems(false)
    }
  }

  // Auto-load components when dashboard changes (URL or api state)
  useEffect(() => {
    if (effectiveDashboardId) {
      loadCanvasItems(effectiveDashboardId)
    } else {
      setCanvasItems([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDashboardId])

  // For compatibility with existing buttons
  const saveCanvasItems = async () => {
    const id = effectiveDashboardId
    if (!id) return
    try {
      const updates = canvasItems.map((it, idx) => ({
        component_id: it.id,
        width: Math.round(it.width),
        height: Math.round(it.height),
        order_index: idx,
        // 同步保存相对宽度，后端会写入 config.widthRatio
        width_ratio: it.widthRatio,
      }))
      await api.saveDashboardComponentsLayout(id, updates)
      toast({ title: "已保存", description: "布局尺寸与顺序已保存" })
    } catch (e) {
      console.error('Failed to save layout', e)
      toast({ title: "保存失败", description: "请重试" })
    }
  }

  // Auto-persist order on drag end
  useEffect(() => {
    // 自动保存：当宽度比例、顺序或尺寸变化时，1s 后写回后端（如果期间还有变化则重新计时）
    if (!effectiveDashboardId) return
    const sig = JSON.stringify(
      canvasItems.map((it, idx) => ({ id: it.id, w: Math.round(it.width), h: Math.round(it.height), o: idx, r: Number.isFinite(it.widthRatio as any) ? Number(it.widthRatio) : null }))
    )
    if (sig === lastSavedSigRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const updates = canvasItems.map((it, idx) => ({
          component_id: it.id,
          width: Math.round(it.width),
          height: Math.round(it.height),
          order_index: idx,
          width_ratio: it.widthRatio,
        }))
        await api.saveDashboardComponentsLayout(effectiveDashboardId, updates)
        lastSavedSigRef.current = sig
      } catch (e) {
        // 忽略自动保存错误，避免打扰用户；仍可手动点击“保存”
        console.warn('Auto-save layout failed:', e)
      }
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [canvasItems, effectiveDashboardId])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputBottomRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    const maxSize = 25 * 1024 * 1024
    if (file.size > maxSize) { alert("文件大小超过25MB限制"); return false }
    const supportedExtensions = /\.(json|csv|pdf|png|jpg|jpeg|gif|xlsx|txt|md|docx|html)$/i
    if (!supportedExtensions.test(file.name)) { alert(`不支持的文件格式: "${file.name}"`); return false }
    try {
      const fileUrl = URL.createObjectURL(file)
      const fileType = file.type
      const newItem: CanvasItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: "file",
        title: file.name,
        content: `File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        fileType,
        fileUrl,
        width: 600,
        height: 400,
        order: canvasItems.length,
        minimized: false,
        widthRatio: 0.5,
      }
      setCanvasItems((prev) => [...prev, newItem])
      return true
    } catch (error) {
      console.error(`文件 "${file.name}" 上传失败:`, error)
      alert(`文件 "${file.name}" 上传失败`)
      return false
    }
  }, [canvasItems.length])

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    Array.from(files).forEach((file) => { processFile(file) })
    if (event.target) event.target.value = ""
  }, [processFile])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    files.forEach((file) => { processFile(file) })
  }, [processFile])

  const handleDeleteItem = useCallback(async (itemId: string) => {
    const item = canvasItems.find((i) => i.id === itemId)
    // Try to delete persisted components on backend
    if (isValidUUID(itemId)) {
      try {
        await api.deleteComponent(itemId)
        toast({ title: "已删除", description: "组件已从看板移除" })
      } catch (e) {
        console.error('Failed to delete component', itemId, e)
        toast({ title: "删除失败", description: "请重试" })
      }
    }
    if (item?.fileUrl && item.fileUrl.startsWith("blob:")) { URL.revokeObjectURL(item.fileUrl) }
    const nextItems = canvasItems.filter((i) => i.id !== itemId)
    setCanvasItems(nextItems)
    // Also remove from AI context if present
    aiActions.removeFromContext(itemId)
    aiActions.setCanvasItems(nextItems.map(it => ({ id: it.id, title: it.title })))
  }, [canvasItems, toast, aiActions])

  const handleAddToContext = useCallback((itemId: string) => {
    if (aiState.selectedContext.includes(itemId)) {
      aiActions.removeFromContext(itemId)
    } else {
      aiActions.addToContext(itemId)
      aiActions.openRightPanel()
    }
  }, [aiActions, aiState.selectedContext])

  const handleMinimizeItem = useCallback((itemId: string) => {
    setCanvasItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, minimized: !item.minimized } : item)))
  }, [])

  // 中间面板内容
  const centerPanel = (
    <div className="h-full flex flex-col" onDragOver={handleDragOver} onDrop={handleDrop}>
      {canvasItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="grid grid-cols-1 gap-6 max-w-2xl w-full">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                  <PlusSquare className="w-6 h-6 text-blue-600" />
                </div>
                <CardTitle className="text-lg">添加组件</CardTitle>
                <CardDescription>向您的看板添加组件以开始可视化数据。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => openCreateDialog()}>
                    <PlusSquare className="w-4 h-4 mr-2" /> 添加组件
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">添加文件</CardTitle>
                <CardDescription>支持的格式：JSON、CSV、PDF、PNG、JPG、JPEG、GIF、XLSX、TXT、MD、DOCX、HTML。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">拖拽 <span className="text-blue-600">文件</span> 到这里或看板区域的任何位置</p>
                  <p className="text-gray-500 mb-4">或</p>
                  <Button variant="outline" className="cursor-pointer bg-transparent" onClick={() => fileInputRef.current?.click()}>浏览文件</Button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept=".json,.csv,.pdf,.png,.jpg,.jpeg,.gif,.xlsx,.txt,.md,.docx,.html" multiple />
                  <p className="text-xs text-gray-500 mt-2">文件大小限制：25MB</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1">
            <DashboardCanvas
              items={canvasItems}
              onItemsChange={(items) => {
                setCanvasItems(items)
                aiActions.setCanvasItems(items.map(it => ({ id: it.id, title: it.title })))}
              }
              onDeleteItem={handleDeleteItem}
              onAddToContext={handleAddToContext}
              onMinimizeItem={handleMinimizeItem}
              showAIChat={aiState.showRightPanel}
              selectedContext={aiState.selectedContext}
              onEditItem={async (itemId: string) => {
                try {
                  const comp = await api.getEnhancedComponent(itemId)
                  setComponentToEdit(comp)
                  setDialogMode("edit")
                  setShowAddTemplate(true)
                } catch (e) {
                  toast({ title: "加载失败", description: "无法加载组件配置用于编辑" })
                }
              }}
            />
          </div>
          <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-4 pb-6 z-50">
            <div className="flex justify-center gap-4">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center gap-2" onClick={() => openCreateDialog()}>
                <PlusSquare className="w-4 h-4" /> 添加组件
              </Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white shadow-lg flex items-center gap-2 cursor-pointer" onClick={() => fileInputBottomRef.current?.click()}>
                <Upload className="w-4 h-4" />
                添加文件
              </Button>
              <input ref={fileInputBottomRef} type="file" className="hidden" onChange={handleFileUpload} accept=".json,.csv,.pdf,.png,.jpg,.jpeg,.gif,.xlsx,.txt,.md,.docx,.html" multiple />
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">{apiState.currentDashboard?.name || ""}</h1>
          {apiState.currentDashboard?.description && (
            <p className="text-sm text-gray-500">{apiState.currentDashboard.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadCanvasItems(effectiveDashboardId)} disabled={!effectiveDashboardId || loadingItems}>
            {loadingItems ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={saveCanvasItems} disabled={!effectiveDashboardId}>
            <Save className="w-4 h-4 mr-2" />
            保存
          </Button>
        </div>
      </div>

      {centerPanel}

      {/* Add-from-template dialog */}
      <AddTemplateComponentDialog
        open={showAddTemplate}
        onOpenChange={(o) => { setShowAddTemplate(o); if (!o) { setComponentToEdit(null); setDialogMode("create") } }}
        dashboardId={dashboardIdFromUrl || apiState.currentDashboard?.id || ""}
        onCreated={async (created) => {
          try {
            let data: any = {}
            if (created.component_type === "text") {
              data = toTextData(created)
            } else if (created.component_type === "table") {
              const res = await api.executeComponentQuery(created.id)
              data = toTableData(res as unknown as QueryResult)
            } else if (created.component_type === "metric") {
              const res = await api.executeComponentQuery(created.id)
              data = toMetricData(created, res as unknown as QueryResult)
            } else if (created.component_type === "candlestick") {
              const res = await api.executeComponentQuery(created.id)
              data = toCandlestickData(created, res as unknown as QueryResult)
            } else if (created.component_type === "bar" || created.component_type === "line") {
              const res = await api.executeComponentQuery(created.id)
              data = toChartData(created, res as unknown as QueryResult)
            } else if ((created.component_type as any) === "custom" && (created as any)?.config?.mark === "watchlist") {
              const res = await api.executeComponentQuery(created.id)
              data = toWatchlistData(created, res as unknown as QueryResult)
            }
            const widgetType = mapComponentTypeToWidgetType(created.component_type as any, created)
            const newItem: CanvasItem = {
              id: created.id,
              type: "widget",
              title: created.name,
              widgetType,
              data,
              width: created.width || 350,
              height: created.height || 280,
              order: canvasItems.length,
              minimized: false,
              widthRatio: undefined,
            }
            setCanvasItems((prev) => [...prev, newItem])
          } catch (e) {
            // fallback to full reload
            await loadCanvasItems()
          }
        }}
        defaultTemplateType={defaultTemplateType as any}
        mode={dialogMode}
        componentToEdit={componentToEdit}
        onUpdated={async (updated) => {
          try {
            // Recompute data after update
            let data: any = {}
            const resolvedType = (updated.component_type as any) === "custom" && (updated as any)?.config?.mark === "watchlist" ? "watchlist" : updated.component_type
            if (resolvedType === "text") {
              data = toTextData(updated)
            } else {
              const res = await api.executeComponentQuery(updated.id)
              if (resolvedType === "table") data = toTableData(res as unknown as QueryResult)
              else if (resolvedType === "metric") data = toMetricData(updated, res as unknown as QueryResult)
              else if (resolvedType === "candlestick") data = toCandlestickData(updated, res as unknown as QueryResult)
              else if (resolvedType === "bar" || resolvedType === "line") data = toChartData(updated, res as unknown as QueryResult)
              else if (resolvedType === "watchlist") data = toWatchlistData(updated, res as unknown as QueryResult)
            }

            const widgetType = mapComponentTypeToWidgetType(updated.component_type as any, updated)
            setCanvasItems((prev) => {
              const next = prev.map((it) => {
                if (it.id !== updated.id) return it
                return {
                  ...it,
                  title: updated.name,
                  widgetType,
                  data,
                }
              })
              aiActions.setCanvasItems(next.map(it => ({ id: it.id, title: it.title })))
              return next
            })
          } catch (e) {
            await loadCanvasItems()
          }
        }}
      />
    </div>
  )
}
