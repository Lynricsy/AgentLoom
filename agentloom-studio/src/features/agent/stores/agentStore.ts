import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { devtools } from "zustand/middleware";

interface AgentState {
  selectedAgentIds: Set<string>;
}

interface AgentActions {
  toggleAgentSelection: (id: string) => void;
  selectAllAgents: (ids: string[]) => void;
  clearAgentSelection: () => void;
}


export const useAgentStore = create<AgentState & AgentActions>()(
  devtools(
    immer((set) => ({
      selectedAgentIds: new Set<string>(),

      toggleAgentSelection: (id) =>
        set(
          (state) => {
            if (state.selectedAgentIds.has(id)) {
              state.selectedAgentIds.delete(id);
            } else {
              state.selectedAgentIds.add(id);
            }
          },
          false,
          "agent/toggleAgentSelection",
        ),

      selectAllAgents: (ids) =>
        set(
          (state) => {
            state.selectedAgentIds = new Set(ids);
          },
          false,
          "agent/selectAllAgents",
        ),

      clearAgentSelection: () =>
        set(
          (state) => {
            state.selectedAgentIds = new Set();
          },
          false,
          "agent/clearAgentSelection",
        ),
    })),
    { name: "AgentStore" },
  ),
);
