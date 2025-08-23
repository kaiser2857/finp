import { useState, useEffect, useCallback } from 'react'
import { 
  apiClient, 
  Dashboard, 
  Component, 
  Datasource, 
  AgentRequest, 
  AgentResponse,
  transformCanvasItemToComponent,
  transformComponentToCanvasItem
} from '@/lib/api'

export interface UseApiState {
  // Data
  dashboards: Dashboard[]
  components: Component[]
  datasources: Datasource[]
  
  // Loading states
  loading: {
    dashboards: boolean
    components: boolean
    datasources: boolean
    agent: boolean
  }
  
  // Error states
  errors: {
    dashboards: string | null
    components: string | null
    datasources: string | null
    agent: string | null
  }
  
  // Current selections
  currentDashboard: Dashboard | null
  currentComponents: Component[]
}

export interface UseApiActions {
  // Dashboard actions
  loadDashboards: () => Promise<void>
  createDashboard: (dashboard: Omit<Dashboard, 'id' | 'created_at' | 'updated_at'>) => Promise<Dashboard | null>
  updateDashboard: (id: string, dashboard: Partial<Dashboard>) => Promise<Dashboard | null>
  deleteDashboard: (id: string) => Promise<boolean>
  selectDashboard: (dashboard: Dashboard) => void
  
  // Component actions
  loadComponents: () => Promise<void>
  loadDashboardComponents: (dashboardId: string) => Promise<void>
  createComponent: (component: Omit<Component, 'id' | 'created_at' | 'updated_at'>) => Promise<Component | null>
  updateComponent: (id: string, component: Partial<Component>) => Promise<Component | null>
  deleteComponent: (id: string) => Promise<boolean>
  
  // Canvas integration
  saveCanvasItems: (items: any[], dashboardId: string) => Promise<void>
  loadCanvasItems: (dashboardId: string) => Promise<any[]>
  
  // Agent actions
  askAgent: (request: AgentRequest) => Promise<AgentResponse | null>
  
  // Datasource actions
  loadDatasources: () => Promise<void>
  
  // Utility
  checkApiHealth: () => Promise<boolean>
  clearErrors: () => void
}

export function useApi(): [UseApiState, UseApiActions] {
  // State
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [datasources, setDatasources] = useState<Datasource[]>([])
  const [currentDashboard, setCurrentDashboard] = useState<Dashboard | null>(null)
  const [currentComponents, setCurrentComponents] = useState<Component[]>([])
  
  const [loading, setLoading] = useState({
    dashboards: false,
    components: false,
    datasources: false,
    agent: false,
  })
  
  const [errors, setErrors] = useState({
    dashboards: null as string | null,
    components: null as string | null,
    datasources: null as string | null,
    agent: null as string | null,
  })
  
  // Helper to update loading state
  const setLoadingState = useCallback((key: keyof typeof loading, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }))
  }, [])
  
  // Helper to set error state
  const setErrorState = useCallback((key: keyof typeof errors, value: string | null) => {
    setErrors(prev => ({ ...prev, [key]: value }))
  }, [])
  
  // API Actions
  const loadDashboards = useCallback(async () => {
    setLoadingState('dashboards', true)
    setErrorState('dashboards', null)
    
    try {
      const dashboardList = await apiClient.getDashboards()
      setDashboards(dashboardList)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load dashboards'
      setErrorState('dashboards', errorMessage)
      console.error('Failed to load dashboards:', error)
    } finally {
      setLoadingState('dashboards', false)
    }
  }, [setLoadingState, setErrorState])
  
  const createDashboard = useCallback(async (dashboard: Omit<Dashboard, 'id' | 'created_at' | 'updated_at'>) => {
    setLoadingState('dashboards', true)
    setErrorState('dashboards', null)
    
    try {
      const newDashboard = await apiClient.createDashboard(dashboard)
      setDashboards(prev => [...prev, newDashboard])
      return newDashboard
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create dashboard'
      setErrorState('dashboards', errorMessage)
      console.error('Failed to create dashboard:', error)
      return null
    } finally {
      setLoadingState('dashboards', false)
    }
  }, [setLoadingState, setErrorState])
  
  const updateDashboard = useCallback(async (id: string, dashboard: Partial<Dashboard>) => {
    setLoadingState('dashboards', true)
    setErrorState('dashboards', null)
    
    try {
      const updatedDashboard = await apiClient.updateDashboard(id, dashboard)
      setDashboards(prev => prev.map(d => d.id === id ? updatedDashboard : d))
      if (currentDashboard?.id === id) {
        setCurrentDashboard(updatedDashboard)
      }
      return updatedDashboard
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update dashboard'
      setErrorState('dashboards', errorMessage)
      console.error('Failed to update dashboard:', error)
      return null
    } finally {
      setLoadingState('dashboards', false)
    }
  }, [currentDashboard, setLoadingState, setErrorState])
  
  const deleteDashboard = useCallback(async (id: string) => {
    setLoadingState('dashboards', true)
    setErrorState('dashboards', null)
    
    try {
      await apiClient.deleteDashboard(id)
      setDashboards(prev => prev.filter(d => d.id !== id))
      if (currentDashboard?.id === id) {
        setCurrentDashboard(null)
        setCurrentComponents([])
      }
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete dashboard'
      setErrorState('dashboards', errorMessage)
      console.error('Failed to delete dashboard:', error)
      return false
    } finally {
      setLoadingState('dashboards', false)
    }
  }, [currentDashboard, setLoadingState, setErrorState])
  
  const selectDashboard = useCallback((dashboard: Dashboard) => {
    setCurrentDashboard(dashboard)
    // Auto-load components for the selected dashboard
    loadDashboardComponents(dashboard.id)
  }, [])
  
  const loadComponents = useCallback(async () => {
    setLoadingState('components', true)
    setErrorState('components', null)
    
    try {
      const componentList = await apiClient.getComponents()
      setComponents(componentList)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load components'
      setErrorState('components', errorMessage)
      console.error('Failed to load components:', error)
    } finally {
      setLoadingState('components', false)
    }
  }, [setLoadingState, setErrorState])
  
  const loadDashboardComponents = useCallback(async (dashboardId: string) => {
    setLoadingState('components', true)
    setErrorState('components', null)
    
    try {
      const componentList = await apiClient.getDashboardComponents(dashboardId)
      setCurrentComponents(componentList)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load dashboard components'
      setErrorState('components', errorMessage)
      console.error('Failed to load dashboard components:', error)
    } finally {
      setLoadingState('components', false)
    }
  }, [setLoadingState, setErrorState])
  
  const createComponent = useCallback(async (component: Omit<Component, 'id' | 'created_at' | 'updated_at'>) => {
    setLoadingState('components', true)
    setErrorState('components', null)
    
    try {
      const newComponent = await apiClient.createComponent(component)
      setComponents(prev => [...prev, newComponent])
      if (currentDashboard?.id === component.dashboard_id) {
        setCurrentComponents(prev => [...prev, newComponent])
      }
      return newComponent
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create component'
      setErrorState('components', errorMessage)
      console.error('Failed to create component:', error)
      return null
    } finally {
      setLoadingState('components', false)
    }
  }, [currentDashboard, setLoadingState, setErrorState])
  
  const updateComponent = useCallback(async (id: string, component: Partial<Component>) => {
    setLoadingState('components', true)
    setErrorState('components', null)
    
    try {
      const updatedComponent = await apiClient.updateComponent(id, component)
      setComponents(prev => prev.map(c => c.id === id ? updatedComponent : c))
      setCurrentComponents(prev => prev.map(c => c.id === id ? updatedComponent : c))
      return updatedComponent
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update component'
      setErrorState('components', errorMessage)
      console.error('Failed to update component:', error)
      return null
    } finally {
      setLoadingState('components', false)
    }
  }, [setLoadingState, setErrorState])
  
  const deleteComponent = useCallback(async (id: string) => {
    setLoadingState('components', true)
    setErrorState('components', null)
    
    try {
      await apiClient.deleteComponent(id)
      setComponents(prev => prev.filter(c => c.id !== id))
      setCurrentComponents(prev => prev.filter(c => c.id !== id))
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete component'
      setErrorState('components', errorMessage)
      console.error('Failed to delete component:', error)
      return false
    } finally {
      setLoadingState('components', false)
    }
  }, [setLoadingState, setErrorState])
  
  const saveCanvasItems = useCallback(async (items: any[], dashboardId: string) => {
    setLoadingState('components', true)
    setErrorState('components', null)
    
    try {
      // Delete existing components for this dashboard
      const existingComponents = await apiClient.getDashboardComponents(dashboardId)
      await Promise.all(existingComponents.map(comp => apiClient.deleteComponent(comp.id)))
      
      // Create new components
      const newComponents = await Promise.all(
        items.map(item => {
          const component = transformCanvasItemToComponent(item, dashboardId)
          return apiClient.createComponent(component)
        })
      )
      
      setCurrentComponents(newComponents)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save canvas items'
      setErrorState('components', errorMessage)
      console.error('Failed to save canvas items:', error)
    } finally {
      setLoadingState('components', false)
    }
  }, [setLoadingState, setErrorState])
  
  const loadCanvasItems = useCallback(async (dashboardId: string): Promise<any[]> => {
    try {
      const components = await apiClient.getDashboardComponents(dashboardId)
      return components.map(transformComponentToCanvasItem)
    } catch (error) {
      console.error('Failed to load canvas items:', error)
      return []
    }
  }, [])
    const askAgent = useCallback(async (request: AgentRequest) => {
    setLoadingState('agent', true)
    setErrorState('agent', null)
    
    try {
      // Ensure we have proper chartContext if no component_id is provided
      const agentRequest: AgentRequest = {
        question: request.question,
        chartContext: request.chartContext || {
          tables: [
            {
              name: "sample_data",
              columns: ["date", "value", "category"],
            },
          ],
        },
        component_id: request.component_id,
        provider: request.provider,
        model: request.model,
      }
      
      const response = await apiClient.askAgent(agentRequest)
      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get agent response'
      setErrorState('agent', errorMessage)
      console.error('Failed to ask agent:', error)
      return null
    } finally {
      setLoadingState('agent', false)
    }
  }, [setLoadingState, setErrorState])
  
  const loadDatasources = useCallback(async () => {
    setLoadingState('datasources', true)
    setErrorState('datasources', null)
    
    try {
      const datasourceList = await apiClient.getDatasources()
      setDatasources(datasourceList)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load datasources'
      setErrorState('datasources', errorMessage)
      console.error('Failed to load datasources:', error)
    } finally {
      setLoadingState('datasources', false)
    }
  }, [setLoadingState, setErrorState])
  
  const checkApiHealth = useCallback(async () => {
    try {
      const health = await apiClient.healthCheck()
      return health.ok
    } catch (error) {
      console.error('API health check failed:', error)
      return false
    }
  }, [])
  
  const clearErrors = useCallback(() => {
    setErrors({
      dashboards: null,
      components: null,
      datasources: null,
      agent: null,
    })
  }, [])
  
  // Auto-load dashboards on mount
  useEffect(() => {
    loadDashboards()
    loadDatasources()
  }, [loadDashboards, loadDatasources])
  
  const state: UseApiState = {
    dashboards,
    components,
    datasources,
    loading,
    errors,
    currentDashboard,
    currentComponents,
  }
  
  const actions: UseApiActions = {
    loadDashboards,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    selectDashboard,
    loadComponents,
    loadDashboardComponents,
    createComponent,
    updateComponent,
    deleteComponent,
    saveCanvasItems,
    loadCanvasItems,
    askAgent,
    loadDatasources,
    checkApiHealth,
    clearErrors,
  }
  
  return [state, actions]
}
