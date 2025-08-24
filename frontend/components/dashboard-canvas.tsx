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
  col?: number
  row?: number
  colSpan?: number
  rowSpan?: number
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
const TOTAL_COLS = 48
const GRID_GAP = 16
const GRID_ROW_HEIGHT = 80

// Simple feature flag to disable legacy list reordering when using grid drag
const ENABLE_LIST_REORDER = false

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
  const [dragGridTarget, setDragGridTarget] = useState<{ col: number; row: number } | null>(null)

  const dragOffset = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, colSpan: 1, rowSpan: 2 })
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const sortedItems = [...items].sort((a, b) => a.order - b.order)

  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    const updateContainerWidth = () => {
      let width = 0
      const el = rowRef.current || containerRef.current || scrollAreaRef.current
      if (el) width = Math.floor(el.clientWidth)
      if (width > 0) setContainerWidth(width)
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
  }, [showAIChat])

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  const getColUnit = useCallback(() => {
    if (containerWidth <= 0) return 1
    const totalGaps = GRID_GAP * (TOTAL_COLS - 1)
    const usable = Math.max(0, containerWidth - totalGaps)
    return usable / TOTAL_COLS
  }, [containerWidth])

  const ensureSpans = useCallback(
    (item: CanvasItem): { colSpan: number; rowSpan: number } => {
      const colSpan = clamp(
        item.colSpan ?? Math.max(1, Math.round(((item.widthRatio ?? (item.width && containerWidth ? item.width / containerWidth : 0.33)) || 0.33) * TOTAL_COLS)),
        1,
        TOTAL_COLS,
      )
      const rowSpan = clamp(
        item.rowSpan ?? Math.max(1, Math.round((Math.max(150, item.height || 240)) / GRID_ROW_HEIGHT)),
        1,
        24,
      )
      return { colSpan, rowSpan }
    },
    [containerWidth],
  )

  // Collision utilities for explicitly positioned items (with col/row defined)
  const rectOf = useCallback((it: CanvasItem): { l: number; r: number; t: number; b: number } | null => {
    const { colSpan, rowSpan } = ensureSpans(it)
    const c = it.col
    const r = it.row
    if (!c || !r) return null
    return { l: c, r: c + colSpan - 1, t: r, b: r + rowSpan - 1 }
  }, [ensureSpans])

  const intersects = useCallback((a: CanvasItem, b: CanvasItem): boolean => {
    const ra = rectOf(a)
    const rb = rectOf(b)
    if (!ra || !rb) return false
    const overlapCols = !(ra.r < rb.l || rb.r < ra.l)
    const overlapRows = !(ra.b < rb.t || rb.b < ra.t)
    return overlapCols && overlapRows
  }, [rectOf])

  const moveDownUntilFree = useCallback((draft: CanvasItem, all: CanvasItem[]): CanvasItem => {
    // Only operate on items with explicit col/row
    if (!draft.col || !draft.row) return draft
    let moved = { ...draft }
    let guard = 0
    while (guard++ < 10000 && all.some(it => it.id !== moved.id && intersects(moved, it))) {
      moved = { ...moved, row: (moved.row || 1) + 1 }
    }
    return moved
  }, [intersects])

  const computeGridPositionFromEvent = useCallback(
    (e: { clientX: number; clientY: number }, colSpan: number): { col: number; row: number } | null => {
      const grid = rowRef.current
      if (!grid) return null
      const rect = grid.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < 0 || y < 0) return null
      const colUnit = getColUnit()
      const trackW = colUnit + GRID_GAP
      const trackH = GRID_ROW_HEIGHT + GRID_GAP
      let col = Math.floor((x + GRID_GAP / 2) / trackW) + 1
      let row = Math.floor((y + GRID_GAP / 2) / trackH) + 1
      col = clamp(col, 1, Math.max(1, TOTAL_COLS - colSpan + 1))
      row = clamp(row, 1, 1000)
      return { col, row }
    },
    [getColUnit],
  )

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

      const { colSpan, rowSpan } = ensureSpans(item)
      setResizingItem(itemId)
      setIsResizing(true)
      const colUnit = getColUnit()
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: colSpan * colUnit + (colSpan - 1) * GRID_GAP,
        height: rowSpan * GRID_ROW_HEIGHT,
        colSpan,
        rowSpan,
      }
    },
    [items, ensureSpans, getColUnit],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isResizing && resizingItem && containerWidth > 0) {
        const deltaX = e.clientX - resizeStart.current.x
        const deltaY = e.clientY - resizeStart.current.y

        const colUnit = getColUnit()
        const nextWidthPx = Math.max(1, resizeStart.current.width + deltaX)
        const nextHeightPx = Math.max(1, resizeStart.current.height + deltaY)

        const estColSpan = clamp(Math.round((nextWidthPx + GRID_GAP) / (colUnit + GRID_GAP)), 1, TOTAL_COLS)
        const estRowSpan = clamp(Math.round(nextHeightPx / GRID_ROW_HEIGHT), 1, 24)

        const updatedItems = items.map((item) => {
          if (item.id === resizingItem) {
            const widthRatio = estColSpan / TOTAL_COLS
            return {
              ...item,
              colSpan: estColSpan,
              rowSpan: estRowSpan,
              widthRatio,
              width: Math.round(estColSpan * colUnit + (estColSpan - 1) * GRID_GAP),
              height: Math.round(estRowSpan * GRID_ROW_HEIGHT),
            }
          }
          return item
        })

        onItemsChange(updatedItems)
      }
    },
    [isResizing, resizingItem, items, onItemsChange, containerWidth, getColUnit],
  )

  const handleMouseUp = useCallback(() => {
    // On resize end, resolve any collisions by pushing the resized card down
    if (resizingItem) {
      const all = itemsRef.current
      const idx = all.findIndex(it => it.id === resizingItem)
      if (idx !== -1) {
        const moved = moveDownUntilFree(all[idx], all)
        if (moved !== all[idx]) {
          const next = all.map((it, i) => i === idx ? moved : it)
          onItemsChange(next)
        }
      }
    }
    setResizingItem(null)
    setIsResizing(false)
  }, [resizingItem, moveDownUntilFree, onItemsChange])

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

  const handleGridDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!draggedItem) return
      e.preventDefault()
      const item = itemsRef.current.find((it) => it.id === draggedItem)
      if (!item) return
      const { colSpan } = ensureSpans(item)
      const pos = computeGridPositionFromEvent(e, colSpan)
      if (pos) setDragGridTarget(pos)
    },
    [draggedItem, ensureSpans, computeGridPositionFromEvent],
  )

  const handleGridDrop = useCallback(
    (e: React.DragEvent) => {
      if (!draggedItem) return
      e.preventDefault()
      const item = itemsRef.current.find((it) => it.id === draggedItem)
      if (!item) { setDragGridTarget(null); return }
      const { colSpan } = ensureSpans(item)
      const pos = computeGridPositionFromEvent(e, colSpan) || dragGridTarget
      if (!pos) { setDragGridTarget(null); return }

      // Place at requested col,row then resolve collisions by pushing down the dragged item
      const prelim = itemsRef.current.map((it) =>
        it.id === draggedItem ? { ...it, col: pos.col, row: pos.row } : it,
      )
      const idx = prelim.findIndex(it => it.id === draggedItem)
      if (idx === -1) { onItemsChange(prelim); setDragGridTarget(null); setDragOverIndex(null); setDraggedItem(null); setIsDragging(false); return }
      const moved = moveDownUntilFree(prelim[idx], prelim)
      const resolved = prelim.map((it, i) => i === idx ? moved : it)

      onItemsChange(resolved)
      setDragGridTarget(null)
      setDragOverIndex(null)
      setDraggedItem(null)
      setIsDragging(false)
    },
    [draggedItem, onItemsChange, ensureSpans, computeGridPositionFromEvent, dragGridTarget, moveDownUntilFree],
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
      const stacked = !!data?.stacked
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

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 min-h-0 overflow-visible" ref={scrollAreaRef}>
        <div className="p-4" ref={containerRef}>
          <div
            className="grid gap-4"
            ref={rowRef}
            onDragOver={handleGridDragOver}
            onDrop={handleGridDrop}
            style={{ gridTemplateColumns: `repeat(${TOTAL_COLS}, minmax(0, 1fr))`, gridAutoRows: `${GRID_ROW_HEIGHT}px` }}
          >
            {sortedItems.map((item, index) => {
              const spans = ensureSpans(item)
              const widthPct = Math.round((spans.colSpan / TOTAL_COLS) * 100)
              return (
                <Card
                  key={item.id}
                  draggable
                  className={`border-2 transition-all duration-200 overflow-hidden group shadow-lg bg-white ${
                    draggedItem === item.id ? "opacity-50 scale-95" : ""
                  } ${dragOverIndex === index ? "ring-2 ring-blue-400 ring-offset-2" : ""} ${
                    selectedContext.includes(item.id) ? "border-blue-500 ring-1 ring-blue-300" : "border-gray-200 hover:border-blue-400"
                  }`}
                  style={{
                    gridColumn: item.col ? `${item.col} / span ${spans.colSpan}` : `span ${spans.colSpan} / span ${spans.colSpan}`,
                    gridRow: item.row ? `${item.row} / span ${spans.rowSpan}` : `span ${spans.rowSpan} / span ${spans.rowSpan}`,
                    height: item.minimized ? HEADER_HEIGHT : undefined,
                    minWidth: 0,
                    minHeight: item.minimized ? HEADER_HEIGHT : GRID_ROW_HEIGHT,
                  }}
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={handleDragEnd}
                  {...(ENABLE_LIST_REORDER ? {
                    onDragOver: (e: React.DragEvent) => handleDragOver(e, index),
                    onDragLeave: handleDragLeave,
                    onDrop: (e: React.DragEvent) => handleDrop(e, index),
                  } : {})}
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
                        title={`拖拽调整大小 (当前宽度: ${widthPct}% | 栅格: ${spans.colSpan}/${TOTAL_COLS})`}
                      >
                        <Move3D className="w-3 h-3 text-gray-600" />
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
            {dragGridTarget && draggedItem && !isResizing && (
              <div
                className="border-2 border-dashed border-blue-400/70 bg-blue-50/30 rounded-sm"
                style={(() => {
                  const item = itemsRef.current.find((it) => it.id === draggedItem)
                  const spans = item ? ensureSpans(item) : { colSpan: 1, rowSpan: 1 }
                  return {
                    gridColumn: `${dragGridTarget.col} / span ${spans.colSpan}`,
                    gridRow: `${dragGridTarget.row} / span ${spans.rowSpan}`,
                    pointerEvents: "none",
                    minHeight: GRID_ROW_HEIGHT,
                  } as React.CSSProperties
                })()}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
