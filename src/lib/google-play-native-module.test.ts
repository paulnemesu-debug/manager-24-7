import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('Manager 24/7 native billing module', () => {
  it('is discovered by the real Expo Android autolinker', () => {
    const cli = resolve(root, 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking');
    const result = spawnSync(process.execPath, [
      cli,
      'resolve',
      '--platform',
      'android',
      '--project-root',
      root,
      '--json',
    ], { cwd: root, encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    const resolution = JSON.parse(result.stdout) as {
      modules: {
        packageName: string;
        projects: {
          sourceDir: string;
          modules: { classifier: string }[];
        }[];
      }[];
    };
    const billing = resolution.modules.find(
      (entry) => entry.packageName === 'manager247-billing',
    );
    expect(billing?.projects[0]?.modules).toEqual([
      { classifier: 'expo.modules.manager247billing.Manager247BillingModule', name: null },
    ]);
    expect(billing?.projects[0]?.sourceDir.replace(/\\/g, '/')).toContain('modules/manager247-billing/android');
  });
});
