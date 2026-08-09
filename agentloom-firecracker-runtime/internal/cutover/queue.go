package cutover

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

type QueueCleaner struct {
	client          *redis.Client
	lifecyclePrefix string
	agentPrefix     string
}

func NewQueueCleaner(redisURL, lifecyclePrefix, agentPrefix string) (*QueueCleaner, error) {
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	if lifecyclePrefix == "" {
		lifecyclePrefix = "bull:sandbox-lifecycle"
	}
	if agentPrefix == "" {
		agentPrefix = "bull:agent-conversation-execution"
	}
	return &QueueCleaner{
		client:          redis.NewClient(options),
		lifecyclePrefix: lifecyclePrefix,
		agentPrefix:     agentPrefix,
	}, nil
}

func (cleaner *QueueCleaner) Close() error { return cleaner.client.Close() }

func (cleaner *QueueCleaner) AssertDrained(ctx context.Context) error {
	if err := cleaner.assertQueueDrained(ctx, cleaner.lifecyclePrefix, false); err != nil {
		return fmt.Errorf("sandbox lifecycle queue: %w", err)
	}
	if err := cleaner.assertQueueDrained(ctx, cleaner.agentPrefix, true); err != nil {
		return fmt.Errorf("agent conversation execution queue: %w", err)
	}
	return nil
}

func (cleaner *QueueCleaner) PrepareForExport(ctx context.Context) error {
	if err := cleaner.AssertDrained(ctx); err != nil {
		return err
	}
	if err := cleaner.client.HSet(ctx, cleaner.lifecyclePrefix+":meta", "paused", "1").Err(); err != nil {
		return err
	}
	if err := cleaner.AssertDrained(ctx); err != nil {
		return err
	}
	if err := cleaner.clearPrefix(ctx, cleaner.lifecyclePrefix); err != nil {
		return err
	}
	return cleaner.client.HSet(ctx, cleaner.lifecyclePrefix+":meta", "paused", "1").Err()
}

func (cleaner *QueueCleaner) Clear(ctx context.Context) error {
	if err := cleaner.AssertDrained(ctx); err != nil {
		return err
	}
	return cleaner.clearPrefix(ctx, cleaner.lifecyclePrefix)
}

func (cleaner *QueueCleaner) assertQueueDrained(
	ctx context.Context,
	prefix string,
	includeDelayed bool,
) error {
	for _, suffix := range []string{"active", "wait", "paused"} {
		key := prefix + ":" + suffix
		count, err := cleaner.client.LLen(ctx, key).Result()
		if err != nil {
			return err
		}
		if count != 0 {
			return fmt.Errorf("not drained: key=%s jobs=%d", key, count)
		}
	}
	zsets := []string{"prioritized", "waiting-children"}
	if includeDelayed {
		zsets = append(zsets, "delayed")
	}
	for _, suffix := range zsets {
		key := prefix + ":" + suffix
		count, err := cleaner.client.ZCard(ctx, key).Result()
		if err != nil {
			return err
		}
		if count != 0 {
			return fmt.Errorf("not drained: key=%s jobs=%d", key, count)
		}
	}
	return nil
}

func (cleaner *QueueCleaner) clearPrefix(ctx context.Context, prefix string) error {
	var cursor uint64
	for {
		keys, next, err := cleaner.client.Scan(ctx, cursor, prefix+":*", 500).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			if err := cleaner.client.Unlink(ctx, keys...).Err(); err != nil {
				return err
			}
		}
		cursor = next
		if cursor == 0 {
			return nil
		}
	}
}
