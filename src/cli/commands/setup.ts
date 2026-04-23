import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

import { confirm } from '@inquirer/prompts';
import { stringify as stringifyYaml } from 'yaml';

import {
  promptApiToken,
  promptAuthStrategy,
  promptBaseUrl,
  promptMfaStrategy,
  promptTotpSecret,
} from './setup/prompts.js';
import { detectMcpClients, registerWithClient } from './setup/clients.js';
import { chooseSecretRef } from './setup/credentials.js';

export interface SetupOptions {
  config?: string;
  skipClientDetection?: boolean;
}

export async function runSetup(opts: SetupOptions): Promise<void> {
  const configPath =
    opts.config ?? join(homedir(), '.brightspace-mcp', 'config.yaml');

  process.stdout.write('Brightspace MCP setup wizard\n\n');

  const baseUrl = await promptBaseUrl();
  const authStrategy = await promptAuthStrategy();

  const auth: Record<string, unknown> = { strategy: authStrategy };
  const profile: Record<string, unknown> = {
    base_url: baseUrl,
    auth,
  };
  const config: Record<string, unknown> = {
    default_profile: 'my_school',
    profiles: {
      my_school: profile,
    },
  };

  if (authStrategy === 'api_token') {
    const token = await promptApiToken();
    process.env.BRIGHTSPACE_API_TOKEN = token;
    auth['api_token'] = {
      token_ref: chooseSecretRef({ strategy: 'env', varName: 'BRIGHTSPACE_API_TOKEN' }),
    };
  }

  const mfa = await promptMfaStrategy();
  if (mfa === 'totp') {
    const secret = await promptTotpSecret();
    process.env.BRIGHTSPACE_TOTP_SECRET = secret;
    auth['mfa'] = {
      strategy: 'totp',
      totp: {
        secret_ref: chooseSecretRef({ strategy: 'env', varName: 'BRIGHTSPACE_TOTP_SECRET' }),
      },
    };
  } else if (mfa !== 'none') {
    auth['mfa'] = { strategy: mfa };
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(config), { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`\nConfig written to ${configPath}\n`);

  if (!opts.skipClientDetection) {
    const detected = detectMcpClients({ home: homedir(), platform: platform() });
    if (detected.length > 0) {
      process.stdout.write(`\nDetected MCP clients: ${detected.map((c) => c.name).join(', ')}\n`);
      for (const client of detected) {
        const register = await confirm({ message: `Register with ${client.name}?`, default: true });
        if (register) {
          registerWithClient({
            clientName: client.name,
            home: homedir(),
            platform: platform(),
            command: 'npx',
            args: ['--yes', 'brightspace-mcp', 'serve'],
            env: { BRIGHTSPACE_CONFIG: configPath },
          });
          process.stdout.write(`Registered with ${client.name}.\n`);
        }
      }
    } else {
      process.stdout.write(
        '\nNo MCP clients detected. See docs/clients.md for manual setup snippets.\n',
      );
    }
  }

  process.stdout.write(
    '\nSetup complete. Test with: npx brightspace-mcp serve (or launch your MCP client)\n',
  );
}
