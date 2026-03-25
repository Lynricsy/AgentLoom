import { apiClient, toSnakeBody } from '@/shared/api/client';

interface CreateOrganizationResponse {
  data: {
    id: string;
    name: string;
    tenantId: string;
    slug: string;
    createdAt: string;
    updatedAt: string;
  };
}

export async function createOrganization(
  name: string,
): Promise<CreateOrganizationResponse> {
  return apiClient
    .post('organizations', {
      json: toSnakeBody({ name }),
    })
    .json<CreateOrganizationResponse>();
}
