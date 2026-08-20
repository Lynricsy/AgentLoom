import { describe, expect, it } from 'vitest'
import { isManualTriggerOutputFieldPayload } from './trigger.types'

describe('isManualTriggerOutputFieldPayload', () => {
  it('accepts a payload with string id and label', () => {
    expect(isManualTriggerOutputFieldPayload({
      id: 'customer-name',
      label: 'Customer name',
      type: 'text',
    })).toBe(true)
  })

  it('rejects a payload whose required fields have invalid types', () => {
    expect(isManualTriggerOutputFieldPayload({
      id: 42,
      label: 'Customer name',
      type: 'text',
    })).toBe(false)
  })
})
