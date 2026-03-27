import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'

interface WorkflowListFilters {
  page: number
  pageSize: number
  status: string
  search: string
}

interface WorkflowState {
  filters: WorkflowListFilters
  selectedWorkflowIds: Set<string>
}

interface WorkflowActions {
  setFilters: (filters: Partial<WorkflowListFilters>) => void
  resetFilters: () => void
  setPage: (page: number) => void
  toggleSelection: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
}

const DEFAULT_FILTERS: WorkflowListFilters = {
  page: 1,
  pageSize: 12,
  status: '',
  search: '',
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>()(
  devtools(
    immer((set) => ({
      filters: { ...DEFAULT_FILTERS },
      selectedWorkflowIds: new Set<string>(),

      setFilters: (partial) =>
        set(
          (state) => {
            Object.assign(state.filters, partial)
            state.filters.page = 1
          },
          false,
          'workflow/setFilters',
        ),

      resetFilters: () =>
        set(
          (state) => {
            state.filters = { ...DEFAULT_FILTERS }
          },
          false,
          'workflow/resetFilters',
        ),

      setPage: (page) =>
        set(
          (state) => {
            state.filters.page = page
          },
          false,
          'workflow/setPage',
        ),

      toggleSelection: (id) =>
        set(
          (state) => {
            if (state.selectedWorkflowIds.has(id)) {
              state.selectedWorkflowIds.delete(id)
            } else {
              state.selectedWorkflowIds.add(id)
            }
          },
          false,
          'workflow/toggleSelection',
        ),

      selectAll: (ids) =>
        set(
          (state) => {
            state.selectedWorkflowIds = new Set(ids)
          },
          false,
          'workflow/selectAll',
        ),

      clearSelection: () =>
        set(
          (state) => {
            state.selectedWorkflowIds = new Set()
          },
          false,
          'workflow/clearSelection',
        ),
    })),
    { name: 'WorkflowStore' },
  ),
)
