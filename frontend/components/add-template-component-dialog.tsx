"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api, EnhancedComponent, EnhancedDatasource, QueryResult } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import MetricCard from "@/components/widget/metric-card"
import DataTable from "@/components/widget/data-table"
import ChartCard from "@/components/widget/chart-card"
import CandlestickChart from "@/components/widget/candlestick-chart"
import TextMarkdown from "@/components/widget/text-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Switch } from "@/components/ui/switch"

export type TemplateType = "bar" | "line" | "candlestick" | "table" | "metric" | "text" | "watchlist"

interface AddTemplateComponentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
  onCreated: (component: EnhancedComponent) => void
  defaultTemplateType?: TemplateType
  mode?: "create" | "edit"
  componentToEdit?: EnhancedComponent | null
  onUpdated?: (component: EnhancedComponent) => void
}

const TEMPLATE_OPTIONS: { id: TemplateType; name: string }[] = [
  { id: "bar", name: "柱状图" },
  { id: "line", name: "折线图" },
  { id: "candlestick", name: "K线图" },
  { id: "table", name: "表格" },
  { id: "metric", name: "指标卡" },
  { id: "text", name: "文本" },
  { id: "watchlist", name: "自选股" },
]

export function AddTemplateComponentDialog({ open, onOpenChange, dashboardId, onCreated, defaultTemplateType, mode = "create", componentToEdit, onUpdated }: AddTemplateComponentDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [templates] = useState(TEMPLATE_OPTIONS)
  const [datasources, setDatasources] = useState<EnhancedDatasource[]>([])

  const [templateType, setTemplateType] = useState<TemplateType>("bar")
  const [name, setName] = useState("")
  const [datasourceId, setDatasourceId] = useState<string>("")
  const [encoding, setEncoding] = useState<Record<string, any>>({})
  const [textContent, setTextContent] = useState<string>("")
  const [dashboardName, setDashboardName] = useState<string>("")

  // New: multi-series and stacked
  type SeriesItem = { id: string; y: string; label?: string; color?: string }
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([])
  const [stacked, setStacked] = useState<boolean>(false)

  // Default color palette for series
  const defaultSeriesColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"]

  // Ensure at least one series row exists for bar/line when dialog is open
  useEffect(() => {
    if (!open) return
    if (templateType === "bar" || templateType === "line") {
      if (seriesList.length === 0) {
        setSeriesList([{ id: `${Date.now()}`, y: "" }])
      }
    }
  }, [open, templateType])

  // Live preview state
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewResult, setPreviewResult] = useState<QueryResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const hasDashboard = !!dashboardId

  const selectedDatasource = useMemo(() => datasources.find(d => d.id === datasourceId), [datasources, datasourceId])

  const deriveTemplateType = (comp: EnhancedComponent | null | undefined): TemplateType => {
    if (!comp) return "bar"
    if ((comp.component_type as any) === "custom" && (comp as any)?.config?.mark === "watchlist") return "watchlist"
    return (comp.component_type as any) as TemplateType
  }

  useEffect(() => {
    if (!open) return
    if (!hasDashboard) { setDashboardName(""); return }
    // avoid calling API with non-UUID-ish id to reduce errors/noise
    const looksLikeUUID = typeof dashboardId === "string" && /[0-9a-fA-F\-]{36,}/.test(dashboardId)
    if (!looksLikeUUID) { setDashboardName(""); return }
    api.getDashboard(dashboardId)
      .then(d => setDashboardName(d?.name || ""))
      .catch(() => setDashboardName(""))
  }, [open, hasDashboard, dashboardId])

  useEffect(() => {
    if (!open) return
    if (!hasDashboard) return
    api.getEnhancedDatasources()
      .then(ds => setDatasources(ds))
      .catch(() => {
        toast({ title: "错误", description: "加载数据源失败", variant: "destructive" })
      })
  }, [open, hasDashboard, dashboardId, toast])

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && componentToEdit) {
      const t = deriveTemplateType(componentToEdit)
      setTemplateType(t)
      setName(componentToEdit.name || "")
      setDatasourceId(componentToEdit.datasource_id || "")
      const enc = (componentToEdit as any)?.config?.encoding || {}
      setEncoding(enc)
      // hydrate series + stacked for charts
      if (t === "bar" || t === "line") {
        let s: SeriesItem[] = []
        if (Array.isArray(enc?.series) && enc.series.length > 0) {
          s = enc.series.map((it: any, idx: number) => ({ id: it.id || `${idx}` , y: String(it.y || ""), label: it.label, color: it.color }))
        } else if (enc?.y) {
          // migrate legacy single y to one series row
          s = [{ id: "legacy-0", y: String(enc.y), label: String(enc.y) }]
        }
        if (s.length === 0) s = [{ id: `${Date.now()}`, y: "" }]
        setSeriesList(s)
        setStacked(Boolean((componentToEdit as any)?.config?.options?.stacked))
      } else {
        setSeriesList([])
        setStacked(false)
      }
      if (t === "text") {
        setTextContent(enc?.content || (componentToEdit as any)?.config?.content || "")
      } else {
        setTextContent("")
      }
    } else if (mode === "create") {
      setEncoding({})
      setTextContent("")
      setName("")
      setDatasourceId("")
      setSeriesList([])
      setStacked(false)
      setTemplateType(defaultTemplateType || "bar")
    }
  }, [open, mode, componentToEdit, defaultTemplateType])

  useEffect(() => {
    if (!open || mode !== "create") return
    // Reset form when switching template type in create mode
    setDatasourceId("")
    setEncoding({})
    setSeriesList([])
    setStacked(false)
    setTextContent("")
    setPreviewResult(null)
    setPreviewError(null)
    // Default name by type
    const map: Record<TemplateType, string> = { bar: "柱状图", line: "折线图", candlestick: "K线图", table: "表格", metric: "指标卡", text: "文本", watchlist: "自选股" }
    setName(map[templateType])
  }, [templateType, mode, open])

  useEffect(() => {
    if (open && defaultTemplateType && mode === "create") {
      setTemplateType(defaultTemplateType)
    }
  }, [open, defaultTemplateType, mode])

  const columnOptions = useMemo(() => {
    const saved = selectedDatasource?.columns || []
    if (saved.length > 0) return saved
    const pvCols = previewResult?.columns || []
    return pvCols.map((c, idx) => ({
      id: c.name || `col_${idx}`,
      name: c.name,
      type: (c as any).type || "string",
      role: "dimension",
      description: undefined,
      is_filterable: true,
      is_groupable: true,
      format_string: undefined,
      default_aggregation: undefined,
      created_at: "",
    })) as any
  }, [selectedDatasource, previewResult])

  const requiredFields: Record<TemplateType, string[]> = {
    bar: ["x"],
    line: ["x"],
    candlestick: ["x", "open", "high", "low", "close"],
    table: [],
    metric: ["value"],
    text: ["content"],
    watchlist: ["date", "symbol", "price"],
  }

  const defaultNameMap: Record<TemplateType, string> = { bar: "柱状图", line: "折线图", candlestick: "K线图", table: "表格", metric: "指标卡", text: "文本", watchlist: "自选股" }

  const isValid = () => {
    if (!hasDashboard) return false
    if (!name.trim()) return false
    if (templateType !== "text" && !datasourceId) return false
    if (templateType === "bar" || templateType === "line") {
      const hasX = !!encoding.x
      const filled = seriesList.filter(s => !!s.y)
      return hasX && filled.length >= 1
    }
    const req = requiredFields[templateType]
    if (req.length === 0) return true
    return req.every(k => (templateType === "text" ? textContent : encoding[k])?.toString().length > 0)
  }

  const guidanceMessage = useMemo(() => {
    // Build a short guidance under the header
    if (templateType === "text") {
      return textContent.trim() ? null : "请输入文本内容。"
    }
    if (!datasourceId) return "请选择数据源。"
    if (templateType === "bar" || templateType === "line") {
      const missingX = !encoding.x
      const missingSeries = seriesList.length === 0 || seriesList.every(s => !s.y)
      if (missingX || missingSeries) {
        const parts: string[] = []
        if (missingX) parts.push("X")
        if (missingSeries) parts.push("系列")
        return `请选择字段：${parts.join("、")}`
      }
      return "支持添加多系列，柱状图可切换“累计堆叠”。"
    }
    const req = requiredFields[templateType] || []
    const missing = req.filter(k => !encoding[k])
    if (missing.length > 0) return `请选择字段：${missing.map(k => k.toUpperCase()).join("、")}`
    if (templateType === "candlestick") return "可选：选择成交量字段以显示量柱。"
    if (templateType === "watchlist") return "date/symbol/price 为必填，其余指标会自动推导。"
    return null
  }, [templateType, datasourceId, encoding, textContent, seriesList])

  const handleSave = async () => {
    if (!isValid()) return
    setLoading(true)
    try {
      // Build encoding for save; drop legacy y/color for bar/line
      const buildEncodingForSave = (): any => {
        if (templateType === "bar" || templateType === "line") {
          return {
            x: encoding.x,
            series: seriesList.map(s => ({ id: s.id, y: s.y, label: s.label, color: s.color })),
          }
        }
        // others keep existing encoding (volume may be absent, handled elsewhere)
        return { ...encoding }
      }

      const baseConfig: any = templateType === "text" ? {
        encoding: { content: textContent },
        mark: "text",
        options: { markdown: true }
      } : {
        encoding: buildEncodingForSave(),
        mark: templateType,
        options: {
          ...(templateType === "bar" ? { stacked: Boolean(stacked) } : {}),
          ...(templateType === "line" ? { stacked: Boolean(stacked) } : {}),
        }
      }

      const componentTypeForBackend = (templateType === "watchlist") ? ("custom" as const) : templateType

      if (mode === "edit" && componentToEdit) {
        const updated = await api.updateEnhancedComponent(componentToEdit.id, {
          name: name || componentToEdit.name,
          component_type: componentTypeForBackend as any,
          datasource_id: templateType === "text" ? undefined : datasourceId,
          config: baseConfig,
        } as Partial<EnhancedComponent>)
        toast({ title: "组件已更新", description: `${updated.name}` })
        onUpdated && onUpdated(updated)
        onOpenChange(false)
      } else {
        const nameMap: Record<TemplateType, string> = { bar: "柱状图", line: "折线图", candlestick: "K线图", table: "表格", metric: "指标卡", text: "文本", watchlist: "自选股" }
        const payload = {
          dashboard_id: dashboardId,
          datasource_id: templateType === "text" ? undefined : datasourceId,
          name: name || nameMap[templateType],
          component_type: componentTypeForBackend as any,
          config: baseConfig,
          query_config: {},
          x_position: 0,
          y_position: 0,
          width: 6,
          height: 4,
          order_index: 0,
        }

        const created = await api.createEnhancedComponent(payload as any)
        toast({ title: "组件已创建", description: `${created.name}` })
        onCreated(created)
        onOpenChange(false)
        setTemplateType("bar")
        setDatasourceId("")
        setEncoding({})
        setSeriesList([{ id: `${Date.now()}`, y: "" }])
        setStacked(false)
        setTextContent("")
        setPreviewResult(null)
        setPreviewError(null)
      }
    } catch (e: any) {
      toast({ title: "错误", description: e?.message || (mode === "edit" ? "更新组件失败" : "创建组件失败"), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const NONE_VALUE = "__none__"

  useEffect(() => {
    if (!open) return
    if (!datasourceId || templateType === "text") {
      setPreviewResult(null)
      setPreviewError(null)
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    api.previewDatasourceData(datasourceId, 200)
      .then(res => {
        const { data, columns, row_count, execution_time_ms, cached } = res
        setPreviewResult({ data, columns, row_count, execution_time_ms, cached })
      })
      .catch((err: any) => {
        setPreviewError(err?.message || "加载预览失败")
        setPreviewResult(null)
      })
      .finally(() => setPreviewLoading(false))
  }, [open, datasourceId, templateType])

  const buildBarOrLineData = (type: "bar" | "line", result: QueryResult | null) => {
    if (!result) return { labels: [], datasets: [], chartType: type }
    const rows = result.data || []
    const x = encoding.x
    if (!x) return { labels: [], datasets: [], chartType: type }

    // Helper: unique preserve order
    const unique = (arr: any[]) => Array.from(new Set(arr))

    // Multi-series only path
    const labels = unique(rows.map((r: any) => String(r[x])))
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"]
    const datasets = (seriesList.length > 0 ? seriesList : [{ id: "tmp", y: "" }]).map((s, i) => {
      const seriesData: number[] = []
      for (const lab of labels) {
        const bucket = rows.filter((r: any) => String(r[x]) === lab)
        const sum = s.y ? bucket.reduce((acc: number, r: any) => acc + (isFinite(Number(r[s.y])) ? Number(r[s.y]) : 0), 0) : 0
        seriesData.push(sum)
      }
      return { label: s.label || s.y || `系列${i + 1}` , data: seriesData, color: s.color || palette[i % palette.length] }
    })
    return { labels, datasets, chartType: type }
  }

  const renderEmpty = () => (
    <div className="p-3 border rounded-md bg-white text-center text-xs text-gray-500">暂无数据</div>
  )

  const renderBarOrLine = (type: "bar" | "line", result: QueryResult | null) => {
    const data = buildBarOrLineData(type, result)
    return (
      <div className="p-3 border rounded-md bg-white">
        <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
        <div className="h-[340px] lg:h-[420px]">
          <ChartCard type={type} data={{ labels: data.labels, datasets: data.datasets }} stacked={stacked} />
        </div>
      </div>
    )
  }

  const renderCandlestick = (result: QueryResult | null) => {
    const x = encoding.x
    const openF = (encoding as any).open
    const highF = (encoding as any).high
    const lowF = (encoding as any).low
    const closeF = (encoding as any).close
    const volumeF = (encoding as any).volume

    // If not ready, show empty state (header guidance will instruct)
    if (!x || !openF || !highF || !lowF || !closeF || !result) {
      return (
        <div className="p-3 border rounded-md bg-white">
          <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
          <div className="text-xs text-gray-500">暂无数据</div>
        </div>
      )
    }

    const rows = result.data || []
    const candles = rows.slice(0, 200).map((r: any) => {
      const dRaw = r[x]
      const d = new Date(dRaw)
      return {
        date: isNaN(d.getTime()) ? new Date() : d,
        open: Number(r[openF]),
        high: Number(r[highF]),
        low: Number(r[lowF]),
        close: Number(r[closeF]),
        volume: Number(volumeF ? r[volumeF] : 0) || 0,
      }
    }).filter((c: any) => [c.open, c.high, c.low, c.close].every((v: any) => Number.isFinite(v)))

    return (
      <div className="p-3 border rounded-md bg-white">
        <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
        <div className="h-[340px] lg:h-[420px]">
          <CandlestickChart symbol={name || "ASSET"} companyName={name || ""} data={candles} />
        </div>
      </div>
    )
  }

  const renderWatchlist = (result: QueryResult | null) => {
    const dateField = encoding.date
    const symbolField = encoding.symbol
    const priceField = encoding.price

    if (!result || !dateField || !symbolField || !priceField) {
      return (
        <div className="p-3 border rounded-md bg-white">
          <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
          <div className="text-xs text-gray-500">暂无数据</div>
        </div>
      )
    }

    const rows = result.data || []
    // group by date value and find latest
    const parseDate = (v: any): number => {
      if (v == null) return -Infinity
      const d = new Date(v)
      if (!isNaN(d.getTime())) return d.getTime()
      // fallback lexical
      return typeof v === "string" ? Date.parse(v) || -Infinity : Number(v) || -Infinity
    }
    let latestTs = -Infinity
    let latestKey: any = null
    for (const r of rows) {
      const ts = parseDate((r as any)[dateField])
      if (ts > latestTs) { latestTs = ts; latestKey = (r as any)[dateField] }
    }
    const latestRows = rows.filter((r: any) => String(r[dateField]) === String(latestKey))

    // For preview: compute day change and percent from previous record per symbol if available
    const bySymbol: Record<string, any[]> = {}
    for (const r of rows) {
      const sym = String((r as any)[symbolField] ?? "")
      if (!sym) continue
      ;(bySymbol[sym] ||= []).push(r)
    }
    for (const sym in bySymbol) {
      bySymbol[sym].sort((a, b) => parseDate(a[dateField]) - parseDate(b[dateField]))
    }

    // build items
    const items = latestRows.map((r: any) => {
      const sym = String(r[symbolField] ?? "")
      const price = Number(r[priceField])
      const arr = bySymbol[sym] || []
      let prev: any | undefined
      for (let i = arr.length - 1; i >= 0; i--) {
        if (parseDate(arr[i][dateField]) < latestTs) { prev = arr[i]; break }
      }
      const prevPrice = prev ? Number(prev[priceField]) : NaN
      const chg = Number.isFinite(price) && Number.isFinite(prevPrice) ? price - prevPrice : undefined
      const pct = Number.isFinite(price) && Number.isFinite(prevPrice) && prevPrice !== 0 ? (chg! / prevPrice) * 100 : undefined
      return { sym, price, chg, pct }
    })

    // limit for preview
    const top = items.slice(0, 15)

    return (
      <div className="p-3 border rounded-md bg-white">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-medium">{name || defaultNameMap[templateType]}</div>
          <div className="text-[11px] text-gray-500">{new Date(latestTs).toLocaleDateString()}</div>
        </div>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-gray-500">
                <th className="text-left font-medium py-1">代码</th>
                <th className="text-right font-medium py-1">价格</th>
                <th className="text-right font-medium py-1">涨跌</th>
                <th className="text-right font-medium py-1">涨跌幅</th>
              </tr>
            </thead>
            <tbody>
              {top.map((it, i) => {
                const up = (it.chg ?? 0) >= 0
                return (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-2">{it.sym}</td>
                    <td className="py-1 text-right tabular-nums">{Number.isFinite(it.price) ? it.price.toFixed(2) : "-"}</td>
                    <td className={`${up ? "text-green-600" : "text-red-600"} py-1 text-right tabular-nums`}>{it.chg != null && Number.isFinite(it.chg) ? `${it.chg >= 0 ? "+" : ""}${it.chg.toFixed(2)}` : "-"}</td>
                    <td className={`${up ? "text-green-600" : "text-red-600"} py-1 text-right tabular-nums`}>{it.pct != null && Number.isFinite(it.pct) ? `${it.pct >= 0 ? "+" : ""}${it.pct.toFixed(2)}%` : "-"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-gray-500 mt-1">按照日期倒序选择最近一天的数据行进行展示。</div>
      </div>
    )
  }

  const renderTable = (result: QueryResult | null) => {
    if (!result) return (
      <div className="p-3 border rounded-md bg-white">
        <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
        <div className="text-xs text-gray-500">暂无数据</div>
      </div>
    )
    const headers = result.columns?.map(c => c.name) || []
    const rows = (result.data || []).slice(0, 6).map((r: any) => headers.map(h => String(r[h] ?? "")))
    return (
      <div className="p-3 border rounded-md bg-white">
        <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
        <div className="overflow-auto max-h-[360px] lg:max-h-[440px]">
          <DataTable headers={headers} rows={rows} />
        </div>
      </div>
    )
  }

  const renderMetric = (result: QueryResult | null) => {
    const valueField = encoding.value
    const hasValue = !!(result && valueField && result.data && result.data.length && result.data[0] && result.data[0][valueField] != null)
    if (!hasValue) {
      return (
        <div className="p-4 border rounded-md bg-white">
          <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
          <div className="text-xs text-gray-500">暂无数据</div>
        </div>
      )
    }
    const value = result!.data![0]![valueField!]
    return (
      <div className="p-4 border rounded-md bg-white">
        <MetricCard title={name || "指标"} value={String(value)} change={0} subtitle="" />
      </div>
    )
  }

  const renderText = () => (
    <div className="p-3 border rounded-md bg-white">
      <div className="text-sm font-medium mb-2">{name || defaultNameMap[templateType]}</div>
      <div className="prose max-w-none prose-sm sm:prose-base">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent || "_暂无数据_"}</ReactMarkdown>
      </div>
    </div>
  )

  const renderPreview = () => {
    if (previewLoading) return <div className="text-xs text-gray-500">正在加载预览…</div>
    if (previewError) return <div className="text-xs text-red-600">{previewError}</div>
    if (templateType === "text") return renderText()
    if (templateType === "table") return renderTable(previewResult)
    if (templateType === "metric") return renderMetric(previewResult)
    if (templateType === "candlestick") return renderCandlestick(previewResult)
    if (templateType === "watchlist") return renderWatchlist(previewResult)
    return renderBarOrLine(templateType as any, previewResult)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-1/4 top-1/2 -translate-y-1/2 translate-x-0 max-w-none w-[calc(100vw-256px)] h-[90vh] min-w-[960px] min-h-[560px] sm:w-[calc(100vw-256px)] xl:w-[calc(100vw-256px)] p-6 overflow-hidden resize flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "编辑组件" : "从模板添加组件"}</DialogTitle>
        </DialogHeader>
        {/* Dashboard info and guidance */}
        <div className="text-xs text-gray-600">当前看板：{dashboardName || "(未选择)"}</div>
        {guidanceMessage && (
          <div className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{guidanceMessage}</div>
        )}

        {/* Main content: three columns with wide preview */}
        <div className="mt-3 grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1 min-h-0 overflow-auto">
          {/* Left: Component info - remove scrollbar */}
          <div className="space-y-3 xl:col-span-5 pr-1 min-w-0">
            <Label>组件类型</Label>
            <Select value={templateType} onValueChange={(v) => setTemplateType(v as TemplateType)}>
              <SelectTrigger className="w-full truncate"><SelectValue placeholder="选择类型" /></SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!hasDashboard && (
              <p className="text-xs text-red-600">请先选择一个看板再创建组件。</p>
            )}

            <Label className="mt-3">名称</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="组件名称" />

            {templateType !== "text" && (
              <>
                <Label className="mt-3">数据源</Label>
                <Select value={datasourceId || undefined} onValueChange={setDatasourceId}>
                  <SelectTrigger className="w-full truncate" title={datasources.find(d=>d.id===datasourceId)?.name || ""}><SelectValue placeholder="选择数据源" /></SelectTrigger>
                  <SelectContent>
                    {datasources.map(ds => (
                      <SelectItem key={ds.id} value={ds.id}>{ds.name} ({ds.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDatasource && (selectedDatasource.columns?.length === 0) && (previewResult?.columns?.length || 0) > 0 && (
                  <p className="text-[10px] text-amber-600">从预览推断的列</p>
                )}
              </>
            )}
          </div>

          {/* Middle: required fields */}
          <div className="space-y-3 xl:col-span-6 min-h-0 pr-1 min-w-0">
            {templateType === "text" ? (
              <>
                <Label>内容（支持 Markdown）</Label>
                <div className="min-h-[280px]">
                  <TextMarkdown componentId="" value={textContent} onChange={setTextContent} hideToolbar fixedMode="edit" />
                </div>
              </>
            ) : (
              <>
                {(templateType === "bar" || templateType === "line") && (
                  <div className="space-y-1">
                    <Label>X 字段</Label>
                    <Select value={encoding["x"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["x"]: v }))}>
                      <SelectTrigger className="w-full truncate" title={encoding["x"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                      <SelectContent>
                        {columnOptions.map((col: any) => (
                          <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Candlestick: X + OHLC + optional Volume */}
                {templateType === "candlestick" && (
                  <div className="space-y-2 mt-1">
                    <div className="space-y-1">
                      <Label>X 字段（日期/时间）</Label>
                      <Select value={encoding["x"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["x"]: v }))}>
                        <SelectTrigger className="w-full truncate" title={encoding["x"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                        <SelectContent>
                          {columnOptions.map((col: any) => (
                            <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px]">开盘价 (open)</Label>
                        <Select value={encoding["open"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["open"]: v }))}>
                          <SelectTrigger className="w-full truncate" title={encoding["open"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                          <SelectContent>
                            {columnOptions.map((col: any) => (
                              <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px]">最高价 (high)</Label>
                        <Select value={encoding["high"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["high"]: v }))}>
                          <SelectTrigger className="w-full truncate" title={encoding["high"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                          <SelectContent>
                            {columnOptions.map((col: any) => (
                              <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px]">最低价 (low)</Label>
                        <Select value={encoding["low"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["low"]: v }))}>
                          <SelectTrigger className="w-full truncate" title={encoding["low"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                          <SelectContent>
                            {columnOptions.map((col: any) => (
                              <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px]">收盘价 (close)</Label>
                        <Select value={encoding["close"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["close"]: v }))}>
                          <SelectTrigger className="w-full truncate" title={encoding["close"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                          <SelectContent>
                            {columnOptions.map((col: any) => (
                              <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>成交量（可选）</Label>
                      <Select
                        value={encoding["volume"] ?? NONE_VALUE}
                        onValueChange={(v) => {
                          if (v === NONE_VALUE) {
                            const { volume, ...rest } = encoding
                            setEncoding(rest)
                          } else {
                            setEncoding(prev => ({ ...prev, ["volume"]: v }))
                          }
                        }}
                      >
                        <SelectTrigger className="w-full truncate" title={encoding["volume"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>无</SelectItem>
                          {columnOptions.map((col: any) => (
                            <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Multi-series editor for bar/line */}
                {(templateType === "bar" || templateType === "line") && (
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <Label>数据字段</Label>
                      <Button variant="outline" size="sm" onClick={() => setSeriesList(prev => [...prev, { id: `${Date.now()}`, y: "" }])}>添加系列</Button>
                    </div>
                    {seriesList.length === 0 && (
                      <p className="text-[11px] text-gray-500">请至少添加一条系列。</p>
                    )}
                    <div className="space-y-2">
                      {seriesList.map((s, idx) => (
                        <div key={s.id} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <Label className="text-[11px]">Y 字段</Label>
                            <Select value={s.y || undefined} onValueChange={(v) => setSeriesList(prev => prev.map((it, i) => i === idx ? { ...it, y: v } : it))}>
                              <SelectTrigger className="w-full truncate" title={s.y || ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                              <SelectContent>
                                {columnOptions.map((col: any) => (
                                  <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4">
                            <Label className="text-[11px]">系列名称</Label>
                            <Input value={s.label || ""} onChange={(e) => setSeriesList(prev => prev.map((it, i) => i === idx ? { ...it, label: e.target.value } : it))} placeholder="默认使用列名" />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-[11px]">颜色</Label>
                            <input type="color" className="h-9 w-full p-0 border rounded" value={s.color || defaultSeriesColors[idx % defaultSeriesColors.length]} onChange={(e) => setSeriesList(prev => prev.map((it, i) => i === idx ? { ...it, color: e.target.value } : it))} aria-label="系列颜色" />
                          </div>
                          <div className="col-span-1 flex items-end">
                            <Button variant="ghost" size="sm" onClick={() => setSeriesList(prev => { const next = prev.filter((_, i) => i !== idx); return next.length ? next : [{ id: `${Date.now()}`, y: "" }] })}>删除</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {templateType === "bar" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Switch id="stacked" checked={stacked} onCheckedChange={setStacked} />
                    <Label htmlFor="stacked">累计堆叠</Label>
                  </div>
                )}

                {templateType === "line" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Switch id="stacked-line" checked={stacked} onCheckedChange={setStacked} />
                    <Label htmlFor="stacked-line">累计堆叠</Label>
                  </div>
                )}

                {/* Metric value selector */}
                {templateType === "metric" && (
                  <div className="space-y-1 mt-1">
                    <Label>值字段</Label>
                    <Select value={encoding["value"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["value"]: v }))}>
                      <SelectTrigger className="w-full truncate" title={encoding["value"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                      <SelectContent>
                        {columnOptions.map((col: any) => (
                          <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Watchlist required fields */}
                {templateType === "watchlist" && (
                  <div className="space-y-2 mt-1">
                    <div>
                      <Label>X轴（日期字段）</Label>
                      <Select value={encoding["date"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["date"]: v }))}>
                        <SelectTrigger className="w-full truncate" title={encoding["date"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                        <SelectContent>
                          {columnOptions.map((col: any) => (
                            <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>代码字段</Label>
                      <Select value={encoding["symbol"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["symbol"]: v }))}>
                        <SelectTrigger className="w-full truncate" title={encoding["symbol"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                        <SelectContent>
                          {columnOptions.map((col: any) => (
                            <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>价格字段</Label>
                      <Select value={encoding["price"] ?? undefined} onValueChange={(v) => setEncoding(prev => ({ ...prev, ["price"]: v }))}>
                        <SelectTrigger className="w-full truncate" title={encoding["price"] ?? ""}><SelectValue placeholder="选择列" /></SelectTrigger>
                        <SelectContent>
                          {columnOptions.map((col: any) => (
                            <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Removed optional mapping UI for watchlist as requested earlier */}

              </>
            )}
          </div>

          {/* Right: Live preview */}
          <div className="space-y-2 xl:col-span-8 min-h-0 min-w-0">
            <Label>实时预览</Label>
            <div className="min-h-[320px] lg:min-h-[420px] bg-gray-50 border rounded-md p-2 overflow-auto">
              {renderPreview()}
            </div>
          </div>
        </div>

        {/* Footer: always visible */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={handleSave} disabled={loading || !isValid()}>
            {loading ? (mode === "edit" ? "更新中…" : "创建中…") : (mode === "edit" ? "更新" : "创建")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
