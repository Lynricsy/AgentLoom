import 'fastify';
import type { MultipartFile } from '@fastify/multipart';

declare module 'fastify' {
  interface FastifyRequest {
    file(): Promise<MultipartFile | undefined>;
  }
}
