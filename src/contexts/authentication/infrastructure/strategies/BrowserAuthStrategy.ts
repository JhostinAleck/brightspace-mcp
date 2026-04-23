import type {
  AuthStrategy,
  AuthContext,
} from '@/contexts/authentication/domain/AuthStrategy.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';
import type { UserIdentity } from '@/contexts/authentication/domain/UserIdentity.js';
import type { CredentialStore } from '@/contexts/authentication/domain/CredentialStore.js';
import type { MfaStrategy } from '@/contexts/authentication/domain/MfaStrategy.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { AuthConfigError } from '@/contexts/authentication/domain/errors.js';
import type { PlaywrightLoader } from './lazy-playwright.js';

export type WhoAmI = (token: AccessToken, baseUrl: string) => Promise<UserIdentity>;

export interface BrowserSelectors {
  username: string;
  password: string;
  submit: string;
  passwordSubmit?: string;    // if present → multi-step mode
  preMfaClicks?: string[];    // best-effort clicks before MFA input
  mfaInput: string;
  mfaSubmit: string;
  postLogin: string;
}

export interface BrowserAuthStrategyOptions {
  loginUrl: string;
  selectors: BrowserSelectors;
  usernameRef: string;
  passwordRef: string;
  credentialStore: CredentialStore;
  mfa: MfaStrategy;
  playwrightLoader: PlaywrightLoader;
  headless: boolean;
  whoami: WhoAmI;
  sessionTtlMs: number;
}

export class BrowserAuthStrategy implements AuthStrategy {
  readonly kind = 'browser' as const;

  constructor(private readonly opts: BrowserAuthStrategyOptions) {}

  private async resolveCredential(ref: string, label: string): Promise<string> {
    const v = await this.opts.credentialStore.get(ref);
    if (!v) throw new AuthConfigError(`${label} not found at ref "${ref}"`);
    return v.reveal();
  }

  async authenticate(ctx: AuthContext): Promise<Session> {
    const username = await this.resolveCredential(this.opts.usernameRef, 'username');
    const password = await this.resolveCredential(this.opts.passwordRef, 'password');
    const pw = await this.opts.playwrightLoader();
    const browser = await pw.chromium.launch({ headless: this.opts.headless });
    try {
      const page = await browser.newPage();
      await page.goto(this.opts.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const { selectors } = this.opts;
      if (selectors.passwordSubmit !== undefined) {
        // Multi-step: email page → navigate → password page
        await page.fill(selectors.username, username);
        await page.click(selectors.submit);
        await page.waitForSelector(selectors.password, { timeout: 10_000 });
        await page.fill(selectors.password, password);
        await page.click(selectors.passwordSubmit);
      } else {
        // Single-page form: fill both then submit
        await page.fill(selectors.username, username);
        await page.fill(selectors.password, password);
        await page.click(selectors.submit);
      }

      // Pre-MFA navigation (best-effort: skip selectors that time out)
      for (const sel of selectors.preMfaClicks ?? []) {
        try {
          await page.waitForSelector(sel, { timeout: 5_000 });
          await page.click(sel);
        } catch {
          // selector not present in this flow variant — skip
        }
      }

      try {
        await page.waitForSelector(this.opts.selectors.mfaInput, { timeout: 5_000 });
        const response = await this.opts.mfa.solve({ kind: 'totp_code' });
        if (response.code) {
          await page.fill(this.opts.selectors.mfaInput, response.code);
          await page.click(this.opts.selectors.mfaSubmit);
        }
      } catch {
        /* no MFA prompt — ignore and continue */
      }

      await page.waitForSelector(this.opts.selectors.postLogin, { timeout: 30_000 });

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      if (!cookieHeader) throw new Error('Browser login produced no cookies');

      const token = AccessToken.cookie(cookieHeader);
      const identity = await this.opts.whoami(token, ctx.baseUrl);
      const now = new Date();
      return {
        token,
        profile: ctx.profile,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + this.opts.sessionTtlMs),
        source: this.kind,
        userIdentity: identity,
      };
    } finally {
      await browser.close();
    }
  }

  canRefresh(): boolean {
    return false;
  }
}
