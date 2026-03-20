import { z } from 'zod';

export const SessionItemSchema = z.object({
  id: z.string().uuid(),
  user_agent: z.string().nullable(),
  ip: z.string().nullable(),
  created_at: z.string().nullable(),
  last_active_at: z.string().nullable(),
  is_current: z.boolean(),
});

export type SessionItem = z.infer<typeof SessionItemSchema>;

export const SessionListResponseSchema = z.object({
  data: z.object({
    sessions: z.array(SessionItemSchema),
  }),
});

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const RevokeSessionResponseSchema = z.object({
  message: z.string(),
});

export type RevokeSessionResponse = z.infer<typeof RevokeSessionResponseSchema>;
