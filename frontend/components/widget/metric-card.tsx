"use client"

import React from "react"
import { ArrowDown, ArrowUp } from "lucide-react"

export interface MetricCardProps {
  title?: string
  value: string | number
  change?: number
  subtitle?: string
}

export default function MetricCard({ title = "Metric", value, change = 0, subtitle }: MetricCardProps) {
  const up = (Number(change) || 0) > 0
  const down = (Number(change) || 0) < 0
  return (
    <div className="w-full h-full bg-white rounded-md border shadow-sm p-4 flex flex-col justify-center">
      <div className="text-sm font-medium text-gray-600 mb-1">{title}</div>
      <div className="text-3xl font-bold text-gray-900 mb-2">{String(value)}</div>
      <div className="flex items-center gap-2 text-sm">
        <span className={`inline-flex items-center gap-1 font-medium ${up ? "text-green-600" : down ? "text-red-600" : "text-gray-600"}`}>
          {up ? <ArrowUp className="w-4 h-4" /> : down ? <ArrowDown className="w-4 h-4" /> : null}
          {typeof change === "number" ? `${Math.abs(change).toFixed(1)}%` : String(change ?? "-")}
        </span>
        {subtitle ? <span className="text-gray-500">{subtitle}</span> : null}
      </div>
    </div>
  )
}
