process.env.APP_PORT = '3099';
process.env.APP_NODE_ENV = 'test';
process.env.APP_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.APP_SUPABASE_URL = 'https://test.supabase.co';
process.env.APP_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.APP_SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.APP_JWT_SECRET = 'test-e2e-jwt-secret';
process.env.APP_REDIS_URL = 'redis://127.0.0.1:6379';
process.env.APP_OAUTH_REDIRECT_URL =
  'https://test.supabase.co/auth/v1/callback';
process.env.APP_FRONTEND_URL = 'http://localhost:3000';
process.env.APP_MASTER_ENCRYPTION_KEY =
  '3HiqJr2j48+6csTN+/yp+9FDJeiBpILxtxgYy/w/uFQ=';
process.env.APP_MINIO_ENDPOINT = 'localhost';
process.env.APP_MINIO_PORT = '9000';
process.env.APP_MINIO_ACCESS_KEY = 'test-access-key';
process.env.APP_MINIO_SECRET_KEY = 'test-secret-key';
