import * as crypto from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EncryptedData {
  encryptedKey: Buffer;
  encryptedDek: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

const AES_256_GCM = 'aes-256-gcm' as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEK_LENGTH = 32;

@Injectable()
export class EncryptionService implements OnModuleInit {
  private kek!: Buffer;
  private readonly logger = new Logger(EncryptionService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const masterKey = this.configService.get<string>(
      'APP_MASTER_ENCRYPTION_KEY',
    );
    if (!masterKey) {
      throw new Error(
        'APP_MASTER_ENCRYPTION_KEY 环境变量未配置',
      );
    }

    this.kek = Buffer.from(masterKey, 'base64');
    if (this.kek.length !== KEK_LENGTH) {
      throw new Error(
        `MASTER_ENCRYPTION_KEY 必须为 256 位（32 字节）Base64 编码，当前为 ${this.kek.length} 字节`,
      );
    }

    this.logger.log('主加密密钥（KEK）验证通过');
  }

  encrypt(plaintext: string): EncryptedData {
    const dek = crypto.randomBytes(KEK_LENGTH);

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(AES_256_GCM, dek, iv);
      const encryptedKey = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const dekIv = crypto.randomBytes(IV_LENGTH);
      const dekCipher = crypto.createCipheriv(AES_256_GCM, this.kek, dekIv);
      const encryptedDekData = Buffer.concat([
        dekCipher.update(dek),
        dekCipher.final(),
      ]);
      const dekAuthTag = dekCipher.getAuthTag();

      // DEK 密文打包格式: iv(12) + authTag(16) + ciphertext(32)
      const encryptedDek = Buffer.concat([dekIv, dekAuthTag, encryptedDekData]);

      return { encryptedKey, encryptedDek, iv, authTag };
    } finally {
      dek.fill(0);
    }
  }

  decrypt(data: EncryptedData): string {
    const dekIv = data.encryptedDek.subarray(0, IV_LENGTH);
    const dekAuthTag = data.encryptedDek.subarray(
      IV_LENGTH,
      IV_LENGTH + AUTH_TAG_LENGTH,
    );
    const encryptedDekData = data.encryptedDek.subarray(
      IV_LENGTH + AUTH_TAG_LENGTH,
    );

    const dekDecipher = crypto.createDecipheriv(AES_256_GCM, this.kek, dekIv);
    dekDecipher.setAuthTag(dekAuthTag);
    const dek = Buffer.concat([
      dekDecipher.update(encryptedDekData),
      dekDecipher.final(),
    ]);

    try {
      const decipher = crypto.createDecipheriv(AES_256_GCM, dek, data.iv);
      decipher.setAuthTag(data.authTag);
      const decrypted = Buffer.concat([
        decipher.update(data.encryptedKey),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } finally {
      dek.fill(0);
    }
  }
}
