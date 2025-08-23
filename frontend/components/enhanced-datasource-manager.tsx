"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, RefreshCw, Trash2, Edit } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { api, EnhancedDatasource, DatabaseConnection } from "@/lib/api"
import { DatasourceWizard } from "@/components/datasource-wizard"
import { Input } from "@/components/ui/input"

export default function EnhancedDatasourceManager() {
  const { toast } = useToast()
  const [datasources, setDatasources] = useState<EnhancedDatasource[]>([])
  const [connections, setConnections] = useState<DatabaseConnection[]>([])
  const [loading, setLoading] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingDs, setEditingDs] = useState<EnhancedDatasource | null>(null)
  const [detailDs, setDetailDs] = useState<EnhancedDatasource | null>(null)
  const [preview, setPreview] = useState<any | null>(null)
  const [previewLimit, setPreviewLimit] = useState<number>(50)
  const [previewOffset, setPreviewOffset] = useState<number>(0)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [ds, conns] = await Promise.all([
        api.getEnhancedDatasources(),
        api.getDatabaseConnections(),
      ])
      setDatasources(ds)
      setConnections(conns)
    } catch (e) {
      toast({ title: "错误", description: "加载数据源或连接失败", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const showDetail = async (id: string) => {
    try {
      const ds = await api.getEnhancedDatasourceDetail(id)
      setDetailDs(ds)
      setPreviewOffset(0)
      try {
        const p = await api.previewDatasourceData(id, previewLimit, 0)
        setPreview(p)
      } catch {
        setPreview(null)
      }
    } catch {
      toast({ title: "错误", description: "加载数据源详情失败", variant: "destructive" })
    }
  }

  const reloadPreview = async () => {
    if (!detailDs) return
    try {
      const p = await api.previewDatasourceData(detailDs.id, previewLimit, previewOffset)
      setPreview(p)
    } catch {
      setPreview(null)
      toast({ title: "预览错误", description: "加载预览失败", variant: "destructive" })
    }
  }

  const handleCreate = async (payload: Partial<EnhancedDatasource>) => {
    try {
      const createBody: any = {
        name: payload.name || "新数据源",
        type: (payload.type as any) || "table",
        configuration: payload.configuration || {},
        cache_timeout: (payload as any).cache_timeout ?? 300,
        is_active: (payload as any).is_active ?? true,
      }
      if (payload.database_connection_id) createBody.database_connection_id = payload.database_connection_id
      if (payload.table_name) createBody.table_name = payload.table_name
      if (payload.sql) createBody.sql = payload.sql
      if (payload.description) createBody.description = payload.description

      const created = await api.createEnhancedDatasource(createBody)
      toast({ title: "成功", description: `数据源 ${created.name} 已创建` })
      setWizardOpen(false)
      loadAll()
    } catch (e) {
      toast({ title: "错误", description: "创建数据源失败", variant: "destructive" })
    }
  }

  const handleDelete = async (ds: EnhancedDatasource) => {
    if (!confirm(`确定删除数据源 "${ds.name}"？`)) return
    try {
      await api.deleteEnhancedDatasource(ds.id)
      setDatasources(prev => prev.filter(d => d.id !== ds.id))
      // If the deleted datasource is currently shown in detail, clear it and its preview state
      setDetailDs(prev => {
        if (prev && prev.id === ds.id) {
          setPreview(null)
          setPreviewOffset(0)
          return null
        }
        return prev
      })
      toast({ title: "已删除", description: `${ds.name} 已移除` })
    } catch (e) {
      toast({ title: "错误", description: "删除数据源失败", variant: "destructive" })
    }
  }

  const openEdit = async (ds: EnhancedDatasource) => {
    try {
      const full = await api.getEnhancedDatasourceDetail(ds.id)
      setEditingDs(full)
      setEditOpen(true)
    } catch {
      setEditingDs(ds)
      setEditOpen(true)
    }
  }

  const handleUpdate = async (id: string, payload: any) => {
    try {
      const updated = await api.updateEnhancedDatasource(id, payload)
      // update list
      setDatasources(prev => prev.map(d => (d.id === id ? { ...d, ...updated } : d)))
      // update detail if open
      setDetailDs(prev => (prev && prev.id === id ? { ...prev, ...updated } as any : prev))
      toast({ title: '已保存', description: `数据源 ${updated.name} 已更新` })
      // refresh preview if query/table changed
      if (detailDs && detailDs.id === id) {
        try { await reloadPreview() } catch {}
      }
    } catch (e) {
      toast({ title: '错误', description: '更新数据源失败', variant: 'destructive' })
      throw e
    }
  }

  const handlePrevPage = async () => {
    if (!detailDs) return
    const nextOffset = Math.max(0, previewOffset - previewLimit)
    setPreviewOffset(nextOffset)
    try {
      const p = await api.previewDatasourceData(detailDs.id, previewLimit, nextOffset)
      setPreview(p)
    } catch {
      // keep previous preview if fetch fails
    }
  }

  const handleNextPage = async () => {
    if (!detailDs) return
    const nextOffset = previewOffset + previewLimit
    setPreviewOffset(nextOffset)
    try {
      const p = await api.previewDatasourceData(detailDs.id, previewLimit, nextOffset)
      setPreview(p)
    } catch {
      // keep previous preview if fetch fails
    }
  }

  const connName = (id?: string) => connections.find(c => c.id === id)?.name || id || '-'

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">数据源</h2>
          <p className="text-sm text-muted-foreground">管理驱动图表的数据表与查询</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAll} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新建数据源
          </Button>
        </div>
      </div>

      <Card className="flex-none">
        <CardHeader>
          <CardTitle className="text-base">全部数据源</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>连接</TableHead>
                <TableHead>详情</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasources.map(ds => {
                const conn = connections.find(c => c.id === (ds as any).database_connection_id)
                const effectiveActive = ds.is_active && !!conn?.is_active
                return (
                  <TableRow key={ds.id} className="cursor-pointer" onClick={() => showDetail(ds.id)}>
                    <TableCell className="font-medium">{ds.name}</TableCell>
                    <TableCell>{ds.type}</TableCell>
                    <TableCell>
                      <Badge variant={effectiveActive ? "default" : "secondary"}>{effectiveActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>{connName((ds as any).database_connection_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ds.type === "table" ? ds.table_name : ds.type === "query" ? (ds.sql?.slice(0, 40) + (ds.sql && ds.sql.length > 40 ? "…" : "")) : ""}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="icon" className="mr-1" onClick={() => openEdit(ds)} title="编辑">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(ds)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Drawer/Dialog */}
      {detailDs && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">数据源详情：{detailDs.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pr-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span>类型：{detailDs.type}</span>
                {(() => {
                  const conn = connections.find(c => c.id === (detailDs as any).database_connection_id)
                  const effectiveActive = detailDs.is_active && !!conn?.is_active
                  return <Badge variant={effectiveActive ? "default" : "secondary"}>{effectiveActive ? "Active" : "Inactive"}</Badge>
                })()}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setDetailDs(null)}>关闭</Button>
              </div>
            </div>
            <div className="text-sm">数据库连接：{connName((detailDs as any).database_connection_id)}</div>
            {detailDs.type === 'table' ? (
              <div className="text-sm">数据表：{detailDs.table_name}</div>
            ) : detailDs.type === 'query' ? (
              <div className="text-xs whitespace-pre-wrap bg-muted/40 p-2 rounded">查询SQL：{detailDs.sql}</div>
            ) : null}

            {/* Columns Schema */}
            <div className="space-y-2">
              <div className="text-sm font-medium">字段（{detailDs.columns?.length || 0}）</div>
              {detailDs.columns && detailDs.columns.length > 0 ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">名称</TableHead>
                        <TableHead className="whitespace-nowrap">类型</TableHead>
                        <TableHead className="whitespace-nowrap">角色</TableHead>
                        <TableHead className="whitespace-nowrap">描述</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailDs.columns.map((col) => (
                        <TableRow key={col.id}>
                          <TableCell className="text-xs font-medium">{col.name}</TableCell>
                          <TableCell className="text-xs">{col.type}</TableCell>
                          <TableCell className="text-xs">{col.role}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{col.description || ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                // Fallback: infer columns from preview data keys
                (() => {
                  const rows = Array.isArray(preview?.data) ? preview.data : []
                  const headers = rows && rows.length > 0 && typeof rows[0] === 'object' ? Object.keys(rows[0] || {}) : []
                  return headers.length > 0 ? (
                    <div className="rounded-md border overflow-auto">
                      <div className="px-3 py-2 text-[11px] text-muted-foreground">根据预览推断</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap">名称</TableHead>
                            <TableHead className="whitespace-nowrap">类型</TableHead>
                            <TableHead className="whitespace-nowrap">角色</TableHead>
                            <TableHead className="whitespace-nowrap">描述</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {headers.map((h) => (
                            <TableRow key={h}>
                              <TableCell className="text-xs font-medium">{h}</TableCell>
                              <TableCell className="text-xs">string</TableCell>
                              <TableCell className="text-xs">dimension</TableCell>
                              <TableCell className="text-xs text-muted-foreground"></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">暂无字段定义</div>
                  )
                })()
              )}
            </div>

            <Separator />
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">预览</div>
                <div className="flex items-center gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">条数</div>
                    <Input
                      className="h-8 w-24"
                      type="number"
                      min={1}
                      max={1000}
                      value={previewLimit}
                      onChange={(e) => setPreviewLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">偏移</div>
                    <Input
                      className="h-8 w-24"
                      type="number"
                      min={0}
                      value={previewOffset}
                      onChange={(e) => setPreviewOffset(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handlePrevPage} disabled={previewOffset === 0}>
                  ← 上一页
                </Button>
                <Button size="sm" variant="outline" onClick={handleNextPage} disabled={!preview || (preview?.data?.length || 0) < previewLimit}>
                  下一页 →
                </Button>
                <Button size="sm" variant="outline" onClick={reloadPreview}>
                  <RefreshCw className="h-4 w-4 mr-2" /> 刷新
                </Button>
              </div>
            </div>
            {(() => {
              const rows = Array.isArray(preview?.data) ? preview.data : []
              const headers = rows && rows.length > 0 && rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : []
              return preview ? (
                <div className="text-xs">
                  <div className="mb-2 text-muted-foreground">
                    {preview.row_count} 行 · {preview.execution_time_ms?.toFixed?.(2)} ms · 显示 {Math.min(previewLimit, rows.length || 0)} 行，自偏移 {previewOffset}
                  </div>
                  {headers.length > 0 ? (
                    <div className="rounded-md border overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {headers.map((h) => (
                              <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.slice(0, previewLimit).map((r: any, idx: number) => (
                            <TableRow key={idx}>
                              {headers.map((h) => (
                                <TableCell key={h} className="align-top text-[11px]">
                                  {typeof r[h] === 'object' ? JSON.stringify(r[h]) : String(r[h] ?? '')}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-md border p-3 text-muted-foreground">暂无可展示的表格数据</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">暂无预览</div>
              )
            })()}
          </CardContent>
        </Card>
      )}

      <Separator />

      <DatasourceWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        connections={connections}
        onCreate={handleCreate}
      />

      <DatasourceWizard
        open={editOpen}
        onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingDs(null) }}
        connections={connections}
        onCreate={() => {}}
        mode="edit"
        initialValues={editingDs ? {
          id: editingDs.id,
          name: editingDs.name,
          type: editingDs.type as any,
          database_connection_id: (editingDs as any).database_connection_id,
          table_name: editingDs.table_name,
          sql: editingDs.sql,
          description: editingDs.description,
        } : null}
        onUpdate={handleUpdate}
      />
    </div>
  )
}
