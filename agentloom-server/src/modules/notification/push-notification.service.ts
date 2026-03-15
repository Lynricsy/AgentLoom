import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { DeviceTokenService } from './device-token.service';

const PUSH_CHUNK_SIZE = 150;
const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationService.name);
  private messagingClient: admin.messaging.Messaging | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  get isEnabled(): boolean {
    return this.messagingClient !== null;
  }

  onModuleInit(): void {
    const serviceAccountJson = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT',
    );

    if (!serviceAccountJson) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT 未配置，推送通知已禁用');
      return;
    }

    try {
      const serviceAccount = JSON.parse(
        serviceAccountJson,
      ) as admin.ServiceAccount;

      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      this.messagingClient = admin.messaging();
      this.logger.log('Firebase Cloud Messaging 已初始化');
    } catch (error) {
      this.messagingClient = null;
      this.logger.error('Firebase Cloud Messaging 初始化失败', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.messagingClient = null;

    const firebaseAppDeletes: Array<Promise<void>> = [];

    for (const app of admin.apps) {
      if (!app) {
        continue;
      }

      firebaseAppDeletes.push(app.delete());
    }

    if (firebaseAppDeletes.length === 0) {
      return;
    }

    await Promise.all(firebaseAppDeletes);
  }

  async sendToUser(
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<void> {
    if (!this.messagingClient) {
      return;
    }

    const activeTokens =
      await this.deviceTokenService.findActiveByUserId(userId);

    if (activeTokens.length === 0) {
      return;
    }

    const tokens = activeTokens.map((entry) => entry.deviceToken);
    const invalidTokens: string[] = [];

    for (
      let startIndex = 0;
      startIndex < tokens.length;
      startIndex += PUSH_CHUNK_SIZE
    ) {
      const chunk = tokens.slice(startIndex, startIndex + PUSH_CHUNK_SIZE);

      try {
        const response = await this.messagingClient.sendEachForMulticast({
          tokens: chunk,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data,
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        });

        response.responses.forEach((entry, index) => {
          const code = entry.success ? undefined : entry.error?.code;

          if (code && INVALID_TOKEN_ERROR_CODES.has(code)) {
            invalidTokens.push(chunk[index]);
          }
        });
      } catch (error) {
        this.logger.error(
          `FCM 批量发送失败，chunk 起始索引 ${startIndex}`,
          error,
        );
      }
    }

    if (invalidTokens.length > 0) {
      this.logger.log(`正在失活 ${invalidTokens.length} 个无效 FCM token`);
      await this.deviceTokenService.deactivateTokens(invalidTokens);
    }
  }
}
