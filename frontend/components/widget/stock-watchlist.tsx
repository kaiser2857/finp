"use client"

import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"

interface StockData {
  symbol: string
  name: string
  logo: string
  last: number
  dayChange: number
  dayChangePercent: number
  weekChange: number
  monthChange: number
  yearChange: number
  peRatio: number
  marketCap: string
  dayVolume: string
}

export default function StockWatchlist() {
  const [stocks, setStocks] = useState<StockData[]>([
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      logo: "🍎",
      last: 226.01,
      dayChange: -4.55,
      dayChangePercent: -1.97,
      weekChange: -3.41,
      monthChange: 7.02,
      yearChange: -7.32,
      peRatio: 31.13,
      marketCap: "3.35 T USD",
      dayVolume: "42.15 M",
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      logo: "🪟",
      last: 505.72,
      dayChange: -4.03,
      dayChangePercent: -0.79,
      weekChange: -3.26,
      monthChange: -0.85,
      yearChange: 20.82,
      peRatio: 37.05,
      marketCap: "3.76 T USD",
      dayVolume: "27.57 M",
    },
    {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      logo: "🟢",
      last: 175.4,
      dayChange: -0.25,
      dayChangePercent: -0.14,
      weekChange: -3.56,
      monthChange: 1.73,
      yearChange: 26.82,
      peRatio: 56.76,
      marketCap: "4.28 T USD",
      dayVolume: "213.10 M",
    },
  ])

  // 模拟实时数据更新
  useEffect(() => {
    const interval = setInterval(() => {
      setStocks((prev) =>
        prev.map((stock) => ({
          ...stock,
          last: stock.last + (Math.random() - 0.5) * 2,
          dayChange: stock.dayChange + (Math.random() - 0.5) * 0.5,
          dayChangePercent: stock.dayChangePercent + (Math.random() - 0.5) * 0.1,
        })),
      )
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  const formatChange = (value: number, isPercent = false) => {
    const formatted = isPercent ? `${value.toFixed(2)}%` : value.toFixed(2)
    return value >= 0 ? `+${formatted}` : formatted
  }

  const getChangeColor = (value: number) => {
    return value >= 0 ? "text-green-600" : "text-red-600"
  }

  const getChangeBgColor = (value: number) => {
    return value >= 0 ? "bg-green-50" : "bg-red-50"
  }

  return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left p-3 font-medium text-gray-700">名称</th>
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
            {stocks.map((stock, index) => (
              <tr key={stock.symbol} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{stock.logo}</span>
                    <div>
                      <div className="font-semibold text-gray-900">{stock.symbol}</div>
                      <div className="text-xs text-gray-500">{stock.name}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right p-3 font-medium">{stock.last.toFixed(2)}</td>
                <td className="text-right p-3">
                  <div
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded ${getChangeBgColor(stock.dayChangePercent)}`}
                  >
                    {stock.dayChangePercent >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    <span className={`font-medium ${getChangeColor(stock.dayChangePercent)}`}>
                      {formatChange(stock.dayChangePercent, true)}
                    </span>
                  </div>
                </td>
                <td className={`text-right p-3 font-medium ${getChangeColor(stock.weekChange)}`}>
                  {formatChange(stock.weekChange, true)}
                </td>
                <td className={`text-right p-3 font-medium ${getChangeColor(stock.monthChange)}`}>
                  {formatChange(stock.monthChange, true)}
                </td>
                <td className={`text-right p-3 font-medium ${getChangeColor(stock.yearChange)}`}>
                  {formatChange(stock.yearChange, true)}
                </td>
                <td className="text-right p-3">{stock.peRatio}</td>
                <td className="text-right p-3 text-gray-600">{stock.marketCap}</td>
                <td className="text-right p-3 text-gray-600">{stock.dayVolume}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  )
}
