package storage

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type S3 struct {
	bucket string
	// internal is used by services inside the cluster/docker network.
	internal *minio.Client
	// public is used for presigned URLs returned to browsers/clients.
	public *minio.Client
}

type Config struct {
	Endpoint       string
	PublicEndpoint string
	Region         string
	Bucket         string
	AccessKey      string
	SecretKey      string
}

func New(cfg Config) (*S3, error) {
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("missing bucket")
	}
	internal, err := newMinioClient(cfg.Endpoint, cfg.Region, cfg.AccessKey, cfg.SecretKey)
	if err != nil {
		return nil, fmt.Errorf("s3 internal client: %w", err)
	}

	pubEndpoint := cfg.PublicEndpoint
	if pubEndpoint == "" {
		pubEndpoint = cfg.Endpoint
	}
	public, err := newMinioClient(pubEndpoint, cfg.Region, cfg.AccessKey, cfg.SecretKey)
	if err != nil {
		return nil, fmt.Errorf("s3 public client: %w", err)
	}

	return &S3{bucket: cfg.Bucket, internal: internal, public: public}, nil
}

func newMinioClient(endpoint, region, accessKey, secretKey string) (*minio.Client, error) {
	ep, useSSL, err := normalizeEndpoint(endpoint)
	if err != nil {
		return nil, err
	}
	return minio.New(ep, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
		Region: region,
	})
}

func normalizeEndpoint(endpoint string) (hostport string, useSSL bool, err error) {
	if endpoint == "" {
		return "", false, fmt.Errorf("missing endpoint")
	}
	if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
		u, e := url.Parse(endpoint)
		if e != nil {
			return "", false, fmt.Errorf("invalid endpoint: %w", e)
		}
		return u.Host, u.Scheme == "https", nil
	}
	// treat as host:port
	return endpoint, false, nil
}

func (s *S3) EnsureBucket(ctx context.Context) error {
	exists, err := s.internal.BucketExists(ctx, s.bucket)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return s.internal.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
}

func (s *S3) PresignPut(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	u, err := s.public.PresignedPutObject(ctx, s.bucket, objectKey, expiry)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func (s *S3) Download(ctx context.Context, objectKey, destPath string) error {
	return s.internal.FGetObject(ctx, s.bucket, objectKey, destPath, minio.GetObjectOptions{})
}
