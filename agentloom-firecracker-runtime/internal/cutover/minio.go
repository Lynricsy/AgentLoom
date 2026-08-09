package cutover

import (
	"context"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOStore struct {
	client *minio.Client
	bucket string
}

func NewMinIOStore(endpoint, accessKey, secretKey, bucket string, secure bool) (*MinIOStore, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
	if err != nil {
		return nil, err
	}
	return &MinIOStore{client: client, bucket: bucket}, nil
}

func (store *MinIOStore) Put(
	ctx context.Context,
	key string,
	reader io.Reader,
	size int64,
	contentType string,
) (int64, error) {
	info, err := store.client.PutObject(
		ctx,
		store.bucket,
		key,
		reader,
		size,
		minio.PutObjectOptions{ContentType: contentType},
	)
	if err != nil {
		return 0, err
	}
	return info.Size, nil
}

func (store *MinIOStore) Remove(ctx context.Context, key string) error {
	return store.client.RemoveObject(ctx, store.bucket, key, minio.RemoveObjectOptions{})
}
