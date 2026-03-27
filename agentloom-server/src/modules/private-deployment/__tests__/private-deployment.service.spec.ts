import {
  constants,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign as rsaSign,
} from 'node:crypto';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ZodError } from 'zod';
import { PrivateDeploymentService } from '../private-deployment.service';
import type { AuditLogService } from '../../evidence/audit-log.service';
import type {
  EncryptedData,
  EncryptionService,
} from '../../api-key/encryption.service';
import {
  InsufficientOrganizationPermissionException,
  OrganizationNotFoundException,
} from '../../organization/organization.exceptions';

const ORG_ID = '019577a0-0000-7000-8000-000000000901';
const OWNER_ID = '019577a0-0000-7000-8000-000000000902';
const ADMIN_ID = '019577a0-0000-7000-8000-000000000903';
const VIEWER_ID = '019577a0-0000-7000-8000-000000000904';
const TENANT_ID = '019577a0-0000-7000-8000-000000000905';
const NOW = new Date('2026-03-18T08:00:00.000Z');

let LICENSE_PRIVATE_KEY_PEM = '';
let LICENSE_PUBLIC_KEY_PEM = '';
let LICENSE_PUBLIC_KEY_FINGERPRINT = '';

function smtpPasswordSecretRef(organizationId = ORG_ID): string {
  return `private-deployment://organizations/${organizationId}/smtp/password`;
}

function llmProxyApiKeySecretRef(organizationId = ORG_ID): string {
  return `private-deployment://organizations/${organizationId}/llm-proxy/api-key`;
}

function createInsertChain(result: unknown[] = []) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function createUpdateChain(result: unknown[] = []) {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function makeEnvelope(seed: string): EncryptedData {
  return {
    encryptedKey: Buffer.from(`${seed}-encrypted-key`),
    encryptedDek: Buffer.from(`${seed}-encrypted-dek`),
    iv: Buffer.from(`${seed}-iv`),
    authTag: Buffer.from(`${seed}-auth-tag`),
  };
}

function makeOrganization(
  overrides: Partial<{
    id: string;
    tenantId: string;
  }> = {},
) {
  return {
    id: ORG_ID,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function makeMembership(
  overrides: Partial<{
    organizationId: string;
    userId: string;
    role: 'owner' | 'admin' | 'creator' | 'operator' | 'viewer';
  }> = {},
) {
  return {
    organizationId: ORG_ID,
    userId: OWNER_ID,
    role: 'owner' as const,
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<{
    id: string;
    organizationId: string;
    tenantId: string;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUsername: string | null;
    smtpFromEmail: string | null;
    smtpUseTls: boolean;
    smtpPasswordEncryptedKey: Buffer | null;
    smtpPasswordEncryptedDek: Buffer | null;
    smtpPasswordIv: Buffer | null;
    smtpPasswordAuthTag: Buffer | null;
    privateCloudEndpointUrl: string | null;
    privateCloudAuthMethod: 'none' | 'api_key';
    privateCloudAllowExternalEgress: boolean;
    privateCloudApiKeyEncryptedKey: Buffer | null;
    privateCloudApiKeyEncryptedDek: Buffer | null;
    privateCloudApiKeyIv: Buffer | null;
    privateCloudApiKeyAuthTag: Buffer | null;
    certificateSource: 'none' | 'uploaded' | 'tls_secret_ref';
    certificateTlsSecretRef: string | null;
    certificateExpiresAt: Date | null;
    certificatePemEncryptedKey: Buffer | null;
    certificatePemEncryptedDek: Buffer | null;
    certificatePemIv: Buffer | null;
    certificatePemAuthTag: Buffer | null;
    certificatePrivateKeyEncryptedKey: Buffer | null;
    certificatePrivateKeyEncryptedDek: Buffer | null;
    certificatePrivateKeyIv: Buffer | null;
    certificatePrivateKeyAuthTag: Buffer | null;
    licenseKeyEncryptedKey: Buffer | null;
    licenseKeyEncryptedDek: Buffer | null;
    licenseKeyIv: Buffer | null;
    licenseKeyAuthTag: Buffer | null;
    version: number;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: '019577a0-0000-7000-8000-000000000906',
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    smtpHost: 'smtp.internal.local',
    smtpPort: 587,
    smtpUsername: 'mailer',
    smtpFromEmail: 'noreply@example.com',
    smtpUseTls: true,
    smtpPasswordEncryptedKey: makeEnvelope('smtp').encryptedKey,
    smtpPasswordEncryptedDek: makeEnvelope('smtp').encryptedDek,
    smtpPasswordIv: makeEnvelope('smtp').iv,
    smtpPasswordAuthTag: makeEnvelope('smtp').authTag,
    privateCloudEndpointUrl: 'https://proxy.internal.local',
    privateCloudAuthMethod: 'api_key' as const,
    privateCloudAllowExternalEgress: false,
    privateCloudApiKeyEncryptedKey: makeEnvelope('llm').encryptedKey,
    privateCloudApiKeyEncryptedDek: makeEnvelope('llm').encryptedDek,
    privateCloudApiKeyIv: makeEnvelope('llm').iv,
    privateCloudApiKeyAuthTag: makeEnvelope('llm').authTag,
    certificateSource: 'uploaded' as const,
    certificateTlsSecretRef: null,
    certificateExpiresAt: new Date('2026-09-01T00:00:00.000Z'),
    certificatePemEncryptedKey: makeEnvelope('cert-pem').encryptedKey,
    certificatePemEncryptedDek: makeEnvelope('cert-pem').encryptedDek,
    certificatePemIv: makeEnvelope('cert-pem').iv,
    certificatePemAuthTag: makeEnvelope('cert-pem').authTag,
    certificatePrivateKeyEncryptedKey: makeEnvelope('cert').encryptedKey,
    certificatePrivateKeyEncryptedDek: makeEnvelope('cert').encryptedDek,
    certificatePrivateKeyIv: makeEnvelope('cert').iv,
    certificatePrivateKeyAuthTag: makeEnvelope('cert').authTag,
    licenseKeyEncryptedKey: null,
    licenseKeyEncryptedDek: null,
    licenseKeyIv: null,
    licenseKeyAuthTag: null,
    version: 1,
    createdBy: OWNER_ID,
    updatedBy: OWNER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createLicenseKey(
  payloadOverrides: Partial<{
    organizationId: string;
    issuedTo: string;
    expiresAt: string;
  }> = {},
): string {
  const payload = JSON.stringify({
    organizationId: ORG_ID,
    issuedTo: 'Acme Private Cluster',
    expiresAt: '2026-12-31T00:00:00.000Z',
    ...payloadOverrides,
  });
  const signature = rsaSign('sha256', Buffer.from(payload), {
    key: LICENSE_PRIVATE_KEY_PEM,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString('base64');

  return JSON.stringify({ payload, signature });
}

describe('PrivateDeploymentService', () => {
  let service: PrivateDeploymentService;
  let db: {
    query: {
      organizations: { findFirst: ReturnType<typeof vi.fn> };
      organizationMembers: { findFirst: ReturnType<typeof vi.fn> };
      privateDeploymentSettings: { findFirst: ReturnType<typeof vi.fn> };
    };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let auditLogService: { record: ReturnType<typeof vi.fn> };
  let encryptionService: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeAll(() => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    LICENSE_PRIVATE_KEY_PEM = privateKey;
    LICENSE_PUBLIC_KEY_PEM = publicKey;
    const publicKeyDer = createPublicKey(publicKey).export({
      type: 'spki',
      format: 'der',
    });
    LICENSE_PUBLIC_KEY_FINGERPRINT = createHash('sha256')
      .update(publicKeyDer)
      .digest('hex');
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    db = {
      query: {
        organizations: { findFirst: vi.fn() },
        organizationMembers: { findFirst: vi.fn() },
        privateDeploymentSettings: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    auditLogService = {
      record: vi.fn().mockResolvedValue(null),
    };

    encryptionService = {
      encrypt: vi
        .fn()
        .mockImplementation((plaintext: string) => makeEnvelope(plaintext)),
      decrypt: vi.fn(),
    };

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'APP_DEPLOYMENT_MODE') {
          return 'private';
        }

        if (key === 'APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY') {
          return LICENSE_PUBLIC_KEY_PEM;
        }

        return undefined;
      }),
    };

    service = new PrivateDeploymentService(
      db as unknown as ConstructorParameters<
        typeof PrivateDeploymentService
      >[0],
      auditLogService as unknown as AuditLogService,
      encryptionService as unknown as EncryptionService,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSettings', () => {
    it('returns default settings with env-derived deployment mode when no row exists', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(null);

      await expect(service.getSettings(ORG_ID, OWNER_ID)).resolves.toEqual({
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        deploymentMode: 'private',
        version: 0,
        smtp: {
          host: null,
          port: null,
          username: null,
          fromEmail: null,
          passwordSecretRef: null,
          useTls: false,
        },
        llmProxy: {
          mode: 'direct',
          baseUrl: null,
          apiKeySecretRef: null,
          allowExternalEgress: false,
        },
        certificates: {
          source: 'ingress-managed',
          tlsSecretRef: null,
          expiresAt: null,
        },
        license: {
          status: 'missing',
          fingerprint: null,
          expiresAt: null,
          lastVerifiedAt: null,
        },
      });
    });

    it('allows admin members to read organization settings', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership({ userId: ADMIN_ID, role: 'admin' }),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings(),
      );

      await expect(service.getSettings(ORG_ID, ADMIN_ID)).resolves.toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          deploymentMode: 'private',
          version: 1,
          llmProxy: expect.objectContaining({ mode: 'private_cloud' }),
          certificates: expect.objectContaining({
            source: 'uploaded',
            expiresAt: '2026-09-01T00:00:00.000Z',
          }),
          smtp: expect.objectContaining({
            passwordSecretRef: smtpPasswordSecretRef(),
          }),
        }),
      );
    });

    it('throws when the target organization does not exist', async () => {
      db.query.organizations.findFirst.mockResolvedValue(null);

      await expect(
        service.getSettings(ORG_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(OrganizationNotFoundException);
    });

    it('rejects members without owner/admin permission', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership({ userId: VIEWER_ID, role: 'viewer' }),
      );

      await expect(
        service.getSettings(ORG_ID, VIEWER_ID),
      ).rejects.toBeInstanceOf(InsufficientOrganizationPermissionException);
    });

    it('returns license status missing when no license key is stored', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings({
          licenseKeyEncryptedKey: null,
          licenseKeyEncryptedDek: null,
          licenseKeyIv: null,
          licenseKeyAuthTag: null,
        }),
      );

      await expect(service.getSettings(ORG_ID, OWNER_ID)).resolves.toEqual(
        expect.objectContaining({
          license: {
            status: 'missing',
            fingerprint: null,
            expiresAt: null,
            lastVerifiedAt: null,
          },
        }),
      );
    });

    it('returns license status valid with fingerprint and verification metadata', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings({
          licenseKeyEncryptedKey: makeEnvelope('license').encryptedKey,
          licenseKeyEncryptedDek: makeEnvelope('license').encryptedDek,
          licenseKeyIv: makeEnvelope('license').iv,
          licenseKeyAuthTag: makeEnvelope('license').authTag,
        }),
      );
      encryptionService.decrypt.mockReturnValue(createLicenseKey());

      await expect(service.getSettings(ORG_ID, OWNER_ID)).resolves.toEqual(
        expect.objectContaining({
          license: {
            status: 'valid',
            fingerprint: LICENSE_PUBLIC_KEY_FINGERPRINT,
            expiresAt: '2026-12-31T00:00:00.000Z',
            lastVerifiedAt: NOW.toISOString(),
          },
        }),
      );
    });

    it('returns license status invalid when verification fails', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings({
          licenseKeyEncryptedKey: makeEnvelope('license').encryptedKey,
          licenseKeyEncryptedDek: makeEnvelope('license').encryptedDek,
          licenseKeyIv: makeEnvelope('license').iv,
          licenseKeyAuthTag: makeEnvelope('license').authTag,
        }),
      );
      encryptionService.decrypt.mockReturnValue(
        JSON.stringify({
          payload: JSON.stringify({
            organizationId: ORG_ID,
            expiresAt: '2026-12-31T00:00:00.000Z',
          }),
          signature: 'invalid-signature',
        }),
      );

      await expect(service.getSettings(ORG_ID, OWNER_ID)).resolves.toEqual(
        expect.objectContaining({
          license: {
            status: 'invalid',
            fingerprint: LICENSE_PUBLIC_KEY_FINGERPRINT,
            expiresAt: null,
            lastVerifiedAt: NOW.toISOString(),
          },
        }),
      );
    });

    it('returns license status expired when the signature is valid but the license is past due', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings({
          licenseKeyEncryptedKey: makeEnvelope('license').encryptedKey,
          licenseKeyEncryptedDek: makeEnvelope('license').encryptedDek,
          licenseKeyIv: makeEnvelope('license').iv,
          licenseKeyAuthTag: makeEnvelope('license').authTag,
        }),
      );
      encryptionService.decrypt.mockReturnValue(
        createLicenseKey({ expiresAt: '2026-03-01T00:00:00.000Z' }),
      );

      await expect(service.getSettings(ORG_ID, OWNER_ID)).resolves.toEqual(
        expect.objectContaining({
          license: {
            status: 'expired',
            fingerprint: LICENSE_PUBLIC_KEY_FINGERPRINT,
            expiresAt: '2026-03-01T00:00:00.000Z',
            lastVerifiedAt: NOW.toISOString(),
          },
        }),
      );
    });
  });

  describe('updateSettings', () => {
    it('creates a new settings row on first update', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(null);
      db.insert.mockReturnValue(
        createInsertChain([
          makeSettings({
            version: 1,
            updatedBy: OWNER_ID,
          }),
        ]),
      );

      await expect(
        service.updateSettings(
          ORG_ID,
          {
            smtp: {
              host: 'smtp.internal.local',
              port: 587,
              username: 'mailer',
              fromEmail: 'noreply@example.com',
              passwordSecretRef: null,
              useTls: true,
              password: 'smtp-secret',
            },
            llmProxy: {
              mode: 'private_cloud',
              baseUrl: 'https://proxy.internal.local',
              apiKeySecretRef: null,
              allowExternalEgress: false,
              apiKey: 'llm-secret',
            },
            certificates: {
              source: 'uploaded',
              tlsSecretRef: null,
              expiresAt: '2026-09-01T00:00:00.000Z',
              certificatePem:
                '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
              privateKeyPem:
                '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
            },
          },
          OWNER_ID,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          deploymentMode: 'private',
          version: 1,
          smtp: expect.objectContaining({
            useTls: true,
            passwordSecretRef: smtpPasswordSecretRef(),
          }),
          llmProxy: expect.objectContaining({
            mode: 'private_cloud',
            baseUrl: 'https://proxy.internal.local',
            apiKeySecretRef: llmProxyApiKeySecretRef(),
            allowExternalEgress: false,
          }),
          certificates: expect.objectContaining({
            source: 'uploaded',
            tlsSecretRef: null,
            expiresAt: '2026-09-01T00:00:00.000Z',
          }),
          license: expect.objectContaining({ status: 'missing' }),
        }),
      );

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('updates the existing row and increments the version', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings({ version: 2 }),
      );
      db.update.mockReturnValue(
        createUpdateChain([
          makeSettings({
            smtpHost: 'smtp.backup.local',
            smtpUseTls: false,
            privateCloudEndpointUrl: 'https://proxy.backup.local',
            privateCloudAllowExternalEgress: true,
            certificateSource: 'tls_secret_ref',
            certificateTlsSecretRef: 'ingress/proxy-cert',
            certificateExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
            certificatePemEncryptedKey: null,
            certificatePemEncryptedDek: null,
            certificatePemIv: null,
            certificatePemAuthTag: null,
            certificatePrivateKeyEncryptedKey: null,
            certificatePrivateKeyEncryptedDek: null,
            certificatePrivateKeyIv: null,
            certificatePrivateKeyAuthTag: null,
            version: 3,
            updatedBy: OWNER_ID,
            updatedAt: new Date('2026-03-18T08:05:00.000Z'),
          }),
        ]),
      );

      await expect(
        service.updateSettings(
          ORG_ID,
          {
            smtp: {
              host: 'smtp.backup.local',
              port: 2525,
              username: 'mailer-2',
              fromEmail: 'ops@example.com',
              passwordSecretRef: null,
              useTls: false,
              password: 'smtp-secret-2',
            },
            llmProxy: {
              mode: 'enterprise_proxy',
              baseUrl: 'https://proxy.backup.local',
              apiKeySecretRef: null,
              allowExternalEgress: true,
              apiKey: 'llm-secret-2',
            },
            certificates: {
              source: 'secretRef',
              tlsSecretRef: 'ingress/proxy-cert',
              expiresAt: '2026-10-01T00:00:00.000Z',
              certificatePem: null,
              privateKeyPem: null,
            },
          },
          OWNER_ID,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          version: 3,
          updatedBy: OWNER_ID,
          smtp: expect.objectContaining({
            useTls: false,
            passwordSecretRef: smtpPasswordSecretRef(),
          }),
          llmProxy: expect.objectContaining({
            mode: 'enterprise_proxy',
            baseUrl: 'https://proxy.backup.local',
            apiKeySecretRef: llmProxyApiKeySecretRef(),
            allowExternalEgress: true,
          }),
          certificates: expect.objectContaining({
            source: 'secretRef',
            tlsSecretRef: 'ingress/proxy-cert',
            expiresAt: '2026-10-01T00:00:00.000Z',
          }),
        }),
      );

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('rejects enterprise_proxy mode without a baseUrl', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );

      const error = await service
        .updateSettings(
          ORG_ID,
          {
            llmProxy: {
              mode: 'enterprise_proxy',
              baseUrl: null,
              apiKeySecretRef: null,
              allowExternalEgress: true,
              apiKey: 'llm-secret',
            },
          },
          OWNER_ID,
        )
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ZodError);
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['llmProxy', 'baseUrl'],
            message: 'LLM 代理地址不能为空',
          }),
        ]),
      );
    });

    it('rejects private_cloud mode without a baseUrl', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );

      const error = await service
        .updateSettings(
          ORG_ID,
          {
            llmProxy: {
              mode: 'private_cloud',
              baseUrl: null,
              apiKeySecretRef: null,
              allowExternalEgress: false,
              apiKey: 'llm-secret',
            },
          },
          OWNER_ID,
        )
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ZodError);
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['llmProxy', 'baseUrl'],
            message: 'LLM 代理地址不能为空',
          }),
        ]),
      );
    });

    it('rejects secretRef certificates without tlsSecretRef', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );

      const error = await service
        .updateSettings(
          ORG_ID,
          {
            certificates: {
              source: 'secretRef',
              tlsSecretRef: null,
              expiresAt: null,
              certificatePem: null,
              privateKeyPem: null,
            },
          },
          OWNER_ID,
        )
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ZodError);
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['certificates', 'tlsSecretRef'],
            message: 'TLS Secret 引用不能为空',
          }),
        ]),
      );
    });

    it('rejects invalid opaque secret references instead of silently keeping existing secrets', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );

      const error = await service
        .updateSettings(
          ORG_ID,
          {
            smtp: {
              host: 'smtp.internal.local',
              port: 587,
              username: 'mailer',
              fromEmail: 'noreply@example.com',
              passwordSecretRef:
                'private-deployment://organizations/not-a-uuid/smtp/password',
              useTls: true,
              password: undefined,
            },
            llmProxy: {
              mode: 'private_cloud',
              baseUrl: 'https://proxy.internal.local',
              apiKeySecretRef:
                'private-deployment://organizations/not-a-uuid/llm-proxy/api-key',
              allowExternalEgress: false,
              apiKey: undefined,
            },
          },
          OWNER_ID,
        )
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ZodError);
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['smtp', 'passwordSecretRef'],
            message: 'SMTP 密码引用格式不正确',
          }),
        ]),
      );
    });

    it('rejects opaque secret references that do not belong to the current organization', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings(),
      );

      const error = await service
        .updateSettings(
          ORG_ID,
          {
            smtp: {
              host: 'smtp.internal.local',
              port: 587,
              username: 'mailer',
              fromEmail: 'noreply@example.com',
              passwordSecretRef:
                'private-deployment://organizations/019577a0-0000-7000-8000-000000000999/smtp/password',
              useTls: true,
              password: undefined,
            },
            llmProxy: {
              mode: 'private_cloud',
              baseUrl: 'https://proxy.internal.local',
              apiKeySecretRef:
                'private-deployment://organizations/019577a0-0000-7000-8000-000000000999/llm-proxy/api-key',
              allowExternalEgress: false,
              apiKey: undefined,
            },
          },
          OWNER_ID,
        )
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('私有部署 secret 引用必须属于当前组织');
      expect(db.update).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('encrypts SMTP password, LLM API key, certificate, and certificate private key before persistence', async () => {
      const insertChain = createInsertChain([makeSettings()]);

      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(null);
      db.insert.mockReturnValue(insertChain);

      await service.updateSettings(
        ORG_ID,
        {
          smtp: {
            host: 'smtp.internal.local',
            port: 587,
            username: 'mailer',
            fromEmail: 'noreply@example.com',
            passwordSecretRef: null,
            useTls: true,
            password: 'smtp-secret',
          },
          llmProxy: {
            mode: 'private_cloud',
            baseUrl: 'https://proxy.internal.local',
            apiKeySecretRef: null,
            allowExternalEgress: false,
            apiKey: 'llm-secret',
          },
          certificates: {
            source: 'uploaded',
            tlsSecretRef: null,
            expiresAt: '2026-09-01T00:00:00.000Z',
            certificatePem:
              '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
            privateKeyPem:
              '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
          },
        },
        OWNER_ID,
      );

      expect(encryptionService.encrypt).toHaveBeenCalledWith('smtp-secret');
      expect(encryptionService.encrypt).toHaveBeenCalledWith('llm-secret');
      expect(encryptionService.encrypt).toHaveBeenCalledWith(
        '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      );
      expect(encryptionService.encrypt).toHaveBeenCalledWith(
        '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
      );
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          smtpPasswordEncryptedKey: makeEnvelope('smtp-secret').encryptedKey,
          privateCloudApiKeyEncryptedKey:
            makeEnvelope('llm-secret').encryptedKey,
          certificatePemEncryptedKey: makeEnvelope(
            '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
          ).encryptedKey,
          certificatePrivateKeyEncryptedKey: makeEnvelope(
            '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
          ).encryptedKey,
        }),
      );
    });

    it('redacts plaintext secrets from the response DTO', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(null);
      db.insert.mockReturnValue(createInsertChain([makeSettings()]));

      const result = await service.updateSettings(
        ORG_ID,
        {
          smtp: {
            host: 'smtp.internal.local',
            port: 587,
            username: 'mailer',
            fromEmail: 'noreply@example.com',
            passwordSecretRef: null,
            useTls: true,
            password: 'smtp-secret',
          },
          llmProxy: {
            mode: 'private_cloud',
            baseUrl: 'https://proxy.internal.local',
            apiKeySecretRef: null,
            allowExternalEgress: true,
            apiKey: 'llm-secret',
          },
          certificates: {
            source: 'uploaded',
            tlsSecretRef: null,
            expiresAt: '2026-09-01T00:00:00.000Z',
            certificatePem:
              '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
            privateKeyPem:
              '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
          },
          license: {
            licenseKey: createLicenseKey(),
          },
        },
        OWNER_ID,
      );

      expect(result.smtp).not.toHaveProperty('password');
      expect(result.smtp).not.toHaveProperty('hasPassword');
      expect(result.llmProxy).not.toHaveProperty('apiKey');
      expect(result.llmProxy).not.toHaveProperty('hasApiKey');
      expect(result.certificates).not.toHaveProperty('certificatePem');
      expect(result.certificates).not.toHaveProperty('certPem');
      expect(result.certificates).not.toHaveProperty('privateKeyPem');
      expect(result.certificates).not.toHaveProperty('hasCertificate');
      expect(result.certificates).not.toHaveProperty('hasPrivateKey');
      expect(result.license).not.toHaveProperty('licenseKey');
      expect(result.smtp.passwordSecretRef).toBe(smtpPasswordSecretRef());
      expect(result.llmProxy.apiKeySecretRef).toBe(llmProxyApiKeySecretRef());
      expect(result.license).toEqual(
        expect.objectContaining({
          status: 'valid',
          fingerprint: LICENSE_PUBLIC_KEY_FINGERPRINT,
        }),
      );
    });

    it('records an organization-scoped audit log with redacted before/after payloads', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.privateDeploymentSettings.findFirst.mockResolvedValue(
        makeSettings({ version: 2 }),
      );
      db.update.mockReturnValue(
        createUpdateChain([
          makeSettings({
            version: 3,
            updatedAt: new Date('2026-03-18T08:10:00.000Z'),
          }),
        ]),
      );

      await service.updateSettings(
        ORG_ID,
        {
          smtp: {
            host: 'smtp.internal.local',
            port: 587,
            username: 'mailer',
            fromEmail: 'noreply@example.com',
            passwordSecretRef: null,
            useTls: true,
            password: 'smtp-secret',
          },
          llmProxy: {
            mode: 'private_cloud',
            baseUrl: 'https://proxy.internal.local',
            apiKeySecretRef: null,
            allowExternalEgress: false,
            apiKey: 'llm-secret',
          },
          certificates: {
            source: 'uploaded',
            tlsSecretRef: null,
            expiresAt: '2026-09-01T00:00:00.000Z',
            certificatePem:
              '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
            privateKeyPem:
              '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
          },
        },
        OWNER_ID,
      );

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: OWNER_ID,
          actorType: 'user',
          eventType: 'organization.private-deployment.updated',
          resourceType: 'organization',
          resourceId: ORG_ID,
          summary: 'Organization private deployment settings updated',
          before: expect.objectContaining({
            deploymentMode: 'private',
            smtp: expect.objectContaining({
              useTls: true,
              passwordSecretRef: smtpPasswordSecretRef(),
            }),
            llmProxy: expect.objectContaining({
              mode: 'private_cloud',
              allowExternalEgress: false,
              apiKeySecretRef: llmProxyApiKeySecretRef(),
            }),
            certificates: expect.objectContaining({
              source: 'uploaded',
              expiresAt: '2026-09-01T00:00:00.000Z',
            }),
          }),
          after: expect.objectContaining({
            deploymentMode: 'private',
            smtp: expect.objectContaining({
              useTls: true,
              passwordSecretRef: smtpPasswordSecretRef(),
            }),
            llmProxy: expect.objectContaining({
              mode: 'private_cloud',
              allowExternalEgress: false,
              apiKeySecretRef: llmProxyApiKeySecretRef(),
            }),
            certificates: expect.objectContaining({
              source: 'uploaded',
              expiresAt: '2026-09-01T00:00:00.000Z',
            }),
            license: expect.objectContaining({ status: 'missing' }),
          }),
          metadata: expect.objectContaining({
            deploymentMode: 'private',
            version: 3,
          }),
        }),
      );

      const auditInput = auditLogService.record.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(auditInput.before).not.toHaveProperty('smtp.password');
      expect(auditInput.after).not.toHaveProperty('llmProxy.apiKey');
      expect(auditInput.after).not.toHaveProperty(
        'certificates.certificatePem',
      );
      expect(auditInput.after).not.toHaveProperty('certificates.privateKeyPem');
      expect(auditInput.after).not.toHaveProperty('license.licenseKey');
    });
  });
});
