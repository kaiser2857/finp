"use client"

import React from "react"
import { TrendingUp, TrendingDown } from "lucide-react"

export interface WatchlistItem {
  symbol: string
  name?: string
  logo?: string // emoji or URL (emoji supported directly)
  last: number | null
  dayChange?: number | null
  dayChangePercent?: number | null
  weekChange?: number | null // percent
  monthChange?: number | null // percent
  yearChange?: number | null // percent
  peRatio?: number | null
  marketCap?: number | null
  dayVolume?: number | null
}

export interface WatchlistProps {
  title?: string
  dateLabel?: string
  items: WatchlistItem[]
}

const fmtSigned = (v: number | null | undefined, suffix = "") => {
  if (v == null || !Number.isFinite(v)) return "-"
  const s = v.toFixed(2)
  return `${v >= 0 ? "+" : ""}${s}${suffix}`
}

const fmtNumber = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "-"
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const fmtCompact = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "-"
  const abs = Math.abs(v)
  const sign = v < 0 ? -1 : 1
  if (abs >= 1e12) return `${(sign * abs / 1e12).toFixed(2)} T`
  if (abs >= 1e9) return `${(sign * abs / 1e9).toFixed(2)} B`
  if (abs >= 1e6) return `${(sign * abs / 1e6).toFixed(2)} M`
  if (abs >= 1e3) return `${(sign * abs / 1e3).toFixed(2)} K`
  return (sign * abs).toFixed(2)
}

const changeColor = (v: number | null | undefined) => (v ?? 0) >= 0 ? "text-green-600" : "text-red-600"
const changeBg = (v: number | null | undefined) => (v ?? 0) >= 0 ? "bg-green-50" : "bg-red-50"

export default function Watchlist({ title, dateLabel, items }: WatchlistProps) {
  const rows = items || []
  return (
    <div className="p-4 h-full flex flex-col">
      <div className="text-[11px] text-gray-500 mb-2">{dateLabel ? `最新：${dateLabel}` : ""}</div>
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="text-left p-3 font-medium text-gray-700">代码</th>
              <th className="text-right p-3 font-medium text-gray-700">最新价</th>
              <th className="text-right p-3 font-medium text-gray-700">涨跌幅</th>
              <th className="text-right p-3 font-medium text-gray-700">周涨跌幅</th>
              <th className="text-right p-3 font-medium text-gray-700">月涨跌幅</th>
              <th className="text-right p-3 font-medium text-gray-700">年涨跌幅</th>
              <th className="text-right p-3 font-medium text-gray-700">市盈率</th>
              <th className="text-right p-3 font-medium text-gray-700">总市值</th>
              <th className="text-right p-3 font-medium text-gray-700">成交量</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-gray-500">暂无数据</td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const up = (r.dayChangePercent ?? 0) >= 0
                const initials = (r.symbol || "").slice(0, 2).toUpperCase()
                return (
                  <tr key={`${r.symbol}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {r.logo ? (
                          <span className="text-lg" title={r.symbol}>{r.logo}</span>
                        ) : (
                          <div className="w-6 h-6 rounded bg-gray-200 text-gray-700 flex items-center justify-center text-xs" title={r.symbol}>
                            <span>{initials}</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <div className="font-semibold text-gray-900">{r.symbol}</div>
                          <div className="text-xs text-gray-500">{r.name || ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right p-3 font-medium tabular-nums">{fmtNumber(r.last)}</td>
                    <td className="text-right p-3">
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded ${changeBg(r.dayChangePercent)}`} title={r.dayChange != null ? fmtSigned(r.dayChange) : undefined}>
                        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        <span className={`font-medium ${changeColor(r.dayChangePercent)}`}>{fmtSigned(r.dayChangePercent, "%")}</span>
                      </div>
                    </td>
                    <td className={`text-right p-3 font-medium tabular-nums ${changeColor(r.weekChange)}`}>{fmtSigned(r.weekChange, "%")}</td>
                    <td className={`text-right p-3 font-medium tabular-nums ${changeColor(r.monthChange)}`}>{fmtSigned(r.monthChange, "%")}</td>
                    <td className={`text-right p-3 font-medium tabular-nums ${changeColor(r.yearChange)}`}>{fmtSigned(r.yearChange, "%")}</td>
                    <td className="text-right p-3 tabular-nums">{r.peRatio == null ? "-" : Number(r.peRatio).toFixed(2)}</td>
                    <td className="text-right p-3 text-gray-600 tabular-nums">{fmtCompact(r.marketCap)}</td>
                    <td className="text-right p-3 text-gray-600 tabular-nums">{fmtCompact(r.dayVolume)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
