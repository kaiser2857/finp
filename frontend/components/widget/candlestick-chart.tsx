"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"

interface CandlestickData {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface HeaderStats {
  current: number
  changeAbs: number
  changePct: number
}

interface CandlestickChartProps {
  symbol: string
  companyName: string
  data?: CandlestickData[]
  onHeaderStatsChange?: (stats: HeaderStats) => void
}

export default function CandlestickChart({ symbol, companyName, data: initialData, onHeaderStatsChange }: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<CandlestickData[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState("1yr")
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [viewOffset, setViewOffset] = useState(0) // index of first visible candle
  const [candlesPerScreen, setCandlesPerScreen] = useState<number>(120) // how many candles to show
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null)
  const [hoveredData, setHoveredData] = useState<CandlestickData | null>(null)

  // 生成模拟K线数据（仅在未提供data时使用）
  const generateCandlestickData = useCallback((periods: number, basePrice = 200) => {
    const data: CandlestickData[] = []
    let currentPrice = basePrice
    const now = new Date()

    for (let i = periods; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)

      const volatility = 0.02
      const trend = (Math.random() - 0.5) * 0.01
      const dailyChange = (Math.random() - 0.5) * volatility + trend

      const open = currentPrice
      const close = open * (1 + dailyChange)
      const high = Math.max(open, close) * (1 + Math.random() * 0.01)
      const low = Math.min(open, close) * (1 - Math.random() * 0.01)
      const volume = Math.random() * 1_000_000 + 500_000

      data.push({ date, open, high, low, close, volume })
      currentPrice = close
    }

    return data
  }, [])

  // 初始化数据：优先使用外部传入数据
  useEffect(() => {
    if (initialData && Array.isArray(initialData) && initialData.length > 0) {
      setData(initialData)
    } else {
      const basePrice = symbol === "AAPL" ? 226 : symbol === "NVDA" ? 175 : 505
      setData(generateCandlestickData(365, basePrice))
    }
  }, [initialData, symbol, generateCandlestickData])

  // 根据选择范围设置可视窗口
  const periodToCount = useCallback((period: string, maxLen: number) => {
    const map: Record<string, number> = { "5yr": 1825, "3yr": 1095, "1yr": 365, "6mo": 180, "3mo": 90, "1wk": 7 }
    const target = map[period] ?? 365
    return Math.max(1, Math.min(maxLen, target))
  }, [])

  useEffect(() => {
    if (data.length === 0) return
    const target = periodToCount(selectedPeriod, data.length)
    setCandlesPerScreen(target)
    setViewOffset(Math.max(0, data.length - target))
  }, [selectedPeriod, data.length, periodToCount])

  // 计算头部统计数据：当前可视范围内的末值与涨跌幅
  const headerStats = useMemo<HeaderStats>(() => {
    if (!data.length) return { current: 0, changeAbs: 0, changePct: 0 }
    const startIdx = Math.max(0, Math.min(data.length - 1, Math.round(viewOffset)))
    const count = Math.max(1, Math.min(data.length - startIdx, Math.round(candlesPerScreen)))
    const slice = data.slice(startIdx, startIdx + count)
    const first = slice[0]
    const last = slice[slice.length - 1]
    const current = last?.close ?? 0
    const base = first?.close ?? current ?? 1
    const changeAbs = current - base
    const changePct = base ? (changeAbs / base) * 100 : 0
    return { current, changeAbs, changePct }
  }, [data, viewOffset, candlesPerScreen])

  // 通知父级更新头部统计数据（避免因回调引用变化导致的无限循环）
  const headerCbRef = useRef<typeof onHeaderStatsChange>(onHeaderStatsChange)
  useEffect(() => { headerCbRef.current = onHeaderStatsChange }, [onHeaderStatsChange])
  const prevHeaderStatsRef = useRef<HeaderStats | null>(null)
  useEffect(() => {
    const prev = prevHeaderStatsRef.current
    const changed = !prev || prev.current !== headerStats.current || prev.changeAbs !== headerStats.changeAbs || prev.changePct !== headerStats.changePct
    if (changed) {
      prevHeaderStatsRef.current = headerStats
      headerCbRef.current?.(headerStats)
    }
  }, [headerStats])

  // 移除独立的 currentPrice/prevPrice 计算，改用基于可视窗口的 headerStats
  // const currentPrice = useMemo(() => (data.length > 0 ? data[data.length - 1].close : 0), [data])
  // const prevPrice = useMemo(() => (data.length > 1 ? data[data.length - 2].close : currentPrice), [data, currentPrice])
  // const priceChange = currentPrice - prevPrice
  // const priceChangePct = prevPrice ? (priceChange / prevPrice) * 100 : 0

  // 绘制K线图
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // 设置canvas尺寸
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    const width = rect.width
    const height = rect.height
    const padding = { top: 20, right: 60, bottom: 80, left: 60 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom - 100 // 为成交量留空间

    // 清空画布
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    // 计算可见数据范围（基于candlesPerScreen与viewOffset）
    const visibleDataCount = Math.max(1, Math.min(data.length, Math.round(candlesPerScreen)))
    const startIndex = Math.max(0, Math.min(data.length - visibleDataCount, Math.round(viewOffset)))
    const endIndex = Math.min(data.length, startIndex + visibleDataCount)
    const visibleData = data.slice(startIndex, endIndex)

    if (visibleData.length === 0) return

    // 计算价格范围
    const prices = visibleData.flatMap((d) => [d.high, d.low])
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice
    const pricePadding = priceRange * 0.1

    // 计算成交量范围（读取真实volume）
    const volumes = visibleData.map((d) => d.volume || 0)
    const maxVolume = Math.max(1, ...volumes)

    // 绘制网格线
    ctx.strokeStyle = "#f0f0f0"
    ctx.lineWidth = 1

    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight * i) / 5
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(padding.left + chartWidth, y)
      ctx.stroke()
    }

    const timeStep = Math.max(1, Math.floor(visibleData.length / 8))
    for (let i = 0; i < visibleData.length; i += timeStep) {
      const x = padding.left + (i * chartWidth) / visibleData.length
      ctx.beginPath()
      ctx.moveTo(x, padding.top)
      ctx.lineTo(x, padding.top + chartHeight)
      ctx.stroke()
    }

    // 绘制K线
    const candleWidth = Math.max(2, (chartWidth / visibleData.length) * 0.8)

    visibleData.forEach((candle, index) => {
      const x = padding.left + (index * chartWidth) / visibleData.length + chartWidth / visibleData.length / 2
      const openY = padding.top + chartHeight - ((candle.open - minPrice + pricePadding) / (priceRange + 2 * pricePadding)) * chartHeight
      const closeY = padding.top + chartHeight - ((candle.close - minPrice + pricePadding) / (priceRange + 2 * pricePadding)) * chartHeight
      const highY = padding.top + chartHeight - ((candle.high - minPrice + pricePadding) / (priceRange + 2 * pricePadding)) * chartHeight
      const lowY = padding.top + chartHeight - ((candle.low - minPrice + pricePadding) / (priceRange + 2 * pricePadding)) * chartHeight

      const isGreen = candle.close > candle.open
      const color = isGreen ? "#10b981" : "#ef4444"

      // 影线
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, highY)
      ctx.lineTo(x, lowY)
      ctx.stroke()

      // 实体
      ctx.fillStyle = color
      const bodyTop = Math.min(openY, closeY)
      const bodyHeight = Math.max(1, Math.abs(closeY - openY))
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight)
    })

    // 绘制成交量柱状图（读取真实volume）
    const volumeHeight = 80
    const volumeTop = height - padding.bottom - volumeHeight + 20

    visibleData.forEach((candle, index) => {
      const x = padding.left + (index * chartWidth) / visibleData.length + chartWidth / visibleData.length / 2
      const volumeBarHeight = ((candle.volume || 0) / maxVolume) * volumeHeight
      const isGreen = candle.close > candle.open

      ctx.fillStyle = isGreen ? "#10b981" : "#ef4444"
      ctx.globalAlpha = 0.6
      ctx.fillRect(x - candleWidth / 2, volumeTop + volumeHeight - volumeBarHeight, candleWidth, volumeBarHeight)
      ctx.globalAlpha = 1
    })

    // 价格标签
    ctx.fillStyle = "#666666"
    ctx.font = "12px Arial"
    ctx.textAlign = "right"

    for (let i = 0; i <= 5; i++) {
      const price = minPrice - pricePadding + (priceRange + 2 * pricePadding) * (1 - i / 5)
      const y = padding.top + (chartHeight * i) / 5
      ctx.fillText(price.toFixed(2), padding.left - 10, y + 4)
    }

    // 时间标签
    ctx.textAlign = "center"
    for (let i = 0; i < visibleData.length; i += timeStep) {
      const x = padding.left + (i * chartWidth) / visibleData.length + chartWidth / visibleData.length / 2
      const date = visibleData[i].date
      const label = date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
      ctx.fillText(label, x, height - padding.bottom + 20)
    }

    // 十字线和悬停信息（保留）
    if (crosshair && hoveredData) {
      // 计算底部轴线位置（成交量区域的横轴）
      const axisY = volumeTop + volumeHeight

      ctx.strokeStyle = "#999999"
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])

      // 竖线：从价格图顶部到条形图横轴
      ctx.beginPath()
      ctx.moveTo(crosshair.x, padding.top)
      ctx.lineTo(crosshair.x, axisY)
      ctx.stroke()

      // 横线：贯穿绘图区（保持原样）
      ctx.beginPath()
      ctx.moveTo(padding.left, crosshair.y)
      ctx.lineTo(padding.left + chartWidth, crosshair.y)
      ctx.stroke()

      ctx.setLineDash([])

      // 左上角信息
      const info = `O: ${hoveredData.open.toFixed(2)} H: ${hoveredData.high.toFixed(2)} L: ${hoveredData.low.toFixed(2)} C: ${hoveredData.close.toFixed(2)} Volume: ${hoveredData.volume.toLocaleString()}`
      ctx.fillStyle = "#000000"
      ctx.font = "12px Arial"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(info, padding.left + 10, padding.top -5)

      // 右侧数值小方块：价格或成交量
      const isInVolume = crosshair.y >= volumeTop && crosshair.y <= volumeTop + volumeHeight
      const padX2 = 6
      const padY2 = 4
      const yRel = Math.max(0, Math.min(1, (crosshair.y - padding.top) / chartHeight))
      const priceAtY = (minPrice - pricePadding) + (priceRange + 2 * pricePadding) * (1 - yRel)
      const yText = isInVolume ? `${Math.max(0, hoveredData.volume || 0).toLocaleString()}` : priceAtY.toFixed(2)
      const yTextWidth = ctx.measureText(yText).width
      const yBoxW = Math.ceil(yTextWidth + padX2 * 2)
      const yBoxH = 18
      let yBoxX = padding.left + chartWidth + 4
      if (yBoxX + yBoxW > width - 4) yBoxX = width - 4 - yBoxW
      // 在价格区或成交量区内夹紧显示位置
      let yBoxY = crosshair.y - yBoxH / 2
      const minY = padding.top
      const maxY = axisY - yBoxH
      yBoxY = Math.max(minY, Math.min(maxY, yBoxY))

      ctx.fillStyle = "#111827"
      ctx.fillRect(yBoxX, yBoxY, yBoxW, yBoxH)
      ctx.strokeStyle = "#9CA3AF"
      ctx.strokeRect(yBoxX + 0.5, yBoxY + 0.5, yBoxW - 1, yBoxH - 1)
      ctx.fillStyle = "#ffffff"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(yText, yBoxX + padX2, yBoxY + yBoxH / 2)

      // 底部时间小方块：位于条形图横轴之下
      const idxFromX = Math.max(0, Math.min(visibleData.length - 1, Math.round(((crosshair.x - padding.left) / chartWidth) * (visibleData.length - 1))))
      const dateLabel = visibleData[idxFromX]?.date?.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) || ""
      const xTextWidth = ctx.measureText(dateLabel).width
      const xBoxW = Math.ceil(xTextWidth + padX2 * 2)
      const xBoxH = 18
      let xBoxX = crosshair.x - xBoxW / 2
      xBoxX = Math.max(padding.left, Math.min(padding.left + chartWidth - xBoxW, xBoxX))
      const xBoxY = axisY + 4

      ctx.fillStyle = "#111827"
      ctx.fillRect(xBoxX, xBoxY, xBoxW, xBoxH)
      ctx.strokeStyle = "#9CA3AF"
      ctx.strokeRect(xBoxX + 0.5, xBoxY + 0.5, xBoxW - 1, xBoxH - 1)
      ctx.fillStyle = "#ffffff"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(dateLabel, xBoxX + padX2, xBoxY + xBoxH / 2)
    }
  }, [data, viewOffset, candlesPerScreen, crosshair, hoveredData])

  // 重绘图表
  useEffect(() => {
    drawChart()
  }, [drawChart])

  // 鼠标事件处理（拖拽平移）
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
    if (!rect || rect.width <= 0 || rect.height <= 0) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // 避免重复设置相同坐标造成不必要渲染
    setCrosshair((prev) => (prev && prev.x === x && prev.y === y) ? prev : { x, y })

    // 可视窗口信息
    const chartWidth = rect.width - 120
    const visibleDataCount = Math.max(1, Math.min(data.length, Math.round(candlesPerScreen)))
    const startIndex = Math.max(0, Math.min(data.length - visibleDataCount, Math.round(viewOffset)))

    const dataIndex = Math.floor(((x - 60) / chartWidth) * visibleDataCount)
    if (dataIndex >= 0 && dataIndex < visibleDataCount) {
      const d = data[startIndex + dataIndex]
      setHoveredData((prev) => (prev === d ? prev : d))
    } else {
      if (hoveredData !== null) setHoveredData(null)
    }

    if (isDragging) {
      const deltaX = e.clientX - dragStart.x
      const countsPerPixel = visibleDataCount / chartWidth
      setViewOffset((prev) => {
        const next = prev - deltaX * countsPerPixel
        return Math.max(0, Math.min(data.length - visibleDataCount, next))
      })
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setIsDragging(false)
  }

  const handleMouseLeave = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setCrosshair(null)
    setHoveredData(null)
    setIsDragging(false)
  }

  // 以鼠标位置为锚点执行缩放（共享给原生/React 事件）
  const performZoom = useCallback((clientX: number, deltaY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || data.length === 0) return

    const x = clientX - rect.left
    const chartWidth = rect.width - 120

    const oldCount = Math.max(1, Math.min(data.length, Math.round(candlesPerScreen)))
    const startIndex = Math.max(0, Math.min(data.length - oldCount, Math.round(viewOffset)))
    const xRel = Math.max(0, Math.min(1, (x - 60) / chartWidth))
    const anchorIndex = startIndex + xRel * oldCount

    const zoomIn = deltaY < 0
    const factor = zoomIn ? 0.9 : 1 / 0.9
    const minCount = 10
    const maxCount = data.length
    const newCount = Math.max(minCount, Math.min(maxCount, Math.round(oldCount * factor)))

    const newStart = Math.max(0, Math.min(data.length - newCount, Math.round(anchorIndex - xRel * newCount)))

    setCandlesPerScreen(newCount)
    setViewOffset(newStart)
  }, [data.length, candlesPerScreen, viewOffset])

  // 滚轮缩放：以鼠标位置为锚点进行缩放，并阻止容器滚动
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    performZoom(e.clientX, e.deltaY)
  }

  // 使用非被动原生监听，确保 preventDefault 生效，阻止父级滚动/链式滚动
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheelNative = (ev: WheelEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      performZoom(ev.clientX, ev.deltaY)
    }
    el.addEventListener("wheel", onWheelNative, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheelNative as EventListener)
    }
  }, [performZoom])

  return (
    <div className="w-full h-full bg-white flex flex-col">
      {/* 头部信息（内部渲染最新价+涨跌） */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {(() => {
            const raw = String(symbol || "").toUpperCase()
            const m = raw.match(/\b(NVDA|AAPL)\b/)
            const sym = m ? m[1] : ""
            return sym ? (
              <div className="text-lg text-gray-500">{`${sym}.1D.NASDAQ`}</div>
            ) : <div className="text-lg text-gray-500" />
            })()}
          </div>
          <div className="flex gap-1" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold">{headerStats.current.toFixed(2)}</span>
          <span
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${
              headerStats.changeAbs >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {headerStats.changeAbs >= 0 ? "+" : ""}
            {headerStats.changeAbs.toFixed(2)} ({headerStats.changePct >= 0 ? "+" : ""}
            {headerStats.changePct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* 图表区域 */}
      <div
        ref={containerRef}
        className="flex-1 relative cursor-crosshair select-none overscroll-contain touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {/* 底部控制 */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {["5yr", "3yr", "1yr", "6mo", "3mo", "1wk"].map((period) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? "default" : "ghost"}
                size="sm"
                className="text-xs"
                onClick={() => setSelectedPeriod(period)}
              >
                {period}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
