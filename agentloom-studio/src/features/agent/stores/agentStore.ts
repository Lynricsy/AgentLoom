import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'

interface AgentListFilters {
  page: number
  pageSize: number
  status: string
  search: string
}

interface AgentState {
  filters: AgentListFilters
  selectedAgentId: string | null
  settingsPanelOpen: boolean
}

interface AgentActions {
  setFilters: (filters: Partial<AgentListFilters>) => void
  resetFilters: () => void
  setPage: (page: number) => void
  selectAgent: (agentId: string | null) => void
  openSettingsPanel: () => void
  closeSettingsPanel: () => void
  toggleSettingsPanel: () => void
}

const DEFAULT_FILTERS: AgentListFilters = {
  page: 1,
  pageSize: 12,
  status: '',
  search: '',
}

export const useAgentStore = create<AgentState & AgentActions>()(
  devtools(
    immer((set) => ({
      filters: { ...DEFAULT_FILTERS },
      selectedAgentId: null,
      settingsPanelOpen: false,

      setFilters: (partial) =>
        set(
          (state) => {
            Object.assign(state.filters, partial)
            state.filters.page = 1
          },
          false,
          'agent/setFilters',
        ),

      resetFilters: () =>
        set(
          (state) => {
            state.filters = { ...DEFAULT_FILTERS }
          },
          false,
          'agent/resetFilters',
        ),

      setPage: (page) =>
        set(
          (state) => {
            state.filters.page = page
          },
          false,
          'agent/setPage',
        ),

      selectAgent: (agentId) =>
        set(
          (state) => {
            state.selectedAgentId = agentId
          },
          false,
          'agent/selectAgent',
        ),

      openSettingsPanel: () =>
        set(
          (state) => {
            state.settingsPanelOpen = true
          },
          false,
          'agent/openSettingsPanel',
        ),

      closeSettingsPanel: () =>
        set(
          (state) => {
            state.settingsPanelOpen = false
          },
          false,
          'agent/closeSettingsPanel',
        ),

      toggleSettingsPanel: () =>
        set(
          (state) => {
            state.settingsPanelOpen = !state.settingsPanelOpen
          },
          false,
          'agent/toggleSettingsPanel',
        ),
    })),
    { name: 'AgentStore' },
  ),
)
