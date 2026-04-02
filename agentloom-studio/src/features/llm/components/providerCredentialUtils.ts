import type { LlmProviderEntity, UpdateLlmProviderInput } from "../types";

interface ProviderCredentialStateOptions {
  provider: LlmProviderEntity | null | undefined;
  apiKey: string;
  clearApiKey: boolean;
}

interface BuildProviderCredentialInputOptions extends ProviderCredentialStateOptions {
  baseUrl?: string | null;
  includeBaseUrl?: boolean;
}

export function hasStoredProviderApiKey(
  provider: LlmProviderEntity | null | undefined,
): boolean {
  return Boolean(provider?.apiKeyId);
}

export function hasEffectiveProviderApiKey(
  options: ProviderCredentialStateOptions,
): boolean {
  if (options.apiKey.trim().length > 0) {
    return true;
  }

  if (options.clearApiKey) {
    return false;
  }

  return hasStoredProviderApiKey(options.provider);
}

export function buildProviderCredentialInput(
  options: BuildProviderCredentialInputOptions,
): UpdateLlmProviderInput | null {
  if (!options.provider) {
    return null;
  }

  const input: UpdateLlmProviderInput = {};
  let hasChanges = false;

  if (options.includeBaseUrl) {
    const normalizedBaseUrl = options.baseUrl?.trim() ?? "";
    const currentBaseUrl = options.provider.baseUrl ?? "";

    if (normalizedBaseUrl !== currentBaseUrl) {
      input.baseUrl = normalizedBaseUrl.length > 0 ? normalizedBaseUrl : null;
      hasChanges = true;
    }
  }

  const normalizedApiKey = options.apiKey.trim();
  if (normalizedApiKey.length > 0) {
    input.apiKey = normalizedApiKey;
    hasChanges = true;
  } else if (options.clearApiKey && options.provider.apiKeyId) {
    input.clearApiKey = true;
    hasChanges = true;
  }

  return hasChanges ? input : null;
}
