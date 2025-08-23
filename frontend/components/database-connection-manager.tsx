"use client"

import React, { useState } from 'react'
import { Plus, Database, TestTube, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { DatabaseConnection } from '@/lib/api'

interface DatabaseConnectionFormData {
  name: string
  database_type: string
  host: string
  port: number | null
  database_name: string
  username: string
  password: string
  connection_params: Record<string, any>
}

const initialFormData: DatabaseConnectionFormData = {
  name: '',
  database_type: 'postgresql',
  host: '',
  port: null,
  database_name: '',
  username: '',
  password: '',
  connection_params: {}
}

export function DatabaseConnectionManager() {
  const [connections, setConnections] = useState<DatabaseConnection[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | null>(null)
  const [formData, setFormData] = useState<DatabaseConnectionFormData>(initialFormData)
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { toast } = useToast()

  React.useEffect(() => {
    loadConnections()
  }, [])

  const loadConnections = async () => {
    try {
      setIsLoading(true)
      const data = await api.getDatabaseConnections()
      // Show all connections including inactive (soft-deleted)
      setConnections(data)
    } catch (error) {
      toast({
        title: "错误",
        description: "加载数据库连接失败",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsLoading(true)
      
      const connectionData = {
        ...formData,
        port: formData.port || undefined
      }

      if (editingConnection) {
        // Update existing connection
        await api.updateDatabaseConnection(editingConnection.id, connectionData)
        toast({
          title: "成功",
          description: "数据库连接已更新",
        })
      } else {
        // Create new connection
        await api.createDatabaseConnection(connectionData)
        toast({
          title: "成功",
          description: "数据库连接已创建",
        })
      }

      setIsFormOpen(false)
      setEditingConnection(null)
      setFormData(initialFormData)
      loadConnections()
    } catch (error) {
      toast({
        title: "错误",
        description: `保存失败：${editingConnection ? '更新' : '创建'}数据库连接`,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestConnection = async (connectionId: string) => {
    try {
      setTestingConnectionId(connectionId)
      const result = await api.testDatabaseConnectionDetailed(connectionId)
      // Reflect backend status: active only when test passes
      setConnections(prev => prev.map(c => c.id === connectionId ? { ...c, is_active: !!result.success } : c))
      toast({
        title: result.success ? "连接正常" : "连接失败",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      })
    } catch (error) {
      toast({
        title: "错误",
        description: "测试连接失败",
        variant: "destructive",
      })
    } finally {
      setTestingConnectionId(null)
    }
  }

  const handleEdit = (connection: DatabaseConnection) => {
    setEditingConnection(connection)
    setFormData({
      name: connection.name,
      database_type: connection.database_type,
      host: connection.host || '',
      port: (connection.port ?? null),
      database_name: connection.database_name || '',
      username: connection.username || '',
      password: '', // Don't populate password for security
      connection_params: connection.connection_params || {}
    })
    setIsFormOpen(true)
  }

  const handleDelete = async (connection: DatabaseConnection) => {
    const ok = confirm('确定删除该连接？相关数据源将被设为未激活并与该连接解绑。')
    if (!ok) return
    setDeletingId(connection.id)
    try {
      await api.deleteDatabaseConnection(connection.id)
      // Hard delete UX: remove from list immediately
      setConnections(prev => prev.filter(c => c.id !== connection.id))
      toast({ title: "已删除", description: "连接已移除" })
    } catch (error) {
      toast({ title: "错误", description: "删除数据库连接失败", variant: "destructive" })
    } finally {
      setDeletingId(null)
    }
  }

  const resetForm = () => {
    setFormData(initialFormData)
    setEditingConnection(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">数据库连接</h2>
          <p className="text-muted-foreground">管理数据源所使用的数据库连接</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              新增连接
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingConnection ? '编辑' : '新建'} 数据库连接
              </DialogTitle>
              <DialogDescription>
                配置数据库连接参数
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">连接名称</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="database_type">数据库类型</Label>
                  <Select
                    value={formData.database_type}
                    onValueChange={(value) => setFormData({ ...formData, database_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                      <SelectItem value="sqlite">SQLite</SelectItem>
                      <SelectItem value="mssql">SQL Server</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor="host">主机</Label>
                    <Input
                      id="host"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      placeholder="localhost"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="port">端口</Label>
                    <Input
                      id="port"
                      type="number"
                      value={formData.port || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        port: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="5432"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="database_name">数据库名</Label>
                  <Input
                    id="database_name"
                    value={formData.database_name}
                    onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="username">用户名</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingConnection ? "留空则保留现有密码" : ""}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? '保存中…' : editingConnection ? '更新' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && connections.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-sm text-muted-foreground">正在加载连接…</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {connections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-32">
                <Database className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">尚未配置数据库连接</p>
                <p className="text-xs text-muted-foreground">点击“新增连接”开始配置</p>
              </CardContent>
            </Card>
          ) : (
            connections.map((connection) => (
              <Card key={connection.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Database className="h-5 w-5" />
                      <CardTitle className="text-lg">{connection.name}</CardTitle>
                      <Badge variant={connection.is_active ? "default" : "secondary"}>
                        {connection.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(connection.id)}
                        disabled={testingConnectionId === connection.id}
                      >
                        {testingConnectionId === connection.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        测试连接
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(connection)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(connection)}
                        title="删除"
                        disabled={deletingId === connection.id}
                      >
                        {deletingId === connection.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">类型：</span> {connection.database_type}
                    </div>
                    <div>
                      <span className="font-medium">主机：</span> {connection.host || '无'}
                    </div>
                    <div>
                      <span className="font-medium">端口：</span> {connection.port || '默认'}
                    </div>
                    <div>
                      <span className="font-medium">数据库：</span> {connection.database_name || '无'}
                    </div>
                  </div>
                  {connection.connection_params && Object.keys(connection.connection_params).length > 0 && (
                    <>
                      <Separator className="my-3" />
                      <div>
                        <span className="font-medium text-sm">附加参数：</span>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {JSON.stringify(connection.connection_params, null, 2)}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
