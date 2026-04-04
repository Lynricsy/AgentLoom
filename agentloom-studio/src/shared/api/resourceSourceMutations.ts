import { useMutation } from '@tanstack/react-query'
import {
  convertResourceSourceToManual,
  type ResourceSourceResourceType,
} from './resourceSourceApi'

export function useConvertResourceSourceToManual() {
  return useMutation({
    mutationKey: ['resource-source', 'convert-to-manual'],
    mutationFn: ({
      resourceType,
      resourceId,
    }: {
      resourceType: ResourceSourceResourceType
      resourceId: string
    }) => convertResourceSourceToManual(resourceType, resourceId),
    gcTime: 0,
  })
}
