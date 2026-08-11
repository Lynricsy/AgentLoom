import { describe, expect, it } from 'vitest'

import {
  getGeneratedAppPublicShareUnavailableReason,
  getGeneratedAppReadinessBadgeVariant,
  isGeneratedAppPublicShareEligible,
} from './generatedAppDisplay'
import type { GeneratedAppReadiness } from '../types'

function makeReadiness(
  overrides: Partial<GeneratedAppReadiness> = {},
): GeneratedAppReadiness {
  return {
    state: 'preview',
    canCreatePublicShare: false,
    blockingIssueCount: 7,
    warningCount: 0,
    summary: '阻断门禁尚未全部通过。',
    blockers: [],
    warnings: [],
    ...overrides,
  }
}

describe('generatedAppDisplay', () => {
  it('only treats backend publish_candidate plus canCreatePublicShare as share eligible', () => {
    expect(
      isGeneratedAppPublicShareEligible(
        makeReadiness({
          state: 'publish_candidate',
          canCreatePublicShare: true,
          blockingIssueCount: 0,
        }),
      ),
    ).toBe(true)

    expect(
      isGeneratedAppPublicShareEligible(
        makeReadiness({
          state: 'publish_candidate',
          canCreatePublicShare: false,
          blockingIssueCount: 0,
        }),
      ),
    ).toBe(false)

    expect(
      isGeneratedAppPublicShareEligible(
        makeReadiness({
          state: 'trial',
          canCreatePublicShare: true,
          warningCount: 1,
        }),
      ),
    ).toBe(false)
  })

  it('returns a warning-specific disabled reason for trial readiness', () => {
    expect(
      getGeneratedAppPublicShareUnavailableReason(
        makeReadiness({ state: 'trial', warningCount: 1 }),
      ),
    ).toContain('非阻断 warning')
  })

  it('maps readiness state to badge semantics, downgrading publish candidates that cannot share', () => {
    expect(
      getGeneratedAppReadinessBadgeVariant(
        makeReadiness({ state: 'publish_candidate', canCreatePublicShare: true }),
      ),
    ).toBe('success')

    expect(
      getGeneratedAppReadinessBadgeVariant(
        makeReadiness({
          state: 'publish_candidate',
          canCreatePublicShare: false,
        }),
      ),
    ).toBe('warning')

    expect(
      getGeneratedAppReadinessBadgeVariant(makeReadiness({ state: 'trial' })),
    ).toBe('warning')

    expect(
      getGeneratedAppReadinessBadgeVariant(makeReadiness({ state: 'blocked' })),
    ).toBe('error')

    expect(
      getGeneratedAppReadinessBadgeVariant(makeReadiness({ state: 'preview' })),
    ).toBe('info')
  })
})
