import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import type { UserIdentity } from '@/contexts/authentication/domain/UserIdentity.js';
import { UserId } from '@/shared-kernel/types/UserId.js';

interface WhoAmIResponse {
  Identifier: string;
  FirstName: string;
  LastName: string;
  UniqueName: string;
}

/**
 * Fetch the current user identity. `lpVersion` should be the LP version
 * discovered at startup via `discoverVersions` — passing a stale default
 * eventually breaks when D2L deprecates older LP versions.
 */
export async function callWhoAmI(
  token: AccessToken,
  baseUrl: string,
  lpVersion = '1.56',
): Promise<UserIdentity> {
  const { name, value } = token.toAuthHeader();
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, '')}/d2l/api/lp/${lpVersion}/users/whoami`,
    {
      headers: { [name]: value },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!resp.ok) throw new Error(`whoami failed: ${resp.status}`);
  const body = (await resp.json()) as WhoAmIResponse;
  const userId = Number.parseInt(body.Identifier, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`whoami returned invalid Identifier: ${String(body.Identifier)}`);
  }
  return {
    userId: UserId.of(userId),
    displayName: `${body.FirstName} ${body.LastName}`.trim(),
    uniqueName: body.UniqueName,
  };
}
