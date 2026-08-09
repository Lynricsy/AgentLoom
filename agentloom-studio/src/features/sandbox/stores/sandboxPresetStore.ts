import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export interface SandboxPreset {
  id: string;
  name: string;
  cpu: number; // cores (0.5-4)
  memory: number; // MB (256-4096)
  disk: number; // GB (1-10)
  isBuiltin: boolean;
}

const BUILTIN_PRESETS: SandboxPreset[] = [
  {
    id: "builtin-light",
    name: "轻量",
    cpu: 0.5,
    memory: 512,
    disk: 2,
    isBuiltin: true,
  },
  {
    id: "builtin-standard",
    name: "标准",
    cpu: 1,
    memory: 1024,
    disk: 5,
    isBuiltin: true,
  },
  {
    id: "builtin-performance",
    name: "高性能",
    cpu: 2,
    memory: 2048,
    disk: 10,
    isBuiltin: true,
  },
];

interface SandboxPresetState {
  customPresets: SandboxPreset[];
}

interface SandboxPresetActions {
  addPreset: (preset: Omit<SandboxPreset, "id" | "isBuiltin">) => void;
  removePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
}

export const useSandboxPresetStore = create<
  SandboxPresetState & SandboxPresetActions
>()(
  devtools(
    persist(
      immer((set) => ({
        customPresets: [],

        addPreset: (preset) =>
          set(
            (state) => {
              state.customPresets.push({
                ...preset,
                id: `custom-${Date.now()}`,
                isBuiltin: false,
              });
            },
            false,
            "sandbox-preset/addPreset",
          ),

        removePreset: (id) =>
          set(
            (state) => {
              state.customPresets = state.customPresets.filter(
                (p) => p.id !== id,
              );
            },
            false,
            "sandbox-preset/removePreset",
          ),

        renamePreset: (id, name) =>
          set(
            (state) => {
              const preset = state.customPresets.find((p) => p.id === id);
              if (preset) {
                preset.name = name;
              }
            },
            false,
            "sandbox-preset/renamePreset",
          ),
      })),
      { name: "agentloom-sandbox-presets" },
    ),
    { name: "SandboxPresetStore" },
  ),
);

/** Get all presets (builtins + custom) */
export function getAllPresets(customPresets: SandboxPreset[]): SandboxPreset[] {
  return [...BUILTIN_PRESETS, ...customPresets];
}

/** Find the preset matching the given config, or undefined */
export function findMatchingPreset(
  allPresets: SandboxPreset[],
  config: { cpu: number; memory: number; disk: number },
): SandboxPreset | undefined {
  return allPresets.find(
    (p) =>
      p.cpu === config.cpu &&
      p.memory === config.memory &&
      p.disk === config.disk,
  );
}

export { BUILTIN_PRESETS };
