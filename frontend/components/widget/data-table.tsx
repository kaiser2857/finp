"use client"

import React from "react"

export interface DataTableProps {
  title?: string
  headers: string[]
  rows: (string | number | React.ReactNode)[][]
  maxHeight?: number | string
}

export default function DataTable({ title, headers, rows, maxHeight = 320 }: DataTableProps) {
  return (
    <div className="w-full h-full bg-white rounded-md border shadow-sm p-4 flex flex-col">
      {title ? <h3 className="text-sm font-semibold mb-3">{title}</h3> : null}
      <div className="flex-1 overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="border-b">
              {headers.map((h) => (
                <th key={h} className="text-left p-2 font-medium text-gray-700">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                {r.map((c, j) => (
                  <td key={j} className="p-2 text-gray-700">{typeof c === 'number' ? String(c) : c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
