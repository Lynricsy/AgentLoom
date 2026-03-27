import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';
import {
  constants,
  createHash,
  createPublicKey,
  type KeyObject,
  verify as verifySignature,
} from 'node:crypto';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  organizationMembers,
  organizations,
  privateDeploymentSettings,
  type PrivateDeploymentSetting,
} from '../../database/schema';
import {
  type EncryptedData,
  EncryptionService,
} from '../api-key/encryption.service';
import { AuditLogService } from '../evidence/audit-log.service';
import {
  InsufficientOrganizationPermissionException,
  OrganizationNotFoundException,
} from '../organization/organization.exceptions';
import type {
  DeploymentMode,
  PrivateDeploymentCertificateSource,
  PrivateDeploymentLicenseDto,
  PrivateDeploymentLicenseStatus,
  PrivateDeploymentLlmProxyMode,
  PrivateDeploymentResponseDto,
} from './dto/private-deployment-response.dto';
import {
  UpdatePrivateDeploymentSettingsSchema,
  type UpdatePrivateDeploymentSettingsDto,
} from './dto/update-private-deployment-settings.dto';

const PRIVATE_DEPLOYMENT_ADMIN_ROLES = ['owner', 'admin'] as const;

type PrivateCloudAuthMethod = 'none' | 'api_key';
type PrivateDeploymentPersistenceCertificateSource =
  | 'none'
  | 'uploaded'
  | 'tls_secret_ref';

interface AccessibleOrganization {
  id: string;
  tenantId: string;
}

interface LicenseTokenEnvelope {
  payload: string;
  signature: string;
}

interface LicensePayload {
  organizationId?: string;
  issuedTo?: string;
  expiresAt?: string;
}

interface NullableEncryptedData {
  encryptedKey: Buffer | null;
  encryptedDek: Buffer | null;
  iv: Buffer | null;
  authTag: Buffer | null;
}

interface PrivateDeploymentRecordLike {
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
  privateCloudAuthMethod: PrivateCloudAuthMethod;
  privateCloudAllowExternalEgress: boolean;
  privateCloudApiKeyEncryptedKey: Buffer | null;
  privateCloudApiKeyEncryptedDek: Buffer | null;
  privateCloudApiKeyIv: Buffer | null;
  privateCloudApiKeyAuthTag: Buffer | null;
  certificateSource: PrivateDeploymentPersistenceCertificateSource;
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
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function isPrivateKeyPem(pem: string): boolean {
  return /BEGIN [A-Z0-9 ]*PRIVATE KEY/.test(pem);
}

@Injectable()
export class PrivateDeploymentService {
  private readonly logger = new Logger(PrivateDeploymentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(AuditLogService)
    @Optional()
    private readonly auditLogService: AuditLogService | undefined,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async getSettings(
    organizationId: string,
    userId: string,
  ): Promise<PrivateDeploymentResponseDto> {
    const organization = await this.ensureOrganizationAccess(
      organizationId,
      userId,
    );
    const stored =
      await this.tenantDb.query.privateDeploymentSettings.findFirst({
        where: eq(privateDeploymentSettings.organizationId, organizationId),
      });

    return this.toResponseDto(stored ?? this.createDefaultRecord(organization));
  }

  async updateSettings(
    organizationId: string,
    dto: UpdatePrivateDeploymentSettingsDto,
    userId: string,
  ): Promise<PrivateDeploymentResponseDto> {
    const organization = await this.ensureOrganizationAccess(
      organizationId,
      userId,
    );
    const validated = UpdatePrivateDeploymentSettingsSchema.parse(dto);
    const existing =
      await this.tenantDb.query.privateDeploymentSettings.findFirst({
        where: eq(privateDeploymentSettings.organizationId, organizationId),
      });

    const beforeRecord = existing ?? this.createDefaultRecord(organization);
    const beforeResponse = await this.toResponseDto(beforeRecord);
    const nextRecord = this.buildNextRecord(beforeRecord, validated);
    const licenseOverride = validated.license?.licenseKey ?? undefined;

    if (!existing) {
      const [created] = await this.tenantDb
        .insert(privateDeploymentSettings)
        .values({
          organizationId,
          tenantId: organization.tenantId,
          ...this.toPersistencePayload(nextRecord),
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      const afterRecord = this.withReturnedMetadata(nextRecord, created);
      const response = await this.toResponseDto(afterRecord, licenseOverride);

      await this.recordAudit({
        tenantId: organization.tenantId,
        actorId: userId,
        eventType: 'organization.private-deployment.updated',
        resourceId: organizationId,
        summary: 'Organization private deployment settings updated',
        before: this.asAuditRecord(beforeResponse),
        after: this.asAuditRecord(response),
        metadata: {
          deploymentMode: response.deploymentMode,
          version: response.version,
        },
      });

      this.logger.log(
        `Created private deployment settings for ${organizationId}`,
      );
      return response;
    }

    const [updated] = await this.tenantDb
      .update(privateDeploymentSettings)
      .set({
        ...this.toPersistencePayload(nextRecord),
        updatedBy: userId,
        version: sql`${privateDeploymentSettings.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(privateDeploymentSettings.id, existing.id))
      .returning();

    const afterRecord = this.withReturnedMetadata(nextRecord, updated);
    const response = await this.toResponseDto(afterRecord, licenseOverride);

    await this.recordAudit({
      tenantId: organization.tenantId,
      actorId: userId,
      eventType: 'organization.private-deployment.updated',
      resourceId: organizationId,
      summary: 'Organization private deployment settings updated',
      before: this.asAuditRecord(beforeResponse),
      after: this.asAuditRecord(response),
      metadata: {
        deploymentMode: response.deploymentMode,
        version: response.version,
      },
    });

    this.logger.log(
      `Updated private deployment settings for ${organizationId}`,
    );
    return response;
  }

  private async ensureOrganizationAccess(
    organizationId: string,
    userId: string,
  ): Promise<AccessibleOrganization> {
    const organization = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: {
        id: true,
        tenantId: true,
      },
    });

    if (!organization) {
      throw new OrganizationNotFoundException();
    }

    const membership = await this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
      columns: {
        role: true,
      },
    });

    if (
      !membership ||
      !PRIVATE_DEPLOYMENT_ADMIN_ROLES.includes(
        membership.role as (typeof PRIVATE_DEPLOYMENT_ADMIN_ROLES)[number],
      )
    ) {
      throw new InsufficientOrganizationPermissionException();
    }

    return organization;
  }

  private createDefaultRecord(
    organization: AccessibleOrganization,
  ): PrivateDeploymentRecordLike {
    return {
      organizationId: organization.id,
      tenantId: organization.tenantId,
      smtpHost: null,
      smtpPort: null,
      smtpUsername: null,
      smtpFromEmail: null,
      smtpUseTls: false,
      smtpPasswordEncryptedKey: null,
      smtpPasswordEncryptedDek: null,
      smtpPasswordIv: null,
      smtpPasswordAuthTag: null,
      privateCloudEndpointUrl: null,
      privateCloudAuthMethod: 'none',
      privateCloudAllowExternalEgress: false,
      privateCloudApiKeyEncryptedKey: null,
      privateCloudApiKeyEncryptedDek: null,
      privateCloudApiKeyIv: null,
      privateCloudApiKeyAuthTag: null,
      certificateSource: 'none',
      certificateTlsSecretRef: null,
      certificateExpiresAt: null,
      certificatePemEncryptedKey: null,
      certificatePemEncryptedDek: null,
      certificatePemIv: null,
      certificatePemAuthTag: null,
      certificatePrivateKeyEncryptedKey: null,
      certificatePrivateKeyEncryptedDek: null,
      certificatePrivateKeyIv: null,
      certificatePrivateKeyAuthTag: null,
      licenseKeyEncryptedKey: null,
      licenseKeyEncryptedDek: null,
      licenseKeyIv: null,
      licenseKeyAuthTag: null,
      version: 0,
    };
  }

  private buildNextRecord(
    current: PrivateDeploymentRecordLike,
    dto: UpdatePrivateDeploymentSettingsDto,
  ): PrivateDeploymentRecordLike {
    const smtpPassword = this.resolveManagedSecret({
      plaintext: dto.smtp?.password,
      requestedSecretRef: dto.smtp?.passwordSecretRef,
      existing: this.getSmtpPasswordEnvelope(current),
      derivedSecretRef: this.buildSmtpPasswordSecretRef(current.organizationId),
    });

    const nextLlmMode = dto.llmProxy?.mode;
    const nextPrivateCloudAuthMethod = nextLlmMode
      ? this.toPrivateCloudAuthMethod(nextLlmMode)
      : current.privateCloudAuthMethod;
    const nextPrivateCloudAllowExternalEgress = dto.llmProxy
      ? nextLlmMode === 'enterprise_proxy'
        ? true
        : nextLlmMode === 'direct'
          ? false
          : dto.llmProxy.allowExternalEgress
      : current.privateCloudAllowExternalEgress;
    const llmApiKey = this.resolveManagedSecret({
      plaintext: nextLlmMode === 'direct' ? null : dto.llmProxy?.apiKey,
      requestedSecretRef:
        nextLlmMode === 'direct' ? null : dto.llmProxy?.apiKeySecretRef,
      existing: this.getPrivateCloudApiKeyEnvelope(current),
      derivedSecretRef: this.buildLlmProxyApiKeySecretRef(
        current.organizationId,
      ),
    });

    const nextCertificateSource = dto.certificates
      ? this.toPersistenceCertificateSource(dto.certificates.source)
      : current.certificateSource;
    const shouldClearCertificateMaterial = nextCertificateSource !== 'uploaded';
    const certificatePem = this.resolveEncryptedValue(
      shouldClearCertificateMaterial ? null : dto.certificates?.certificatePem,
      this.readEncryptedValue(this.getCertificatePemEnvelope(current)),
    );
    const certificatePrivateKey = this.resolveEncryptedValue(
      shouldClearCertificateMaterial ? null : dto.certificates?.privateKeyPem,
      this.readEncryptedValue(this.getCertificatePrivateKeyEnvelope(current)),
    );
    const licenseKey = this.resolveEncryptedValue(
      dto.license?.licenseKey,
      this.readEncryptedValue(this.getLicenseKeyEnvelope(current)),
    );

    return {
      ...current,
      smtpHost: dto.smtp ? dto.smtp.host : current.smtpHost,
      smtpPort: dto.smtp ? dto.smtp.port : current.smtpPort,
      smtpUsername: dto.smtp ? dto.smtp.username : current.smtpUsername,
      smtpFromEmail: dto.smtp ? dto.smtp.fromEmail : current.smtpFromEmail,
      smtpUseTls: dto.smtp ? dto.smtp.useTls : current.smtpUseTls,
      smtpPasswordEncryptedKey: smtpPassword.encryptedKey,
      smtpPasswordEncryptedDek: smtpPassword.encryptedDek,
      smtpPasswordIv: smtpPassword.iv,
      smtpPasswordAuthTag: smtpPassword.authTag,
      privateCloudEndpointUrl: dto.llmProxy
        ? dto.llmProxy.mode === 'direct'
          ? null
          : dto.llmProxy.baseUrl
        : current.privateCloudEndpointUrl,
      privateCloudAuthMethod: nextPrivateCloudAuthMethod,
      privateCloudAllowExternalEgress: nextPrivateCloudAllowExternalEgress,
      privateCloudApiKeyEncryptedKey: llmApiKey.encryptedKey,
      privateCloudApiKeyEncryptedDek: llmApiKey.encryptedDek,
      privateCloudApiKeyIv: llmApiKey.iv,
      privateCloudApiKeyAuthTag: llmApiKey.authTag,
      certificateSource: nextCertificateSource,
      certificateTlsSecretRef: dto.certificates
        ? dto.certificates.source === 'secretRef'
          ? dto.certificates.tlsSecretRef
          : null
        : current.certificateTlsSecretRef,
      certificateExpiresAt: dto.certificates
        ? this.toDateOrNull(dto.certificates.expiresAt)
        : current.certificateExpiresAt,
      certificatePemEncryptedKey: certificatePem.encryptedKey,
      certificatePemEncryptedDek: certificatePem.encryptedDek,
      certificatePemIv: certificatePem.iv,
      certificatePemAuthTag: certificatePem.authTag,
      certificatePrivateKeyEncryptedKey: certificatePrivateKey.encryptedKey,
      certificatePrivateKeyEncryptedDek: certificatePrivateKey.encryptedDek,
      certificatePrivateKeyIv: certificatePrivateKey.iv,
      certificatePrivateKeyAuthTag: certificatePrivateKey.authTag,
      licenseKeyEncryptedKey: licenseKey.encryptedKey,
      licenseKeyEncryptedDek: licenseKey.encryptedDek,
      licenseKeyIv: licenseKey.iv,
      licenseKeyAuthTag: licenseKey.authTag,
    };
  }

  private resolveManagedSecret(params: {
    plaintext: string | null | undefined;
    requestedSecretRef: string | null | undefined;
    existing: NullableEncryptedData;
    derivedSecretRef: string;
  }): NullableEncryptedData {
    if (params.plaintext !== undefined) {
      return this.resolveEncryptedValue(
        params.plaintext,
        this.readEncryptedValue(params.existing),
      );
    }

    if (params.requestedSecretRef === undefined) {
      return (
        this.readEncryptedValue(params.existing) ?? this.emptyEncryptedValue()
      );
    }

    if (params.requestedSecretRef === null) {
      return this.emptyEncryptedValue();
    }

    if (params.requestedSecretRef !== params.derivedSecretRef) {
      throw new BadRequestException('私有部署 secret 引用必须属于当前组织');
    }

    const existing = this.readEncryptedValue(params.existing);
    if (!existing) {
      return this.emptyEncryptedValue();
    }

    return existing;
  }

  private resolveEncryptedValue(
    plaintext: string | null | undefined,
    existing: NullableEncryptedData | null,
  ): NullableEncryptedData {
    if (plaintext === undefined) {
      return existing ?? this.emptyEncryptedValue();
    }

    if (plaintext === null) {
      return this.emptyEncryptedValue();
    }

    return this.encryptionService.encrypt(plaintext);
  }

  private readEncryptedValue(
    data: NullableEncryptedData,
  ): EncryptedData | null {
    if (!this.hasEncryptedValue(data)) {
      return null;
    }

    return data;
  }

  private hasEncryptedValue(
    data: Partial<NullableEncryptedData>,
  ): data is EncryptedData {
    return Boolean(
      data.encryptedKey && data.encryptedDek && data.iv && data.authTag,
    );
  }

  private emptyEncryptedValue(): NullableEncryptedData {
    return {
      encryptedKey: null,
      encryptedDek: null,
      iv: null,
      authTag: null,
    };
  }

  private getSmtpPasswordEnvelope(
    record: PrivateDeploymentRecordLike,
  ): NullableEncryptedData {
    return {
      encryptedKey: record.smtpPasswordEncryptedKey,
      encryptedDek: record.smtpPasswordEncryptedDek,
      iv: record.smtpPasswordIv,
      authTag: record.smtpPasswordAuthTag,
    };
  }

  private getPrivateCloudApiKeyEnvelope(
    record: PrivateDeploymentRecordLike,
  ): NullableEncryptedData {
    return {
      encryptedKey: record.privateCloudApiKeyEncryptedKey,
      encryptedDek: record.privateCloudApiKeyEncryptedDek,
      iv: record.privateCloudApiKeyIv,
      authTag: record.privateCloudApiKeyAuthTag,
    };
  }

  private getCertificatePemEnvelope(
    record: PrivateDeploymentRecordLike,
  ): NullableEncryptedData {
    return {
      encryptedKey: record.certificatePemEncryptedKey,
      encryptedDek: record.certificatePemEncryptedDek,
      iv: record.certificatePemIv,
      authTag: record.certificatePemAuthTag,
    };
  }

  private getCertificatePrivateKeyEnvelope(
    record: PrivateDeploymentRecordLike,
  ): NullableEncryptedData {
    return {
      encryptedKey: record.certificatePrivateKeyEncryptedKey,
      encryptedDek: record.certificatePrivateKeyEncryptedDek,
      iv: record.certificatePrivateKeyIv,
      authTag: record.certificatePrivateKeyAuthTag,
    };
  }

  private getLicenseKeyEnvelope(
    record: PrivateDeploymentRecordLike,
  ): NullableEncryptedData {
    return {
      encryptedKey: record.licenseKeyEncryptedKey,
      encryptedDek: record.licenseKeyEncryptedDek,
      iv: record.licenseKeyIv,
      authTag: record.licenseKeyAuthTag,
    };
  }

  private toPersistencePayload(record: PrivateDeploymentRecordLike) {
    return {
      smtpHost: record.smtpHost,
      smtpPort: record.smtpPort,
      smtpUsername: record.smtpUsername,
      smtpFromEmail: record.smtpFromEmail,
      smtpUseTls: record.smtpUseTls,
      smtpPasswordEncryptedKey: record.smtpPasswordEncryptedKey,
      smtpPasswordEncryptedDek: record.smtpPasswordEncryptedDek,
      smtpPasswordIv: record.smtpPasswordIv,
      smtpPasswordAuthTag: record.smtpPasswordAuthTag,
      privateCloudEndpointUrl: record.privateCloudEndpointUrl,
      privateCloudAuthMethod: record.privateCloudAuthMethod,
      privateCloudAllowExternalEgress: record.privateCloudAllowExternalEgress,
      privateCloudApiKeyEncryptedKey: record.privateCloudApiKeyEncryptedKey,
      privateCloudApiKeyEncryptedDek: record.privateCloudApiKeyEncryptedDek,
      privateCloudApiKeyIv: record.privateCloudApiKeyIv,
      privateCloudApiKeyAuthTag: record.privateCloudApiKeyAuthTag,
      certificateSource: record.certificateSource,
      certificateTlsSecretRef: record.certificateTlsSecretRef,
      certificateExpiresAt: record.certificateExpiresAt,
      certificatePemEncryptedKey: record.certificatePemEncryptedKey,
      certificatePemEncryptedDek: record.certificatePemEncryptedDek,
      certificatePemIv: record.certificatePemIv,
      certificatePemAuthTag: record.certificatePemAuthTag,
      certificatePrivateKeyEncryptedKey:
        record.certificatePrivateKeyEncryptedKey,
      certificatePrivateKeyEncryptedDek:
        record.certificatePrivateKeyEncryptedDek,
      certificatePrivateKeyIv: record.certificatePrivateKeyIv,
      certificatePrivateKeyAuthTag: record.certificatePrivateKeyAuthTag,
      licenseKeyEncryptedKey: record.licenseKeyEncryptedKey,
      licenseKeyEncryptedDek: record.licenseKeyEncryptedDek,
      licenseKeyIv: record.licenseKeyIv,
      licenseKeyAuthTag: record.licenseKeyAuthTag,
    };
  }

  private withReturnedMetadata(
    record: PrivateDeploymentRecordLike,
    persisted: PrivateDeploymentSetting,
  ): PrivateDeploymentRecordLike {
    return {
      ...record,
      version: persisted.version,
      createdBy: persisted.createdBy,
      updatedBy: persisted.updatedBy,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
    };
  }

  private async toResponseDto(
    record: PrivateDeploymentRecordLike,
    licenseKeyOverride?: string | null,
  ): Promise<PrivateDeploymentResponseDto> {
    return {
      organizationId: record.organizationId,
      tenantId: record.tenantId,
      deploymentMode: this.getDeploymentMode(),
      smtp: {
        host: record.smtpHost,
        port: record.smtpPort,
        username: record.smtpUsername,
        passwordSecretRef: this.hasEncryptedValue(
          this.getSmtpPasswordEnvelope(record),
        )
          ? this.buildSmtpPasswordSecretRef(record.organizationId)
          : null,
        fromEmail: record.smtpFromEmail,
        useTls: record.smtpUseTls,
      },
      llmProxy: {
        mode: this.toLlmProxyMode(
          record.privateCloudAuthMethod,
          record.privateCloudAllowExternalEgress,
        ),
        baseUrl:
          record.privateCloudAuthMethod === 'none'
            ? null
            : record.privateCloudEndpointUrl,
        apiKeySecretRef: this.hasEncryptedValue(
          this.getPrivateCloudApiKeyEnvelope(record),
        )
          ? this.buildLlmProxyApiKeySecretRef(record.organizationId)
          : null,
        allowExternalEgress: record.privateCloudAllowExternalEgress,
      },
      certificates: {
        source: this.toPublicCertificateSource(record.certificateSource),
        tlsSecretRef: record.certificateTlsSecretRef,
        expiresAt: record.certificateExpiresAt?.toISOString() ?? null,
      },
      license: this.resolveLicenseMetadata(record, licenseKeyOverride),
      version: record.version,
      ...(record.createdBy ? { createdBy: record.createdBy } : {}),
      ...(record.updatedBy ? { updatedBy: record.updatedBy } : {}),
      ...(record.createdAt
        ? { createdAt: record.createdAt.toISOString() }
        : {}),
      ...(record.updatedAt
        ? { updatedAt: record.updatedAt.toISOString() }
        : {}),
    };
  }

  private resolveLicenseMetadata(
    record: PrivateDeploymentRecordLike,
    licenseKeyOverride?: string | null,
  ): PrivateDeploymentLicenseDto {
    const fingerprint = this.getLicenseFingerprint();
    const lastVerifiedAt = new Date().toISOString();
    const rawLicense =
      licenseKeyOverride !== undefined
        ? licenseKeyOverride
        : this.decryptLicenseKey(record);

    if (!rawLicense) {
      return {
        status: 'missing',
        fingerprint: null,
        expiresAt: null,
        lastVerifiedAt: null,
      };
    }

    if (!fingerprint) {
      return this.buildLicenseResult('invalid', null, lastVerifiedAt);
    }

    try {
      const token = this.parseLicenseToken(rawLicense);
      const payload = this.parseLicensePayload(token.payload);
      const publicKey = this.validatePublicKey(
        this.getLicensePublicKeyPemOrThrow(),
      );

      const valid = verifySignature(
        'sha256',
        Buffer.from(token.payload),
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
        },
        Buffer.from(token.signature, 'base64'),
      );

      if (!valid || payload.organizationId !== record.organizationId) {
        return this.buildLicenseResult('invalid', fingerprint, lastVerifiedAt);
      }

      if (!payload.expiresAt) {
        return this.buildLicenseResult('invalid', fingerprint, lastVerifiedAt);
      }

      const expiresAt = new Date(payload.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        return this.buildLicenseResult('invalid', fingerprint, lastVerifiedAt);
      }

      return this.buildLicenseResult(
        expiresAt.getTime() < Date.now() ? 'expired' : 'valid',
        fingerprint,
        lastVerifiedAt,
        expiresAt.toISOString(),
      );
    } catch {
      return this.buildLicenseResult('invalid', fingerprint, lastVerifiedAt);
    }
  }

  private decryptLicenseKey(
    record: PrivateDeploymentRecordLike,
  ): string | null {
    const encrypted = this.readEncryptedValue(
      this.getLicenseKeyEnvelope(record),
    );
    if (!encrypted) {
      return null;
    }

    try {
      return this.encryptionService.decrypt(encrypted);
    } catch {
      return '__INVALID_LICENSE__';
    }
  }

  private parseLicenseToken(rawLicense: string): LicenseTokenEnvelope {
    const parsed = JSON.parse(rawLicense) as Partial<LicenseTokenEnvelope>;

    if (
      typeof parsed.payload !== 'string' ||
      typeof parsed.signature !== 'string' ||
      parsed.payload.length === 0 ||
      parsed.signature.length === 0
    ) {
      throw new Error('Invalid private deployment license token');
    }

    return {
      payload: parsed.payload,
      signature: parsed.signature,
    };
  }

  private parseLicensePayload(payload: string): LicensePayload {
    const parsed = JSON.parse(payload) as LicensePayload;
    return parsed ?? {};
  }

  private buildLicenseResult(
    status: PrivateDeploymentLicenseStatus,
    fingerprint: string | null,
    lastVerifiedAt: string,
    expiresAt: string | null = null,
  ): PrivateDeploymentLicenseDto {
    return {
      status,
      fingerprint,
      expiresAt,
      lastVerifiedAt,
    };
  }

  private getDeploymentMode(): DeploymentMode {
    const configured = this.configService.get<DeploymentMode>(
      'APP_DEPLOYMENT_MODE',
    );
    return configured === 'private' ? 'private' : 'saas';
  }

  private getLicenseFingerprint(): string | null {
    const publicKeyPem = this.configService.get<string>(
      'APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY',
    );

    if (!publicKeyPem) {
      return null;
    }

    try {
      const publicKey = this.validatePublicKey(publicKeyPem);
      const der = publicKey.export({ type: 'spki', format: 'der' });
      return createHash('sha256').update(der).digest('hex');
    } catch {
      return null;
    }
  }

  private getLicensePublicKeyPemOrThrow(): string {
    const publicKeyPem = this.configService.get<string>(
      'APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY',
    );

    if (!publicKeyPem) {
      throw new Error('APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY is missing');
    }

    return publicKeyPem;
  }

  private validatePublicKey(pem: string): KeyObject {
    if (isPrivateKeyPem(pem)) {
      throw new Error('Expected a public key but received a private key');
    }

    const publicKey = createPublicKey(pem);
    if (publicKey.type !== 'public') {
      throw new Error('Expected a public key');
    }

    if (publicKey.asymmetricKeyType !== 'rsa') {
      throw new Error('Only RSA public keys are supported');
    }

    const keySizeBits = publicKey.asymmetricKeyDetails?.modulusLength;
    if (keySizeBits !== undefined && keySizeBits < 2048) {
      throw new Error('RSA public key must be at least 2048 bits');
    }

    return publicKey;
  }

  private toPrivateCloudAuthMethod(
    mode: PrivateDeploymentLlmProxyMode,
  ): PrivateCloudAuthMethod {
    return mode === 'direct' ? 'none' : 'api_key';
  }

  private toLlmProxyMode(
    authMethod: PrivateCloudAuthMethod,
    allowExternalEgress: boolean,
  ): PrivateDeploymentLlmProxyMode {
    if (authMethod === 'none') {
      return 'direct';
    }

    return allowExternalEgress ? 'enterprise_proxy' : 'private_cloud';
  }

  private toPersistenceCertificateSource(
    source: PrivateDeploymentCertificateSource,
  ): PrivateDeploymentPersistenceCertificateSource {
    switch (source) {
      case 'uploaded':
        return 'uploaded';
      case 'secretRef':
        return 'tls_secret_ref';
      case 'ingress-managed':
        return 'none';
    }
  }

  private toPublicCertificateSource(
    source: PrivateDeploymentPersistenceCertificateSource,
  ): PrivateDeploymentCertificateSource {
    switch (source) {
      case 'uploaded':
        return 'uploaded';
      case 'tls_secret_ref':
        return 'secretRef';
      case 'none':
        return 'ingress-managed';
    }
  }

  private buildSmtpPasswordSecretRef(organizationId: string): string {
    return `private-deployment://organizations/${organizationId}/smtp/password`;
  }

  private buildLlmProxyApiKeySecretRef(organizationId: string): string {
    return `private-deployment://organizations/${organizationId}/llm-proxy/api-key`;
  }

  private toDateOrNull(value: string | null): Date | null {
    return value ? new Date(value) : null;
  }

  private async recordAudit(params: {
    tenantId: string;
    actorId: string;
    eventType: string;
    resourceId: string;
    summary: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }) {
    if (!this.auditLogService) {
      return;
    }

    await this.auditLogService.record({
      tenantId: params.tenantId,
      actorId: params.actorId,
      actorType: 'user',
      eventType: params.eventType,
      resourceType: 'organization',
      resourceId: params.resourceId,
      summary: params.summary,
      before: params.before ?? null,
      after: params.after ?? null,
      metadata: params.metadata ?? null,
    });
  }

  private asAuditRecord(
    value: PrivateDeploymentResponseDto,
  ): Record<string, unknown> {
    return value as unknown as Record<string, unknown>;
  }
}
