import type { EnsureAuthenticated } from '@/contexts/authentication/application/EnsureAuthenticated.js';

export interface CheckAuthDeps {
  ensureAuth: EnsureAuthenticated;
  profile: string;
  baseUrl: string;
}

export async function handleCheckAuth(deps: CheckAuthDeps) {
  try {
    const session = await deps.ensureAuth.execute({ profile: deps.profile, baseUrl: deps.baseUrl });
    const minutes = Math.round((session.expiresAt.getTime() - Date.now()) / 60_000);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Authenticated as ${session.userIdentity.displayName}. Source: ${session.source}. Expires in ~${minutes} min.`,
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      content: [{ type: 'text' as const, text: `Not authenticated: ${msg}` }],
      isError: true,
    };
  }
}
