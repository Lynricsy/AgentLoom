import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

export const MARKETPLACE_INSTALL_DRAFT_STORAGE_KEY =
  'agentloom-marketplace-install-draft'

export interface MarketplaceInstallDraft {
  sourcePage: 'discover' | 'marketplace'
  listingId: string
  form: {
    name: string
    description: string
  }
  selections: {
    llmModels: Record<string, string>
    workspaces: Record<string, string>
    sandboxes: Record<string, string>
  }
}

interface MarketplaceInstallState {
  draft: MarketplaceInstallDraft | null
}

interface MarketplaceInstallActions {
  saveDraft: (draft: MarketplaceInstallDraft) => void
  clearDraft: () => void
}

export const useMarketplaceInstallStore = create<
  MarketplaceInstallState & MarketplaceInstallActions
>()(
  devtools(
    persist(
      immer((set) => ({
        draft: null,

        saveDraft: (draft) =>
          set(
            (state) => {
              state.draft = draft
            },
            false,
            'marketplace-install/saveDraft',
          ),

        clearDraft: () => {
          set(
            (state) => {
              state.draft = null
            },
            false,
            'marketplace-install/clearDraft',
          )

          globalThis.sessionStorage?.removeItem(
            MARKETPLACE_INSTALL_DRAFT_STORAGE_KEY,
          )
        },
      })),
      {
        name: MARKETPLACE_INSTALL_DRAFT_STORAGE_KEY,
        storage: createJSONStorage(() => globalThis.sessionStorage),
      },
    ),
    { name: 'MarketplaceInstallStore' },
  ),
)
