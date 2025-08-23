"use client"

import type React from "react"
import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Minimize2, Plus, Move3D, FileText, GripVertical, Edit3 } from "lucide-react"
import MetricCard from "@/components/widget/metric-card"
import DataTable from "@/components/widget/data-table"
import ChartCard from "@/components/widget/chart-card"
import CandlestickChart from "@/components/widget/candlestick-chart"
import Watchlist from "@/components/widget/watchlist"
import TextMarkdown from "@/components/widget/text-markdown"

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

interface DashboardCanvasProps {
  items: CanvasItem[]
  onItemsChange: (items: CanvasItem[]) => void
  onDeleteItem: (itemId: string) => void
  onAddToContext: (itemId: string) => void
  onMinimizeItem: (itemId: string) => void
  showAIChat: boolean
  selectedContext?: string[]
  onEditItem?: (itemId: string) => void
}

const HEADER_HEIGHT = 56

export default function DashboardCanvas({
  items,
  onItemsChange,
  onDeleteItem,
  onAddToContext,
  onMinimizeItem,
  showAIChat,
  selectedContext = [],
  onEditItem,
}: DashboardCanvasProps) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [resizingItem, setResizingItem] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)

  const dragOffset = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const sortedItems = [...items].sort((a, b) => a.order - b.order)

  // 根据容器宽度与各 item 的期望比例，将一行中的 item 按比例分配宽度，避免溢出与换行
  const widthMap = useMemo(() => {
    const map = new Map<string, number>()
    if (containerWidth <= 0 || sortedItems.length === 0) return map

    const GAP = 16 // gap-4
    const rows: Array<{ ids: string[]; ratios: number[] }> = []

    let curIds: string[] = []
    let curRatios: number[] = []
    let acc = 0

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

    for (const it of sortedItems) {
      const ratio = it.widthRatio !== undefined
        ? clamp(it.widthRatio, 0.05, 1)
        : clamp(((it.width || containerWidth * 0.33) / Math.max(1, containerWidth)), 0.05, 1)
      // 放宽换行阈值，避免 0.5 + 0.5 等轻微误差导致错误换行
      const EPS = 0.25
      if (acc + ratio > 1 + EPS && curIds.length > 0) {
        rows.push({ ids: curIds, ratios: curRatios })
        curIds = [it.id]
        curRatios = [ratio]
        acc = ratio
      } else {
        curIds.push(it.id)
        curRatios.push(ratio)
        acc += ratio
      }
    }
    if (curIds.length > 0) rows.push({ ids: curIds, ratios: curRatios })

    for (const row of rows) {
      const n = row.ids.length
      const rowWidth = Math.max(0, containerWidth - GAP * Math.max(0, n - 1))
      const sum = row.ratios.reduce((a, b) => a + b, 0) || 1
      // 先按比例得到浮点宽度
      const floats = row.ratios.map((r) => (r / sum) * rowWidth)
      // 使用最大余数法分配像素，保证整数宽度之和等于 rowWidth
      const floors = floats.map((w) => Math.floor(w))
      let assigned = floors.reduce((a, b) => a + b, 0)
      let remainder = Math.max(0, Math.round(rowWidth - assigned))
      const order = floats
        .map((w, i) => ({ i, frac: w - Math.floor(w) }))
        .sort((a, b) => b.frac - a.frac)
      const result = floors.slice()
      for (let k = 0; k < order.length && remainder > 0; k++) {
        result[order[k].i] += 1
        remainder--
      }
      // 写入 map
      for (let i = 0; i < n; i++) {
        map.set(row.ids[i], result[i])
      }
    }
    return map
  }, [sortedItems, containerWidth])

  useEffect(() => {
    const updateContainerWidth = () => {
      let width = 0
      if (rowRef.current) {
        width = Math.floor(rowRef.current.clientWidth)
      } else if (containerRef.current) {
        width = Math.floor(containerRef.current.clientWidth)
      } else if (scrollAreaRef.current) {
        width = Math.floor(scrollAreaRef.current.clientWidth)
      }
      if (width > 0) {
        setContainerWidth(width)
      }
    }

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(updateContainerWidth)
      ;(updateContainerWidth as any)._raf2 = raf2
    })

    const resizeObserver = new ResizeObserver(() => {
      updateContainerWidth()
    })

    if (rowRef.current) resizeObserver.observe(rowRef.current)
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    if (scrollAreaRef.current) resizeObserver.observe(scrollAreaRef.current)

    const handleWindowResize = () => updateContainerWidth()
    window.addEventListener("resize", handleWindowResize)

    return () => {
      window.removeEventListener("resize", handleWindowResize)
      resizeObserver.disconnect()
      cancelAnimationFrame(raf1)
      if ((updateContainerWidth as any)._raf2) cancelAnimationFrame((updateContainerWidth as any)._raf2)
    }
  }, [])

  useEffect(() => {
    const measureAfterPanelToggle = () => {
      let rafA: number | null = null
      let rafB: number | null = null
      const run = () => {
        const el = rowRef.current || containerRef.current || scrollAreaRef.current
        if (!el) return
        const width = Math.floor(el.clientWidth)
        if (width > 0) setContainerWidth(width)
      }
      rafA = requestAnimationFrame(() => {
        rafB = requestAnimationFrame(run)
      })
      return () => {
        if (rafA) cancelAnimationFrame(rafA)
        if (rafB) cancelAnimationFrame(rafB)
      }
    }
    const cleanup = measureAfterPanelToggle()
    return cleanup
  }, [showAIChat])

  useEffect(() => {
    if (containerWidth <= 0) return

    const needsInit = items.some((item) => item.widthRatio === undefined)
    if (!needsInit) return

    const updated = items.map((item) => {
      if (item.widthRatio === undefined) {
        const baseWidth = Number.isFinite(item.width) ? item.width : Math.max(200, Math.min(containerWidth, containerWidth * 0.33))
        const ratio = Math.min(1, Math.max(0.1, baseWidth / containerWidth))
        return { ...item, widthRatio: ratio }
      }
      return item
    })

    onItemsChange(updated)
  }, [containerWidth, items, onItemsChange])

  const getItemWidth = useCallback(
    (item: CanvasItem) => {
      if (containerWidth <= 0) return item.width
      const fromMap = widthMap.get(item.id)
      if (typeof fromMap === 'number') return fromMap
      // 退化：单独按比例估算
      const ratio = item.widthRatio !== undefined
        ? item.widthRatio
        : Math.min(1, Math.max(0.1, (item.width || containerWidth * 0.33) / Math.max(1, containerWidth)))
      return Math.max(120, Math.floor(containerWidth * ratio))
    },
    [containerWidth, widthMap],
  )

  const renderChartWidget = (data: any, title?: string, itemId?: string) => {
    const type = data?.chartType || "bar"

    if (type === "candlestick") {
      const labels: string[] = Array.isArray(data?.labels) ? data.labels : []
      const series = data?.datasets?.[0]?.data || []
      const parseLabelToDate = (label: any, idx: number, count: number) => {
        const d = new Date(label)
        if (!isNaN(d.getTime())) return d
        const base = new Date()
        const daysAgo = count - idx
        base.setDate(base.getDate() - daysAgo)
        return base
      }
      const candles = Array.isArray(series)
        ? series.map((d: any, i: number) => ({
            date: parseLabelToDate(labels[i], i, series.length),
            open: Number(d?.o ?? d?.open ?? 0),
            high: Number(d?.h ?? d?.high ?? 0),
            low: Number(d?.l ?? d?.low ?? 0),
            close: Number(d?.c ?? d?.close ?? 0),
            volume: Number(d?.v ?? d?.volume ?? 0) || 0,
          }))
        : []

      return (
        <div className="p-0 h-full flex flex-col">
          <CandlestickChart
            symbol={data?.symbol ?? ""}
            companyName={data?.companyName ?? ""}
            data={candles}
          />
        </div>
      )
    }

    if (type === "line" || type === "bar") {
      const t = type === "line" ? "趋势" : "销售数据趋势"
      const stacked = type === "bar" ? !!data?.stacked : false
      return <ChartCard type={type} data={data} title={t} stacked={stacked} />
    }

    const maxValue = Math.max(...(data.datasets?.flatMap((d: any) => d.data) || [0]))

    if (!data.labels || data.labels.length === 0 || !data.datasets || data.datasets.length === 0) {
      return (
        <div className="p-4 h-full flex flex-col">
          <h3 className="text-sm font-semibold mb-4">销售数据趋势</h3>
          <div className="relative flex-1">
            <div className="absolute left-6 top-2 bottom-6 w-px bg-gray-300" />
            <div className="absolute left-6 right-2 bottom-6 h-px bg-gray-300" />
            <div className="absolute left-8 right-2 top-2 bottom-8 flex items-center justify-center text-xs text-gray-500">暂无数据</div>
          </div>
        </div>
      )
    }

    return (
      <div className="p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold mb-4">销售数据趋势</h3>
        <div className="flex-1 flex items-end justify-between gap-2">
          {(data.labels || []).map((label: string, index: number) => (
            <div key={label} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col items-center gap-1 mb-2">
                {(data.datasets || []).map((dataset: any, datasetIndex: number) => (
                  <div
                    key={datasetIndex}
                    className="w-full rounded-t"
                    style={{
                      height: `${maxValue ? (Number(dataset.data[index]) / maxValue) * 120 : 0}px`,
                      backgroundColor: dataset.color,
                      minHeight: "4px",
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-4 mt-4">
          {(data.datasets || []).map((dataset: any, index: number) => (
            <div key={index} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: dataset.color }} />
              <span className="text-xs text-gray-600">{dataset.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderWatchlistWidget = (data: any, title?: string) => {
    const items = (data?.items as any[]) || []
    const dateLabel = data?.dateLabel
    return <Watchlist title={title || "自选股"} dateLabel={dateLabel} items={items} />
  }

  const renderTableWidget = (data: any) => {
    return (
      <div className="p-4 h-full flex flex-col">
        <DataTable headers={data.headers || []} rows={data.rows || []} />
      </div>
    )
  }

  const renderMetricWidget = (data: any) => {
    return (
      <div className="p-4 h-full flex flex-col">
        <MetricCard title={data.title} value={data.value} change={data.change} subtitle={data.subtitle} />
      </div>
    )
  }

  const renderTextWidget = (data: any, itemId?: string) => {
    const markdownEnabled = !!(data?.options?.markdown)
    if (markdownEnabled && itemId) {
      return (
        <div className="p-3 h-full overflow-auto">
          <TextMarkdown componentId={itemId} value={data.content || ""} />
        </div>
      )
    }
    return (
      <div className="p-4 h-full overflow-auto">
        <h3 className="text-lg font-semibold mb-4">{data.title}</h3>
        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{data.content}</div>
      </div>
    )
  }

  const renderWidgetContent = (item: CanvasItem) => {
    if (!item.data) return <p className="text-sm text-gray-600 p-4">加载中...</p>

    switch (item.widgetType) {
      case "Chart Widget":
        return renderChartWidget(item.data, item.title, item.id)
      case "Table Widget":
        return renderTableWidget(item.data)
      case "Metric Widget":
        return renderMetricWidget(item.data)
      case "Text Widget":
        return renderTextWidget(item.data, item.id)
      case "Watchlist Widget":
        return renderWatchlistWidget(item.data, item.title)
      default:
        return <p className="text-sm text-gray-600 p-4">{item.content}</p>
    }
  }

  const renderFileContent = (item: CanvasItem) => {
    if (!item.fileUrl || !item.fileType) {
      return <p className="text-sm text-gray-600 p-4">{item.content}</p>
    }

    if (item.fileType.startsWith("image/")) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50">
          <img
            src={item.fileUrl || "/placeholder.svg"}
            alt={item.title}
            className="max-w-full max-h-full object-contain"
            onError={(e) => {
              console.error("图片加载失败:", item.title)
              e.currentTarget.style.display = "none"
            }}
          />
        </div>
      )
    } else if (item.fileType === "application/pdf") {
      return (
        <iframe
          src={item.fileUrl}
          className="w-full h-full border-0"
          title={item.title}
          onError={() => {
            console.error("PDF加载失败:", item.title)
          }}
        />
      )
    } else {
      return (
        <div className="w-full h-full flex items-center justify-center p-4">
          <div className="text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">{item.title}</p>
            <p className="text-xs text-gray-500 mt-1">{item.fileType || "未知格式"}</p>
          </div>
        </div>
      )
    }
  }

  const handleDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId)
    setIsDragging(true)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", itemId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null)
    setIsDragging(false)
    setDragOverIndex(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault()
      const draggedItemId = e.dataTransfer.getData("text/plain")

      if (!draggedItemId || draggedItemId === sortedItems[dropIndex]?.id) {
        setDragOverIndex(null)
        return
      }

      const draggedItemIndex = sortedItems.findIndex((item) => item.id === draggedItemId)
      if (draggedItemIndex === -1) return

      const newItems = [...sortedItems]
      const [draggedItem] = newItems.splice(draggedItemIndex, 1)
      newItems.splice(dropIndex, 0, draggedItem)

      const updatedItems = newItems.map((item, index) => ({
        ...item,
        order: index,
      }))

      onItemsChange(updatedItems)
      setDragOverIndex(null)
    },
    [sortedItems, onItemsChange],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.preventDefault()
      e.stopPropagation()

      const item = items.find((i) => i.id === itemId)
      if (!item) return

      setResizingItem(itemId)
      setIsResizing(true)
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: item.width,
        height: item.height,
      }
    },
    [items],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isResizing && resizingItem && containerWidth > 0) {
        const deltaX = e.clientX - resizeStart.current.x
        const deltaY = e.clientY - resizeStart.current.y

        const updatedItems = items.map((item) => {
          if (item.id === resizingItem) {
            const newWidth = Math.max(200, Math.min(containerWidth, resizeStart.current.width + deltaX))
            const newHeight = Math.max(150, resizeStart.current.height + deltaY)

            const newWidthRatio = newWidth / containerWidth

            return {
              ...item,
              height: newHeight,
              width: newWidth,
              widthRatio: newWidthRatio,
            }
          }
          return item
        })

        onItemsChange(updatedItems)
      }
    },
    [isResizing, resizingItem, items, onItemsChange, containerWidth],
  )

  const handleMouseUp = useCallback(() => {
    setResizingItem(null)
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      const handleMouseMoveGlobal = (e: MouseEvent) => {
        e.preventDefault()
        handleMouseMove(e)
      }

      const handleMouseUpGlobal = (e: MouseEvent) => {
        e.preventDefault()
        handleMouseUp()
      }

      document.addEventListener("mousemove", handleMouseMoveGlobal, { passive: false })
      document.addEventListener("mouseup", handleMouseUpGlobal, { passive: false })
      document.body.style.userSelect = "none"

      return () => {
        document.removeEventListener("mousemove", handleMouseMoveGlobal)
        document.removeEventListener("mouseup", handleMouseUpGlobal)
        document.body.style.userSelect = ""
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 overflow-visible" ref={scrollAreaRef}>
        <div className="p-4" ref={containerRef}>
          <div className="flex flex-wrap gap-4" ref={rowRef}>
            {sortedItems.map((item, index) => (
              <Card
                key={item.id}
                draggable
                className={`border-2 transition-all duration-200 overflow-hidden group shadow-lg bg-white flex-shrink-0 ${
                  draggedItem === item.id ? "opacity-50 scale-95" : ""
                } ${dragOverIndex === index ? "ring-2 ring-blue-400 ring-offset-2" : ""} ${
                  selectedContext.includes(item.id) ? "border-blue-500 ring-1 ring-blue-300" : "border-gray-200 hover:border-blue-400"
                }`}
                style={{
                  width: getItemWidth(item),
                  height: item.minimized ? HEADER_HEIGHT : item.height,
                  minWidth: "120px",
                  maxWidth: containerWidth > 0 ? `${containerWidth}px` : "none",
                  minHeight: item.minimized ? HEADER_HEIGHT : "150px",
                }}
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
              >
                <CardHeader
                  className="pb-2 bg-white border-b flex-shrink-0 select-none cursor-move"
                  style={{ height: HEADER_HEIGHT }}
                >
                  <div className="flex items-center justify-between h-full">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <CardTitle className="text-sm truncate">{item.title}</CardTitle>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {onEditItem ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditItem(item.id)
                          }}
                          title="编辑"
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                      ) : null}
                      <Button
                        variant={selectedContext.includes(item.id) ? "default" : "ghost"}
                        size="icon"
                        className="w-6 h-6"
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddToContext(item.id)
                        }}
                        title={selectedContext.includes(item.id) ? "从AI上下文移除" : "添加到AI上下文"}
                        aria-pressed={selectedContext.includes(item.id)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6"
                        title={item.minimized ? "展开" : "最小化"}
                        onClick={(e) => {
                          e.stopPropagation()
                          onMinimizeItem(item.id)
                        }}
                      >
                        <Minimize2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteItem(item.id)
                        }}
                        title="删除"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {!item.minimized && (
                  <CardContent
                    className="p-0 relative overflow-hidden"
                    style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}
                  >
                    <div className="w-full h-full">
                      {item.type === "file" ? renderFileContent(item) : renderWidgetContent(item)}
                    </div>
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-gray-200 hover:bg-gray-300"
                      onMouseDown={(e) => handleMouseDown(e, item.id)}
                      title={`拖拽调整大小 (当前比例: ${Math.round((item.widthRatio ?? Math.min(1, Math.max(0.1, (item.width || containerWidth * 0.33) / Math.max(1, containerWidth || 1)))) * 100)}%)`}
                    >
                      <Move3D className="w-3 h-3 text-gray-600" />
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
