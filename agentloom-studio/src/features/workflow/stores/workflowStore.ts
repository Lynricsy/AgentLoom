import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { devtools } from "zustand/middleware";

interface WorkflowState {
  selectedWorkflowIds: Set<string>;
}

interface WorkflowActions {
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
}


export const useWorkflowStore = create<WorkflowState & WorkflowActions>()(
  devtools(
    immer((set) => ({
      selectedWorkflowIds: new Set<string>(),


      toggleSelection: (id) =>
        set(
          (state) => {
            if (state.selectedWorkflowIds.has(id)) {
              state.selectedWorkflowIds.delete(id);
            } else {
              state.selectedWorkflowIds.add(id);
            }
          },
          false,
          "workflow/toggleSelection",
        ),

      selectAll: (ids) =>
        set(
          (state) => {
            state.selectedWorkflowIds = new Set(ids);
          },
          false,
          "workflow/selectAll",
        ),

      clearSelection: () =>
        set(
          (state) => {
            state.selectedWorkflowIds = new Set();
          },
          false,
          "workflow/clearSelection",
        ),
    })),
    { name: "WorkflowStore" },
  ),
);
