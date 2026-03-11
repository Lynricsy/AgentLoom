import { useQuery } from '@tanstack/react-query';
import {
  fetchTemplates,
  fetchTemplateBySlug,
  type ListTemplatesParams,
} from './templateApi';
import { templateKeys } from './templateKeys';

const TEMPLATE_STALE_TIME = 10 * 60 * 1000;
const TEMPLATE_GC_TIME = TEMPLATE_STALE_TIME;

export function useTemplates(params: ListTemplatesParams = {}) {
  return useQuery({
    queryKey: templateKeys.list(params),
    queryFn: () => fetchTemplates(params),
    staleTime: TEMPLATE_STALE_TIME,
    gcTime: TEMPLATE_GC_TIME,
  });
}

export function useTemplateBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: templateKeys.detail(slug!),
    queryFn: () => fetchTemplateBySlug(slug!),
    enabled: !!slug,
    staleTime: TEMPLATE_STALE_TIME,
    gcTime: TEMPLATE_GC_TIME,
  });
}

export const useTemplateDetail = useTemplateBySlug;
