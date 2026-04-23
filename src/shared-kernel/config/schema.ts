import { z } from 'zod';

export const AuthStrategyKindSchema = z.enum([
  'auto', 'api_token', 'browser', 'oauth', 'session_cookie', 'headless',
]);

export const MfaStrategyKindSchema = z.enum(['none', 'totp', 'duo_push', 'manual_prompt']);

const TotpMfaConfigSchema = z.object({
  secret_ref: z.string(),
  digits: z.union([z.literal(6), z.literal(8)]).default(6),
  period: z.number().int().positive().default(30),
  algorithm: z.enum(['SHA1', 'SHA256', 'SHA512']).default('SHA1'),
});

const DuoMfaConfigSchema = z.object({
  poll_interval_ms: z.number().int().positive().default(1_000),
  timeout_ms: z.number().int().positive().default(120_000),
});

const MfaConfigSchema = z
  .object({
    strategy: MfaStrategyKindSchema.default('none'),
    totp: TotpMfaConfigSchema.optional(),
    duo_push: DuoMfaConfigSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.strategy === 'totp' && !data.totp) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'mfa.totp is required when mfa.strategy=totp' });
    }
    if (data.strategy === 'duo_push' && !data.duo_push) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'mfa.duo_push is required when mfa.strategy=duo_push' });
    }
  });

const BrowserSelectorsSchema = z.object({
  username: z.string(),
  password: z.string(),
  submit: z.string(),
  mfa_input: z.string(),
  mfa_submit: z.string(),
  post_login: z.string(),
});

const BrowserStrategyConfigSchema = z.object({
  login_url: z.url(),
  selectors: BrowserSelectorsSchema,
  username_ref: z.string(),
  password_ref: z.string(),
  headless: z.boolean().default(true),
  session_ttl_seconds: z.number().int().positive().default(3_600),
  mfa: MfaConfigSchema.default({ strategy: 'none' }),
});

const OAuthStrategyConfigSchema = z.object({
  authorize_url: z.url(),
  token_url: z.url(),
  client_id: z.string(),
  client_secret_ref: z.string().nullable(),
  redirect_uri: z.url(),
  scopes: z.array(z.string()),
  refresh_token_ref: z.string(),
});

const SessionCookieStrategyConfigSchema = z.object({
  cookie_ref: z.string(),
  session_ttl_seconds: z.number().int().positive().default(3_600),
});

const HeadlessStrategyConfigSchema = z.object({
  login_url: z.url(),
  username_ref: z.string(),
  password_ref: z.string(),
  mfa_url: z.url().optional(),
  session_ttl_seconds: z.number().int().positive().default(3_600),
  mfa: MfaConfigSchema.default({ strategy: 'none' }),
});

export const ProfileSchema = z.object({
  extends: z.string().optional(),
  base_url: z.url().optional(),
  auth: z
    .object({
      strategy: AuthStrategyKindSchema.default('auto'),
      fallbacks: z.array(AuthStrategyKindSchema).default([]),
      api_token: z.object({ token_ref: z.string() }).optional(),
      browser: BrowserStrategyConfigSchema.optional(),
      oauth: OAuthStrategyConfigSchema.optional(),
      session_cookie: SessionCookieStrategyConfigSchema.optional(),
      headless: HeadlessStrategyConfigSchema.optional(),
    })
    .superRefine((auth, ctx) => {
      const k = auth.strategy;
      if (k === 'api_token' && !auth.api_token) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.api_token is required when strategy=api_token' });
      }
      if (k === 'browser' && !auth.browser) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.browser is required when strategy=browser' });
      }
      if (k === 'oauth' && !auth.oauth) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.oauth is required when strategy=oauth' });
      }
      if (k === 'session_cookie' && !auth.session_cookie) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.session_cookie is required when strategy=session_cookie' });
      }
      if (k === 'headless' && !auth.headless) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.headless is required when strategy=headless' });
      }
    }),
  session: z
    .object({
      cache_backend: z.enum(['memory', 'file', 'redis']).default('memory'),
      preemptive_refresh_seconds: z.number().int().nonnegative().default(300),
      file_path: z.string().optional(),
    })
    .default({ cache_backend: 'memory', preemptive_refresh_seconds: 300 }),
});

export const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const WritesConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    dry_run: z.boolean().default(false),
  })
  .default({ enabled: false, dry_run: false });

export const ConfigSchema = z.object({
  default_profile: z.string(),
  profiles: z.record(z.string(), ProfileSchema),
  logging: LoggingSchema.default({ level: 'info' }),
  writes: WritesConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type AuthStrategyKindValue = z.infer<typeof AuthStrategyKindSchema>;
