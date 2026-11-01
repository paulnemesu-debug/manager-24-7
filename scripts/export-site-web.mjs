import { spawnSync } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

// An explicit base path keeps this client separate from the PARADIM website.
const prefix = '/aplicatie';
const output = path.resolve('dist-site');
const run = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'export', '--clear', '--platform', 'web', '--output-dir', output, '--max-workers', '2'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', MANAGER247_WEB_BASE_URL: prefix },
});
if (run.status !== 0) process.exit(run.status ?? 1);
const indexPath = path.join(output, 'index.html');
let html = await readFile(indexPath, 'utf8');
html = html.replace(/<script>\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>/g, '');
html = html.replace(/(href=["'])\/(manifest\.webmanifest|icons\/)/g, `$1${prefix}/$2`);
html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow,noarchive"></head>');
await writeFile(indexPath, html);
const manifestPath = path.join(output, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.start_url = prefix + '/';
manifest.scope = prefix + '/';
manifest.id = prefix + '/';
for (const icon of manifest.icons ?? []) if (icon.src.startsWith('/') && !icon.src.startsWith(prefix + '/')) icon.src = prefix + icon.src;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
// Do not register a second service worker on the consulting website's origin.
await unlink(path.join(output, 'sw.js')).catch((error) => { if (error.code !== 'ENOENT') throw error; });
console.log('Manager 24/7 web client prepared for /aplicatie/.');
