import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { EncryptionService } from '../encryption.service';

const VALID_KEK = crypto.randomBytes(32).toString('base64');

describe('EncryptionService', () => {
  let service: EncryptionService;
  let configService: ConfigService;

  const createModule = async (
    masterKey?: string,
  ): Promise<TestingModule> => {
    return Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(masterKey),
          },
        },
      ],
    }).compile();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await createModule(VALID_KEK);
    service = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);
    service.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('应当在 KEK 有效时成功初始化', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('应当在未配置 APP_MASTER_ENCRYPTION_KEY 时抛出异常', async () => {
      const module = await createModule(undefined);
      const svc = module.get<EncryptionService>(EncryptionService);
      expect(() => svc.onModuleInit()).toThrow(
        'APP_MASTER_ENCRYPTION_KEY 环境变量未配置',
      );
    });

    it('应当在 KEK 不是 32 字节时抛出异常', async () => {
      const shortKey = crypto.randomBytes(16).toString('base64');
      const module = await createModule(shortKey);
      const svc = module.get<EncryptionService>(EncryptionService);
      expect(() => svc.onModuleInit()).toThrow('必须为 256 位');
    });
  });

  describe('encrypt', () => {
    it('应当返回所有加密字段且均为 Buffer', () => {
      const result = service.encrypt('sk-test-key-12345');

      expect(result.encryptedKey).toBeInstanceOf(Buffer);
      expect(result.encryptedDek).toBeInstanceOf(Buffer);
      expect(result.iv).toBeInstanceOf(Buffer);
      expect(result.authTag).toBeInstanceOf(Buffer);
    });

    it('应当生成 12 字节 IV', () => {
      const result = service.encrypt('sk-test-key');
      expect(result.iv.length).toBe(12);
    });

    it('应当生成 16 字节 AuthTag', () => {
      const result = service.encrypt('sk-test-key');
      expect(result.authTag.length).toBe(16);
    });

    it('应当将 DEK 打包为 iv(12) + authTag(16) + ciphertext(32) 格式', () => {
      const result = service.encrypt('sk-test-key');
      // DEK 密文打包: 12 + 16 + 32 = 60 字节
      expect(result.encryptedDek.length).toBe(60);
    });

    it('应当每次加密生成不同的密文（随机 DEK + IV）', () => {
      const plaintext = 'sk-same-key';
      const result1 = service.encrypt(plaintext);
      const result2 = service.encrypt(plaintext);

      expect(result1.encryptedKey.equals(result2.encryptedKey)).toBe(false);
      expect(result1.iv.equals(result2.iv)).toBe(false);
      expect(result1.encryptedDek.equals(result2.encryptedDek)).toBe(false);
    });
  });

  describe('decrypt', () => {
    it('应当正确解密还原明文', () => {
      const plaintext = 'sk-test-redacted';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('应当正确处理空字符串', () => {
      const encrypted = service.encrypt('');
      expect(service.decrypt(encrypted)).toBe('');
    });

    it('应当正确处理超长密钥', () => {
      const longKey = 'sk-' + 'a'.repeat(500);
      const encrypted = service.encrypt(longKey);
      expect(service.decrypt(encrypted)).toBe(longKey);
    });

    it('应当正确处理 UTF-8 字符', () => {
      const unicodeKey = 'sk-密钥-🔑-key';
      const encrypted = service.encrypt(unicodeKey);
      expect(service.decrypt(encrypted)).toBe(unicodeKey);
    });

    it('应当在 authTag 被篡改时抛出异常', () => {
      const encrypted = service.encrypt('sk-test');
      encrypted.authTag[0] ^= 0xff;
      expect(() => service.decrypt(encrypted)).toThrow();
    });

    it('应当在 encryptedKey 被篡改时抛出异常', () => {
      const encrypted = service.encrypt('sk-test');
      encrypted.encryptedKey[0] ^= 0xff;
      expect(() => service.decrypt(encrypted)).toThrow();
    });

    it('应当在 encryptedDek 被篡改时抛出异常', () => {
      const encrypted = service.encrypt('sk-test');
      // 篡改 DEK 密文部分（跳过 iv 和 authTag）
      encrypted.encryptedDek[30] ^= 0xff;
      expect(() => service.decrypt(encrypted)).toThrow();
    });
  });

  describe('encrypt/decrypt 往返（不同 KEK 实例）', () => {
    it('应当在相同 KEK 的不同实例间正确往返', async () => {
      const module2 = await createModule(VALID_KEK);
      const service2 = module2.get<EncryptionService>(EncryptionService);
      service2.onModuleInit();

      const plaintext = 'sk-cross-instance-key';
      const encrypted = service.encrypt(plaintext);
      expect(service2.decrypt(encrypted)).toBe(plaintext);
    });

    it('应当在不同 KEK 间无法解密', async () => {
      const otherKek = crypto.randomBytes(32).toString('base64');
      const module2 = await createModule(otherKek);
      const service2 = module2.get<EncryptionService>(EncryptionService);
      service2.onModuleInit();

      const encrypted = service.encrypt('sk-test');
      expect(() => service2.decrypt(encrypted)).toThrow();
    });
  });
});
