// API Client for Investment Research Analytics Backend
const API_BASE_URL = 'http://localhost:8787'

// API Types
export interface Dashboard {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Datasource {
  id: string
  name: string
  type: string
  connection_string: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Component {
  id: string
  dashboard_id: string
  name: string
  component_type: string
  config: any
  x_position: number
  y_position: number
  width: number
  height: number
  datasource_id: string | null
  created_at: string
  updated_at: string
}

export interface AgentRequest {
  question: string
  chartContext?: any
  component_id?: string
  provider?: string
  model?: string
}

export interface AgentResponse {
  answer?: string
  text?: string  // Backend sometimes returns 'text' instead of 'answer'
  chartConfig?: any
  data?: any
  raw?: any
  error?: string
}

export type AgentStreamEvent =
  | { type: 'chunk'; delta: string; request_id?: string }
  | { type: 'done'; answer: string; request_id?: string }
  | { type: 'error'; error: string; request_id?: string }
  // New: streaming tool events
  | { type: 'tool_call_started'; tool: string; arguments: any; normalized_sql?: string; injected_sql?: string; request_id?: string }
  | { type: 'tool_chunk'; tool: string; delta: string; request_id?: string }
  | { type: 'tool_result'; tool: string; result: any; request_id?: string }

// Enhanced API Types for Superset-like functionality
export interface DatabaseConnection {
  id: string
  name: string
  database_type: string
  host?: string
  port?: number
  database_name?: string
  username?: string
  connection_params: any
  is_active: boolean
  created_at: string
  updated_at: string
}

// Request types for creating/updating database connections
export interface DatabaseConnectionCreate {
  name: string
  database_type: string
  host?: string
  port?: number
  database_name?: string
  username?: string
  password?: string
  connection_params?: any
  is_active?: boolean
}

export type DatabaseConnectionUpdate = Partial<DatabaseConnectionCreate>

export interface EnhancedDatasource {
  id: string
  name: string
  type: 'table' | 'query' | 'api' | 'file'
  database_connection_id?: string
  table_name?: string
  sql?: string
  api_endpoint?: string
  file_path?: string
  description?: string
  configuration: any
  cache_timeout: number
  is_active: boolean
  created_at: string
  updated_at: string
  columns: ColumnDefinition[]
}

export interface ColumnDefinition {
  id: string
  name: string
  type: 'string' | 'number' | 'datetime' | 'boolean'
  role: 'dimension' | 'metric' | 'time' | 'filter'
  description?: string
  is_filterable: boolean
  is_groupable: boolean
  format_string?: string
  default_aggregation?: string
  created_at: string
}

export interface EnhancedComponent {
  id: string
  dashboard_id: string
  datasource_id?: string
  name: string
  component_type: string
  config: any
  query_config: any
  x_position: number
  y_position: number
  width: number
  height: number
  order_index: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface QueryRequest {
  datasource_id: string
  sql?: string
  filters?: Array<{
    column: string
    operator: string
    value: any
  }>
  aggregations?: Array<{
    column: string
    function: string
    alias?: string
  }>
  group_by?: string[]
  order_by?: Array<{
    column: string
    direction: 'ASC' | 'DESC'
  }>
  limit?: number
}

export interface QueryResult {
  data: any[]
  columns: Array<{
    name: string
    type: string
  }>
  row_count: number
  execution_time_ms: number
  cached: boolean
}

export interface ChartContext {
  component: {
    id: string
    name: string
    type: string
    config: any
    query_config: any
  }
  datasource: {
    id: string
    name: string
    type: string
    table_name?: string
    description?: string
  }
  schema: {
    columns: Array<{
      name: string
      type: string
      role: string
      description?: string
    }>
    sample_data: any[]
  }
}

// Types
export interface AiConfig {
  provider: 'openai' | 'none' | string
  models: string[]
  defaultModel?: string | null
  streaming?: boolean
  // New: multi-provider list (sanitized; no api keys)
  providers?: Array<{ provider: string; models: string[]; defaultModel?: string | null; streaming?: boolean }>
}

// API Client Class
class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  // Add: UUID validator to guard query params
  private isValidUUID(id?: string): boolean {
    if (!id || typeof id !== 'string') return false
    const s = id.trim()
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(s)
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error)
      throw error
    }
  }

  // Health Check
  async healthCheck(): Promise<{ ok: boolean; service: string }> {
    return this.request('/health')
  }

  // Agent API
  async askAgent(request: AgentRequest): Promise<AgentResponse> {
    return this.request('/agent', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  async askAgentStream(request: AgentRequest, onEvent: (e: AgentStreamEvent) => void, signal?: AbortSignal): Promise<void> {
    try {
      const resp = await fetch(`${this.baseUrl}/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })
      if (!resp.ok || !resp.body) {
        // Emit error event instead of throwing to avoid console overlay; caller may fallback
        onEvent({ type: 'error', error: `HTTP ${resp.status}` })
        return
      }
  
      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE messages are separated by double newlines
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const line = part.trim()
          if (!line) continue
          if (line.startsWith('data:')) {
            const jsonStr = line.slice(5).trim()
            try {
              const evt = JSON.parse(jsonStr) as AgentStreamEvent
              onEvent(evt)
            } catch (e) {
              // ignore bad chunks
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // user stopped; emit error for UI but don't throw
        onEvent({ type: 'error', error: 'aborted' })
        return
      }
      // Network/CORS/etc; emit error and return without throwing
      onEvent({ type: 'error', error: err?.message || 'stream_failed' })
    }
  }

  // Dashboard APIs
  async getDashboards(): Promise<Dashboard[]> {
    return this.request('/dashboards')
  }

  async getDashboard(id: string): Promise<Dashboard> {
    return this.request(`/dashboards/${id}`)
  }

  async createDashboard(dashboard: Omit<Dashboard, 'id' | 'created_at' | 'updated_at'>): Promise<Dashboard> {
    return this.request('/dashboards', {
      method: 'POST',
      body: JSON.stringify(dashboard),
    })
  }

  async updateDashboard(id: string, dashboard: Partial<Dashboard>): Promise<Dashboard> {
    return this.request(`/dashboards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dashboard),
    })
  }

  async deleteDashboard(id: string): Promise<{ message: string }> {
    return this.request(`/dashboards/${id}`, {
      method: 'DELETE',
    })
  }

  // Component APIs
  async getComponents(): Promise<Component[]> {
    return this.request('/components')
  }

  async getDashboardComponents(dashboardId: string): Promise<Component[]> {
    return this.request(`/dashboards/${dashboardId}/components`)
  }

  async getComponent(id: string): Promise<Component> {
    return this.request(`/components/${id}`)
  }

  async createComponent(component: Omit<Component, 'id' | 'created_at' | 'updated_at'>): Promise<Component> {
    return this.request('/components', {
      method: 'POST',
      body: JSON.stringify(component),
    })
  }

  async updateComponent(id: string, component: Partial<Component>): Promise<Component> {
    return this.request(`/components/${id}`, {
      method: 'PUT',
      body: JSON.stringify(component),
    })
  }

  async deleteComponent(id: string): Promise<{ message: string }> {
    return this.request(`/components/${id}`, {
      method: 'DELETE',
    })
  }

  // Datasource APIs
  async getDatasources(): Promise<Datasource[]> {
    return this.request('/datasources')
  }

  async getDatasource(id: string): Promise<Datasource> {
    return this.request(`/datasources/${id}`)
  }

  async createDatasource(datasource: Omit<Datasource, 'id' | 'created_at' | 'updated_at'>): Promise<Datasource> {
    return this.request('/datasources', {
      method: 'POST',
      body: JSON.stringify(datasource),
    })
  }

  async updateDatasource(id: string, datasource: Partial<Datasource>): Promise<Datasource> {
    return this.request(`/datasources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(datasource),
    })
  }

  async deleteDatasource(id: string): Promise<{ message: string }> {
    return this.request(`/datasources/${id}`, {
      method: 'DELETE',
    })
  }

  // Chart Context API
  async getComponentChartContext(componentId: string): Promise<any> {
    return this.request(`/components/${componentId}/chart-context`)
  }

  // ==================== DATABASE CONNECTION APIs ====================
  
  async getDatabaseConnections(): Promise<DatabaseConnection[]> {
    return this.request('/database-connections')
  }

  async getDatabaseConnection(id: string): Promise<DatabaseConnection> {
    return this.request(`/database-connections/${id}`)
  }

  async createDatabaseConnection(connection: DatabaseConnectionCreate): Promise<DatabaseConnection> {
    return this.request('/database-connections', {
      method: 'POST',
      body: JSON.stringify(connection),
    })
  }

  async updateDatabaseConnection(id: string, connection: DatabaseConnectionUpdate): Promise<DatabaseConnection> {
    return this.request(`/database-connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(connection),
    })
  }

  async deleteDatabaseConnection(id: string): Promise<{ message: string }> {
    return this.request(`/database-connections/${id}`, {
      method: 'DELETE',
    })
  }

  async testDatabaseConnection(connectionId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/database-connections/${connectionId}/test`, {
      method: 'POST',
    })
  }

  async testDatabaseConnectionDetailed(connectionId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/database-connections/${connectionId}/test-detailed`, {
      method: 'POST',
    })
  }

  async getDatabaseTables(connectionId: string): Promise<{ tables: string[] }> {
    return this.request(`/database-connections/${connectionId}/tables`)
  }

  async getTableSchema(connectionId: string, tableName: string): Promise<{ table_name: string; schema: any[] }> {
    return this.request(`/database-connections/${connectionId}/tables/${tableName}/schema`)
  }

  // ==================== ENHANCED DATASOURCE APIs ====================
  
  async getEnhancedDatasources(): Promise<EnhancedDatasource[]> {
    return this.request('/datasources/enhanced')
  }

  async createEnhancedDatasource(datasource: Omit<EnhancedDatasource, 'id' | 'created_at' | 'updated_at'>): Promise<EnhancedDatasource> {
    return this.request('/datasources/enhanced', {
      method: 'POST',
      body: JSON.stringify(datasource),
    })
  }

  async getEnhancedDatasource(id: string): Promise<EnhancedDatasource> {
    return this.request(`/datasources/enhanced/${id}`)
  }

  async deleteEnhancedDatasource(id: string): Promise<{ message: string }> {
    // backend uses legacy delete at /datasources/{id}
    return this.request(`/datasources/${id}`, { method: 'DELETE' })
  }

  async getEnhancedDatasourceDetail(id: string): Promise<EnhancedDatasource> {
    return this.request(`/datasources/enhanced/${id}`)
  }

  async previewDatasourceData(datasourceId: string, limit: number = 100, offset?: number): Promise<QueryResult & { datasource_info: any; offset?: number; limit?: number }> {
    const params = new URLSearchParams()
    if (limit != null) params.set('limit', String(limit))
    if (offset != null && offset > 0) params.set('offset', String(offset))
    const qs = params.toString()
    return this.request(`/datasources/${datasourceId}/preview${qs ? `?${qs}` : ''}`)
  }

  // ==================== ENHANCED COMPONENT APIs ====================
  
  async getEnhancedComponents(dashboardId?: string): Promise<EnhancedComponent[]> {
    const params = new URLSearchParams()
    if (this.isValidUUID(dashboardId)) params.set('dashboard_id', dashboardId!.trim())
    const qs = params.toString()
    return this.request(`/components/enhanced${qs ? `?${qs}` : ''}`)
  }

  async createEnhancedComponent(component: Omit<EnhancedComponent, 'id' | 'created_at' | 'updated_at'>): Promise<EnhancedComponent> {
    return this.request('/components/enhanced', {
      method: 'POST',
      body: JSON.stringify(component),
    })
  }

  async getEnhancedComponent(id: string): Promise<EnhancedComponent> {
    return this.request(`/components/enhanced/${id}`)
  }

  async updateEnhancedComponent(id: string, update: Partial<EnhancedComponent>): Promise<EnhancedComponent> {
    return this.request(`/components/enhanced/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    })
  }

  async executeComponentQuery(componentId: string, queryRequest?: QueryRequest): Promise<QueryResult & { config: any; metadata: any }> {
    return this.request(`/components/${componentId}/query`, {
      method: 'POST',
      body: JSON.stringify(queryRequest || {}),
    })
  }

  async getEnhancedChartContext(componentId: string): Promise<ChartContext> {
    return this.request(`/components/${componentId}/chart-context-enhanced`)
  }

  // ==================== QUERY APIs ====================
  
  async executeCustomQuery(queryRequest: QueryRequest): Promise<QueryResult> {
    return this.request('/query/execute', {
      method: 'POST',
      body: JSON.stringify(queryRequest),
    })
  }

  // ==================== DASHBOARD ENHANCED APIs ====================
  
  async getEnhancedDashboard(dashboardId: string): Promise<Dashboard & { components: EnhancedComponent[] }> {
    return this.request(`/dashboards/${dashboardId}/enhanced`)
  }

  async duplicateDashboard(dashboardId: string, newName: string): Promise<Dashboard> {
    return this.request(`/dashboards/${dashboardId}/duplicate?new_name=${encodeURIComponent(newName)}`, {
      method: 'POST',
    })
  }

  async saveDashboardComponentsLayout(dashboardId: string, updates: Array<{ component_id: string; x_position?: number; y_position?: number; width?: number; height?: number; order_index?: number }>): Promise<any[]> {
    // Filter out invalid component_ids to avoid backend 422
    const filtered = (updates || []).filter(u => this.isValidUUID(u.component_id))
    return this.request(`/dashboards/${dashboardId}/components/layout`, {
      method: 'PUT',
      body: JSON.stringify({ updates: filtered }),
    })
  }

  async getAiConfig(): Promise<AiConfig> {
    return this.request('/ai/config')
  }
}

// Export singleton instance
export const apiClient = new ApiClient()
export const api = apiClient

// Utility functions
export const transformCanvasItemToComponent = (
  item: any,
  dashboardId: string
): Omit<Component, 'id' | 'created_at' | 'updated_at'> => {
  return {
    dashboard_id: dashboardId,
    name: item.title,
    component_type: item.widgetType || item.type,
    config: {
      data: item.data,
      width: item.width,
      height: item.height,
      minimized: item.minimized,
      widthRatio: item.widthRatio,
    },
    x_position: 0, // These would be set by layout
    y_position: 0,
    width: item.width,
    height: item.height,
    datasource_id: null, // Could be set later
  }
}

export const transformComponentToCanvasItem = (
  component: Component
): any => {
  return {
    id: component.id,
    type: 'widget',
    title: component.name,
    widgetType: component.component_type,
    data: component.config?.data,
    width: component.width,
    height: component.height,
    order: 0, // Could be derived from position
    minimized: component.config?.minimized || false,
    widthRatio: component.config?.widthRatio,
  }
}
