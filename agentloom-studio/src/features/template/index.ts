export type {
  TemplateDefinition,
  TemplateDetail,
  TemplateListItem,
  TemplateMetadata,
} from './types';

export type { ListTemplatesParams } from './api/templateApi';
export { fetchTemplates, fetchTemplateBySlug } from './api/templateApi';
export { templateKeys } from './api/templateKeys';
export { useTemplateDetail, useTemplates } from './api/templateQueries';
