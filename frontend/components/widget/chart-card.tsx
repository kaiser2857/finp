"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface ChartDataset {
  label: string
  data: number[]
  color?: string
}

export interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

export interface ChartCardProps {
  type: "bar" | "line"
  data: ChartData
  title?: string
  stacked?: boolean
}

export default function ChartCard({ type, data, title, stacked }: ChartCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // interaction state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [viewOffset, setViewOffset] = useState(0) // index of first visible point
  const [itemsPerScreen, setItemsPerScreen] = useState<number>(60) // number of labels to show
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [hoveredDatasetIndex, setHoveredDatasetIndex] = useState<number | null>(null) // for bars
  const [sizeTick, setSizeTick] = useState(0)

  // observe container resize for responsive redraws
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1))
    ro.observe(el)
    return () => { try { ro.disconnect() } catch {} }
  }, [])

  const labels = data?.labels ?? []
  const datasets = data?.datasets ?? []
  const datasetsCount = datasets.length

  // initialize window to last N points
  useEffect(() => {
    const len = labels.length
    if (!len) return
    const initCount = Math.min(60, len)
    setItemsPerScreen(initCount)
    setViewOffset(Math.max(0, len - initCount))
  }, [labels.length])

  // helpers
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const visibleRange = useMemo(() => {
    const len = labels.length
    if (len === 0) return { start: 0, count: 0, end: 0 }
    const count = clamp(Math.round(itemsPerScreen), 1, len)
    const start = clamp(Math.round(viewOffset), 0, Math.max(0, len - count))
    const end = Math.min(len, start + count)
    return { start, count, end }
  }, [labels.length, itemsPerScreen, viewOffset])

  const visibleYExtents = useMemo(() => {
    if (!labels.length || !datasets.length || visibleRange.count === 0) {
      return { min: 0, max: 1 }
    }
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    if (stacked) {
      // For stacked charts, scale should reflect sum per x (pos and neg separately)
      for (let i = visibleRange.start; i < visibleRange.end; i++) {
        let pos = 0
        let neg = 0
        for (const ds of datasets) {
          const v = Number(ds.data?.[i])
          if (!Number.isFinite(v)) continue
          if (v >= 0) pos += v
          else neg += v
        }
        if (pos > max) max = pos
        if (neg < min) min = neg
      }
      // include baseline 0 when there are only positives or only negatives
      if (!Number.isFinite(min)) min = 0
      if (!Number.isFinite(max)) max = 0
    } else {
      // Non-stacked: use individual dataset values
      for (let i = visibleRange.start; i < visibleRange.end; i++) {
        for (const ds of datasets) {
          const v = Number(ds.data?.[i])
          if (!Number.isFinite(v)) continue
          if (v < min) min = v
          if (v > max) max = v
        }
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
    }
    if (min === max) {
      const eps = Math.abs(min || 1) * 0.05
      return { min: min - eps, max: max + eps }
    }
    return { min, max }
  }, [labels.length, datasets, visibleRange, stacked])

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const padding = { top: 12, right: 60, bottom: 40, left: 60 }
    const chartWidth = Math.max(10, width - padding.left - padding.right)
    const chartHeight = Math.max(10, height - padding.top - padding.bottom)

    // background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    // guard
    if (!labels.length || !datasets.length || visibleRange.count === 0) {
      // axes
      ctx.strokeStyle = "#e5e7eb"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padding.left, padding.top)
      ctx.lineTo(padding.left, padding.top + chartHeight)
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight)
      ctx.stroke()

      ctx.fillStyle = "#6b7280"
      ctx.font = "12px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("暂无数据", padding.left + chartWidth / 2, padding.top + chartHeight / 2)
      return
    }

    // visible window
    const { start, end, count } = visibleRange

    // compute y-scale
    const yMinRaw = type === "bar" ? Math.min(0, visibleYExtents.min) : visibleYExtents.min
    const yMaxRaw = type === "bar" ? Math.max(0, visibleYExtents.max) : visibleYExtents.max
    const range = yMaxRaw - yMinRaw
    const pad = range * 0.1
    const yMin = yMinRaw - pad
    const yMax = yMaxRaw + pad
    const yRange = yMax - yMin

    const yToPx = (v: number) => padding.top + chartHeight - ((v - yMin) / yRange) * chartHeight
    const pxToY = (py: number) => yMin + (1 - (py - padding.top) / chartHeight) * yRange

    // grid lines
    ctx.strokeStyle = "#f0f0f0"
    ctx.lineWidth = 1
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight * i) / 5
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(padding.left + chartWidth, y)
      ctx.stroke()
    }

    // x grid lines (dynamic step to avoid crowding, similar to candlestick)
    const minTickPx = 80
    const maxTicks = Math.max(2, Math.floor(chartWidth / minTickPx))
    const xStep = Math.max(1, Math.ceil(count / maxTicks))
    for (let i = 0; i < count; i += xStep) {
      const x = padding.left + (i * chartWidth) / count
      ctx.beginPath()
      ctx.moveTo(x, padding.top)
      ctx.lineTo(x, padding.top + chartHeight)
      ctx.stroke()
    }

    // axes
    ctx.strokeStyle = "#e5e7eb"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padding.left, padding.top)
    ctx.lineTo(padding.left, padding.top + chartHeight)
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight)
    ctx.stroke()

    // y-axis labels
    ctx.fillStyle = "#666666"
    ctx.font = "12px Arial"
    ctx.textAlign = "right"
    ctx.textBaseline = "alphabetic"
    for (let i = 0; i <= 5; i++) {
      const v = yMin + (yRange * (1 - i / 5))
      const y = padding.top + (chartHeight * i) / 5
      ctx.fillText(v.toFixed(2), padding.left - 10, y + 4)
    }

    // x-axis labels (spaced like candlestick, compact date formatting)
    const formatDateLabel = (raw: string) => {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
      }
      return raw
    }
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    for (let i = 0; i < count; i += xStep) {
      const xCenter = padding.left + (i * chartWidth) / count + chartWidth / count / 2
      const raw = labels[start + i] ?? ""
      const label = formatDateLabel(String(raw))
      ctx.fillText(label, xCenter, padding.top + chartHeight + 16)
    }

    // draw datasets
    if (type === "line") {
      // Precompute cumulative sums for stacked line
      let cumByDs: number[][] | null = null
      if (stacked) {
        cumByDs = Array.from({ length: datasets.length }, () => new Array(labels.length).fill(NaN))
        for (let i = 0; i < labels.length; i++) {
          let pos = 0
          let neg = 0
          for (let di = 0; di < datasets.length; di++) {
            const v = Number(datasets[di].data?.[i])
            if (!Number.isFinite(v)) { cumByDs[di][i] = NaN; continue }
            if (v >= 0) { pos += v; cumByDs[di][i] = pos }
            else { neg += v; cumByDs[di][i] = neg }
          }
        }
      }
      // lines
      for (let di = 0; di < datasets.length; di++) {
        const ds = datasets[di]
        const color = ds.color || "#3b82f6"
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath()
        let started = false
        for (let i = 0; i < count; i++) {
          const idx = start + i
          const vPlot = stacked && cumByDs ? cumByDs[di][idx] : Number(ds.data?.[idx])
          if (!Number.isFinite(vPlot)) {
            started = false
            continue
          }
          const x = padding.left + (i * chartWidth) / count + chartWidth / count / 2
          const y = yToPx(vPlot)
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }
    } else {
      // bars
      if (stacked) {
        // stacked bars: single bar per x with accumulated segments (handle pos/neg separately)
        const slotW = chartWidth / count
        const barW = Math.max(2, slotW * 0.6)
        const xOffset = (slotW - barW) / 2
        const yZero = yToPx(0)
        for (let i = 0; i < count; i++) {
          const idx = start + i
          let posCum = 0
          let negCum = 0
          const xLeft = padding.left + i * slotW + xOffset
          for (let di = 0; di < datasets.length; di++) {
            const ds = datasets[di]
            const vRaw = Number(ds.data?.[idx])
            if (!Number.isFinite(vRaw) || vRaw === 0) continue
            const color = ds.color || "#3b82f6"
            const from = vRaw > 0 ? posCum : negCum
            const to = from + vRaw
            const y1 = yToPx(from)
            const y2 = yToPx(to)
            const yTop = Math.min(y1, y2)
            const h = Math.max(1, Math.abs(y2 - y1))
            const x = xLeft
            // segment
            ctx.fillStyle = color
            ctx.globalAlpha = 0.9
            ctx.fillRect(x, yTop, barW, h)
            ctx.globalAlpha = 1
            if (vRaw > 0) posCum = to; else negCum = to
          }
        }
      } else {
        // grouped bars (default)
        const slotW = chartWidth / count
        const groupW = Math.max(2, slotW * 0.8)
        const barW = Math.max(1, groupW / Math.max(1, datasetsCount))
        const groupOffset = (slotW - groupW) / 2
        const yZero = yToPx(0)

        for (let i = 0; i < count; i++) {
          const idx = start + i
          const xSlot = padding.left + i * slotW
          for (let di = 0; di < datasets.length; di++) {
            const ds = datasets[di]
            const v = Number(ds.data?.[idx])
            if (!Number.isFinite(v)) continue
            const color = ds.color || "#3b82f6"
            const x = xSlot + groupOffset + di * barW
            const yVal = yToPx(v)
            const yTop = Math.min(yVal, yZero)
            const h = Math.max(1, Math.abs(yZero - yVal))

            ctx.fillStyle = color
            ctx.globalAlpha = 0.9
            ctx.fillRect(x, yTop, barW, h)
            ctx.globalAlpha = 1
          }
        }
      }
    }

    // crosshair and readouts
    if (crosshair) {
      const cx = clamp(crosshair.x, padding.left, padding.left + chartWidth)
      const cy = clamp(crosshair.y, padding.top, padding.top + chartHeight)

      // guidelines
      ctx.strokeStyle = "#9CA3AF"
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(cx, padding.top)
      ctx.lineTo(cx, padding.top + chartHeight)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(padding.left, cy)
      ctx.lineTo(padding.left + chartWidth, cy)
      ctx.stroke()
      ctx.setLineDash([])

      // y box
      const padX = 6
      const padY = 4
      const yValue = pxToY(cy)
      const yText = `${yValue.toFixed(2)}`
      const yTextW = ctx.measureText(yText).width
      const yBoxW = Math.ceil(yTextW + padX * 2)
      const yBoxH = 18
      let yBoxX = padding.left + chartWidth + 4
      if (yBoxX + yBoxW > width - 4) yBoxX = width - 4 - yBoxW
      let yBoxY = cy - yBoxH / 2
      yBoxY = clamp(yBoxY, padding.top, padding.top + chartHeight - yBoxH)

      ctx.fillStyle = "#111827"
      ctx.fillRect(yBoxX, yBoxY, yBoxW, yBoxH)
      ctx.strokeStyle = "#9CA3AF"
      ctx.strokeRect(yBoxX + 0.5, yBoxY + 0.5, yBoxW - 1, yBoxH - 1)
      ctx.fillStyle = "#ffffff"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(yText, yBoxX + padX, yBoxY + yBoxH / 2)

      // x box
      const slotW = chartWidth / count
      const rel = clamp((cx - padding.left) / chartWidth, 0, 1)
      const idxInWindow = Math.max(0, Math.min(count - 1, Math.round(rel * (count - 1))))
      const xLabel = labels[start + idxInWindow] ?? ""
      const xTextW = ctx.measureText(xLabel).width
      const xBoxW = Math.ceil(xTextW + padX * 2)
      const xBoxH = 18
      let xBoxX = cx - xBoxW / 2
      xBoxX = clamp(xBoxX, padding.left, padding.left + chartWidth - xBoxW)
      const xBoxY = padding.top + chartHeight + 4

      ctx.fillStyle = "#111827"
      ctx.fillRect(xBoxX, xBoxY, xBoxW, xBoxH)
      ctx.strokeStyle = "#9CA3AF"
      ctx.strokeRect(xBoxX + 0.5, xBoxY + 0.5, xBoxW - 1, xBoxH - 1)
      ctx.fillStyle = "#ffffff"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(xLabel, xBoxX + padX, xBoxY + xBoxH / 2)

      // hovered markers / info for line or bar
      if (type === "line") {
        // draw small circles at data points for all datasets at hovered index
        const cxIdxX = padding.left + idxInWindow * slotW + slotW / 2
        // recompute cumulative for hovered index if stacked
        let cumByDsHover: number[] | null = null
        if (stacked) {
          cumByDsHover = new Array(datasets.length).fill(NaN)
          let pos = 0
          let neg = 0
          for (let di = 0; di < datasets.length; di++) {
            const v0 = Number(datasets[di].data?.[start + idxInWindow])
            if (!Number.isFinite(v0)) { cumByDsHover[di] = NaN; continue }
            if (v0 >= 0) { pos += v0; cumByDsHover[di] = pos }
            else { neg += v0; cumByDsHover[di] = neg }
          }
        }
        for (let di = 0; di < datasets.length; di++) {
          const ds = datasets[di]
          const vPlot = stacked && cumByDsHover ? cumByDsHover[di] : Number(ds.data?.[start + idxInWindow])
          if (!Number.isFinite(vPlot)) continue
          const cyVal = yToPx(vPlot)
          ctx.fillStyle = ds.color || "#3b82f6"
          ctx.beginPath()
          ctx.arc(cxIdxX, cyVal, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (type === "bar") {
        // highlight hovered bar (dataset-aware if possible)
        const slotX = padding.left + idxInWindow * slotW
        const groupW = Math.max(2, slotW * 0.8)
        const barW = Math.max(1, groupW / Math.max(1, datasetsCount))
        const groupOffset = (slotW - groupW) / 2
        let di = hoveredDatasetIndex ?? null
        if (di == null) {
          // infer from crosshair x
          const relX = cx - (slotX + groupOffset)
          di = clamp(Math.floor(relX / barW), 0, datasetsCount - 1)
        }
        const ds = datasets[di]
        const v = Number(ds?.data?.[start + idxInWindow])
        if (Number.isFinite(v)) {
          const yZero = yToPx(0)
          const yVal = yToPx(v)
          const yTop = Math.min(yVal, yZero)
          const h = Math.max(1, Math.abs(yZero - yVal))
          const x = slotX + groupOffset + di * barW
          ctx.save()
          ctx.globalAlpha = 0.2
          ctx.fillStyle = ds?.color || "#3b82f6"
          ctx.fillRect(x, yTop, barW, h)
          ctx.restore()
        }
      }
    }
  }, [labels, datasets, datasetsCount, visibleRange, visibleYExtents, type, crosshair, sizeTick, stacked])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setCrosshair({ x, y })

    if (!labels.length) return
    const width = rect.width
    const padding = { left: 60, right: 60, top: 12, bottom: 40 }
    const chartWidth = Math.max(10, width - padding.left - padding.right)

    if (isDragging) {
      const countsPerPixel = visibleRange.count / chartWidth
      const deltaX = e.clientX - dragStart.x
      setViewOffset((prev) => {
        const len = labels.length
        const count = Math.max(1, Math.min(len, Math.round(itemsPerScreen)))
        const maxStart = Math.max(0, len - count)
        const next = prev - deltaX * countsPerPixel
        return clamp(next, 0, maxStart)
      })
      setDragStart({ x: e.clientX, y: e.clientY })
    }

    // update hovered index and dataset for value readouts
    const relX = clamp((x - padding.left) / chartWidth, 0, 1)
    const idxInWindow = Math.max(0, Math.min(visibleRange.count - 1, Math.round(relX * (visibleRange.count - 1))))
    setHoveredIndex(visibleRange.start + idxInWindow)

    if (type === "bar") {
      const slotW = chartWidth / Math.max(1, visibleRange.count)
      const groupW = Math.max(2, slotW * 0.8)
      const barW = Math.max(1, groupW / Math.max(1, datasetsCount))
      const groupOffset = (slotW - groupW) / 2
      const slotX = padding.left + idxInWindow * slotW
      const insideGroupX = x - (slotX + groupOffset)
      const di = clamp(Math.floor(insideGroupX / barW), 0, Math.max(0, datasetsCount - 1))
      setHoveredDatasetIndex(Number.isFinite(di) ? di : null)
    } else {
      setHoveredDatasetIndex(null)
    }
  }

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsDragging(false)
  }

  const handleMouseLeave = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsDragging(false)
    setCrosshair(null)
    setHoveredIndex(null)
    setHoveredDatasetIndex(null)
  }

  const performZoom = useCallback(
    (clientX: number, deltaY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || labels.length === 0) return

      const padding = { left: 60, right: 60 }
      const chartWidth = Math.max(10, rect.width - padding.left - padding.right)
      const x = clientX - rect.left
      const rel = clamp((x - padding.left) / chartWidth, 0, 1)

      const oldCount = clamp(Math.round(itemsPerScreen), 1, labels.length)
      const start = clamp(Math.round(viewOffset), 0, Math.max(0, labels.length - oldCount))
      const anchorIndex = start + rel * oldCount

      const zoomIn = deltaY < 0
      const factor = zoomIn ? 0.9 : 1 / 0.9
      const minCount = Math.min(5, labels.length)
      const maxCount = labels.length
      const newCount = clamp(Math.round(oldCount * factor), minCount, maxCount)
      const newStart = clamp(Math.round(anchorIndex - rel * newCount), 0, Math.max(0, labels.length - newCount))

      setItemsPerScreen(newCount)
      setViewOffset(newStart)
    },
    [labels.length, itemsPerScreen, viewOffset]
  )

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    performZoom(e.clientX, e.deltaY)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      performZoom(ev.clientX, ev.deltaY)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel as EventListener)
    }
  }, [performZoom])

  // legend rendering
  const legend = (
    <div className="flex justify-center gap-4 mt-3">
      {datasets.map((ds, i) => (
        <div key={`${ds.label}-${i}`} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: ds.color || "#3b82f6" }} />
          <span className="text-xs text-gray-600">{ds.label}</span>
          {hoveredIndex != null && Number.isFinite(datasets[i]?.data?.[hoveredIndex] as any) ? (
            <span className="text-xs text-gray-500">{Number(datasets[i].data[hoveredIndex!]).toFixed(2)}</span>
          ) : null}
        </div>
      ))}
    </div>
  )

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Removed internal title to avoid duplication with Card header */}
      <div
        ref={containerRef}
        className="relative flex-1 cursor-crosshair select-none overscroll-contain touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDragStart={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
      {datasets.length ? legend : null}
    </div>
  )
}
