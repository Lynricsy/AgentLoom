import type Redis from 'ioredis';

const IGNORABLE_REDIS_SHUTDOWN_MESSAGE = 'Connection is closed.';

export function isIgnorableRedisShutdownError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === IGNORABLE_REDIS_SHUTDOWN_MESSAGE
  );
}

export function isRedisConnectionClosed(redis: Redis): boolean {
  return redis.status === 'close' || redis.status === 'end';
}

export async function safeQuitRedis(redis: Redis): Promise<void> {
  if (isRedisConnectionClosed(redis)) {
    return;
  }

  try {
    await redis.quit();
  } catch (error) {
    if (isIgnorableRedisShutdownError(error)) {
      return;
    }

    throw error;
  }
}

export async function safeUnsubscribeRedis(
  redis: Redis,
  ...channels: string[]
): Promise<void> {
  if (isRedisConnectionClosed(redis)) {
    return;
  }

  try {
    await redis.unsubscribe(...channels);
  } catch (error) {
    if (isIgnorableRedisShutdownError(error)) {
      return;
    }

    throw error;
  }
}
