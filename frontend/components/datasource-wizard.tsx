"use client"

import React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatabaseConnection } from "@/lib/api"
import { api } from "@/lib/api"
import { RefreshCw } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  connections: DatabaseConnection[]
  onCreate: (payload: any) => Promise<void> | void
  // New: edit mode support
  mode?: 'create' | 'edit'
  initialValues?: {
    id?: string
    name?: string
    type?: 'table' | 'query'
    database_connection_id?: string
    table_name?: string
    sql?: string
    description?: string
    cache_timeout?: number
    is_active?: boolean
  } | null
  onUpdate?: (id: string, payload: any) => Promise<void> | void
}

export function DatasourceWizard({ open, onOpenChange, connections, onCreate, mode = 'create', initialValues, onUpdate }: Props) {
  const [type, setType] = React.useState<'table' | 'query'>("table")
  const [name, setName] = React.useState("")
  const [connectionId, setConnectionId] = React.useState<string | undefined>()
  const [tableName, setTableName] = React.useState("")
  const [sql, setSql] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [tables, setTables] = React.useState<string[]>([])
  const [loadingTables, setLoadingTables] = React.useState(false)

  const resetForm = React.useCallback(() => {
    setType("table")
    setName("")
    setConnectionId(undefined)
    setTableName("")
    setSql("")
    setDescription("")
    setTables([])
  }, [])

  // Prefill on open in edit mode
  React.useEffect(() => {
    if (open && mode === 'edit' && initialValues) {
      setName(initialValues.name || '')
      setType((initialValues.type as any) || 'table')
      setConnectionId(initialValues.database_connection_id)
      setTableName(initialValues.table_name || '')
      setSql(initialValues.sql || '')
      setDescription(initialValues.description || '')
    }
  }, [open, mode, initialValues])

  React.useEffect(() => {
    // reset table selection when connection or type changes
    setTableName("")
    setTables([])
    if (type === 'table' && connectionId) {
      ;(async () => {
        setLoadingTables(true)
        try {
          const res = await api.getDatabaseTables(connectionId)
          setTables(res.tables || [])
        } catch (e) {
          setTables([])
        } finally {
          setLoadingTables(false)
        }
      })()
    }
  }, [type, connectionId])

  React.useEffect(() => {
    // When dialog closes, clear fields
    if (!open) resetForm()
  }, [open, resetForm])

  const reloadTables = async () => {
    if (!connectionId) return
    setLoadingTables(true)
    try {
      const res = await api.getDatabaseTables(connectionId)
      setTables(res.tables || [])
    } finally {
      setLoadingTables(false)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      if (mode === 'edit' && initialValues?.id && onUpdate) {
        await onUpdate(initialValues.id, {
          name,
          description,
          // allow switching between table/query
          table_name: type === 'table' ? tableName : undefined,
          sql: type === 'query' ? sql : undefined,
          // do not allow changing connection in update for now unless backend supports it
          // database_connection_id: connectionId,
        })
      } else {
        await onCreate({
          name,
          type,
          database_connection_id: connectionId,
          table_name: type === 'table' ? tableName : undefined,
          sql: type === 'query' ? sql : undefined,
          description,
          configuration: {},
        })
      }
      // reset after success and close dialog
      resetForm()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? '编辑数据源' : '创建数据源'}</DialogTitle>
          <DialogDescription>{mode === 'edit' ? '更新数据源信息' : '使用数据表或 SQL 查询作为数据源'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>名称</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>类型</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)} disabled={mode === 'edit'}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="table">数据表</SelectItem>
                <SelectItem value="query">查询</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>数据库连接</Label>
            <Select value={connectionId} onValueChange={(v: any) => setConnectionId(v)} disabled={mode === 'edit'}>
              <SelectTrigger>
                <SelectValue placeholder="选择连接" />
              </SelectTrigger>
              <SelectContent>
                {connections.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === 'table' ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>数据表</Label>
                <Button type="button" size="sm" variant="outline" onClick={reloadTables} disabled={!connectionId || loadingTables}>
                  <RefreshCw className="w-3 h-3 mr-1" /> {loadingTables ? '加载中' : '刷新'}
                </Button>
              </div>
              <Select value={tableName} onValueChange={(v: any) => setTableName(v)} disabled={!connectionId || loadingTables || mode === 'edit'}>
                <SelectTrigger>
                  <SelectValue placeholder={!connectionId ? '请先选择连接' : (loadingTables ? '正在加载数据表…' : (tables.length ? '选择数据表' : '未找到数据表'))} />
                </SelectTrigger>
                <SelectContent>
                  {tables.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>SQL</Label>
              <Textarea value={sql} onChange={e => setSql(e.target.value)} rows={6} placeholder="select * from ..." />
            </div>
          )}
          <div className="grid gap-2">
            <Label>描述</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="可选" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>取消</Button>
            <Button onClick={submit} disabled={submitting || !name || (!connectionId && mode !== 'edit') || (type === 'table' ? !tableName : !sql)}>
              {submitting ? (mode === 'edit' ? '保存中…' : '创建中…') : (mode === 'edit' ? '保存' : '创建')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
