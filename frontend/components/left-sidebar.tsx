"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileText, Database, Plus, Loader2, Search, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { Dashboard } from "@/lib/api"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

interface LeftSidebarProps {
  selectedDashboard: string
  onDashboardSelect: (dashboardId: string) => void
  onCreateDashboard: () => void
  dashboards: Dashboard[]
  loading: boolean
  onDeleteDashboard: (dashboardId: string) => Promise<boolean> | boolean
}

export default function LeftSidebar({ 
  selectedDashboard, 
  onDashboardSelect, 
  onCreateDashboard,
  dashboards,
  loading,
  onDeleteDashboard,
}: LeftSidebarProps) {
  const [dashboardsCollapsed, setDashboardsCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const pathname = usePathname()
  const isOnDatasources = pathname.startsWith("/datasources")
  const isOnConnections = pathname.startsWith("/connections")
  const isOnDashboardRoute = pathname === "/"

  useEffect(() => {
    if (searchOpen) {
      // focus when opening
      const t = setTimeout(() => searchInputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [searchOpen])

  const normalize = (s: string) => (s || "").toLowerCase().trim()
  const fuzzyIncludes = (text: string, query: string) => {
    const a = normalize(text)
    const b = normalize(query)
    if (!b) return true
    // substring match
    if (a.includes(b)) return true
    // simple ordered-subsequence fuzzy
    let i = 0
    for (const ch of a) {
      if (ch === b[i]) i++
      if (i >= b.length) return true
    }
    return false
  }

  const filtered = (searchQuery ? dashboards.filter(d => fuzzyIncludes(d.name || "", searchQuery)) : dashboards)

  return (
    <div className="flex flex-col h-full">
      {/* 顶部占位：logo + title */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/placeholder-logo.svg" alt="logo" className="w-6 h-6 rounded" />
          <div className="text-sm font-semibold text-gray-800">FOMC Viewer</div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* 组件库标题（恢复），仅保留数据入口 */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">数据库</h3>
            <div className="space-y-1">
              <Link href="/datasources" className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded ${isOnDatasources ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"}`} aria-current={isOnDatasources ? "page" : undefined}>
                <FileText className="w-4 h-4" />
                <span>数据源</span>
              </Link>
              <Link href="/connections" className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded ${isOnConnections ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"}`} aria-current={isOnConnections ? "page" : undefined}>
                <Database className="w-4 h-4" />
                <span>数据库连接</span>
              </Link>
            </div>
          </div>

          {/* 我的看板（恢复） */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-5 h-5 p-0"
                  onClick={() => setDashboardsCollapsed((v) => !v)}
                  aria-label={dashboardsCollapsed ? "展开智能看板" : "收起智能看板"}
                >
                  {dashboardsCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </Button>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">智能看板</h3>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`w-5 h-5 p-0 ${searchOpen ? "text-blue-600" : ""}`}
                  onClick={() => setSearchOpen((v) => !v)}
                  aria-label="搜索看板"
                  title="搜索看板"
                >
                  <Search className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-4 h-4 p-0"
                  onClick={onCreateDashboard}
                  aria-label="新建看板"
                  title="新建看板"
                >
                  <Plus className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
            </div>

            {/* 搜索输入框（点击放大镜唤出） */}
            {!dashboardsCollapsed && searchOpen && (
              <div className="mb-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setSearchOpen(false) }
                    }}
                    placeholder="按名称搜索看板"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>
            )}

            {!dashboardsCollapsed && (
              <div className="space-y-1">
                {loading ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>加载中...</span>
                  </div>
                ) : (filtered.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-gray-500">{searchQuery ? "未找到匹配看板" : "暂无看板"}</div>
                ) : (
                  filtered.map((dashboard) => {
                    const isActive = isOnDashboardRoute && (dashboard.id === selectedDashboard)
                    return (
                      <div
                        key={dashboard.id}
                        className={`group flex items-center gap-2 px-2 py-1.5 text-sm rounded ${
                          isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <Link
                          href={`/?dashboard=${dashboard.id}`}
                          className="flex items-center gap-2 flex-1 min-w-0"
                          onClick={() => onDashboardSelect(dashboard.id)}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <FileText className="w-4 h-4" />
                          <span className="truncate">{dashboard.name}</span>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="删除看板"
                          onClick={async (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const ok = window.confirm("确定删除该看板？此操作不可撤销。")
                            if (!ok) return
                            try {
                              await onDeleteDashboard(dashboard.id)
                            } catch (err) {
                              // noop: 父级会处理错误展示
                            }
                          }}
                          title="删除看板"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                        </Button>
                      </div>
                    )
                  })
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
