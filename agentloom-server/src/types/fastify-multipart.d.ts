import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    file(): Promise<
      | {
          filename: string;
          mimetype: string;
          toBuffer(): Promise<Buffer>;
        }
      | undefined
    >;
  }
}
