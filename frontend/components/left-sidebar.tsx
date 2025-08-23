"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileText, Database, Plus, Loader2, Search } from "lucide-react"
import { Dashboard } from "@/lib/api"
import Link from "next/link"

interface LeftSidebarProps {
  selectedDashboard: string
  onDashboardSelect: (dashboardId: string) => void
  onCreateDashboard: () => void
  dashboards: Dashboard[]
  loading: boolean
}

export default function LeftSidebar({ 
  selectedDashboard, 
  onDashboardSelect, 
  onCreateDashboard,
  dashboards,
  loading
}: LeftSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input placeholder="搜索 (Ctrl+K)" className="pl-10 text-sm" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* 组件库标题（恢复），仅保留数据入口 */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">数据库</h3>
            <div className="space-y-1">
              <Link href="/datasources" className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded">
                <FileText className="w-4 h-4" />
                <span>数据源</span>
              </Link>
              <Link href="/connections" className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded">
                <Database className="w-4 h-4" />
                <span>数据库连接</span>
              </Link>
            </div>
          </div>

          {/* 我的看板（恢复） */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">智能看板</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-4 h-4 p-0"
                onClick={onCreateDashboard}
                aria-label="新建看板"
              >
                <Plus className="w-4 h-4 text-gray-400" />
              </Button>
            </div>
            <div className="space-y-1">
              {loading ? (
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>加载中...</span>
                </div>
              ) : dashboards.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-gray-500">暂无看板</div>
              ) : (
                dashboards.map((dashboard) => {
                  const isActive = dashboard.id === selectedDashboard
                  return (
                    <Link
                      href={`/?dashboard=${dashboard.id}`}
                      key={dashboard.id}
                      className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer ${
                        isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                      }`}
                      onClick={() => onDashboardSelect(dashboard.id)}
                    >
                      <FileText className="w-4 h-4" />
                      <span>{dashboard.name}</span>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
