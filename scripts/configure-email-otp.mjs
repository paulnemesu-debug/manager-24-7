// Management credentials stay in the operator's environment, never in the app or ZIP.
import { readFile } from 'node:fs/promises';

const project = 'mnaaibsmijziutxuluvv';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const apply = process.argv.includes('--apply');
if (!token) {
  console.error('Nu este configurat SUPABASE_ACCESS_TOKEN. Foloseste setarile din LOGIN-OTP-0.1.2.md sau configureaza tokenul securizat local. Nu il trimite in chat.');
  process.exit(1);
}

const template = await readFile(new URL('../supabase/templates/email-otp.html', import.meta.url), 'utf8');
const desired = {
  mailer_autoconfirm: false,
  mailer_otp_length: 6,
  mailer_otp_exp: 600,
  mailer_subjects_magic_link: 'Cod de acces / Sign-in code — Manager 24/7',
  mailer_subjects_confirmation: 'Cod de acces / Sign-in code — Manager 24/7',
  mailer_templates_magic_link_content: template,
  mailer_templates_confirmation_content: template,
};

async function configRequest(method = 'GET', body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Supabase Management API: HTTP ${response.status}. Verifica accesul la configuratia Auth.`);
  return response.json();
}

try {
  // Read first: an auth/permission error is a stop condition, not a reason to try another credential.
  let config = await configRequest();
  if (apply && !config.smtp_host) {
    throw new Error('Proiectul Free foloseste SMTP-ul implicit. Configureaza mai intai un SMTP propriu verificat in Supabase; proiectele Free noi nu pot personaliza sablonul Auth cu expeditorul implicit.');
  }
  if (apply) {
    await configRequest('PATCH', desired);
    config = await configRequest();
  }
  const matches = Object.entries(desired).every(([key, value]) => config[key] === value);
  console.log(matches ? 'Configuratia OTP cu 6 cifre este verificata pe server.' : 'Configuratia serverului difera. Aplica sabloanele conform ghidului sau ruleaza acest script cu --apply.');
  console.log(config.smtp_host ? 'SMTP propriu: configurat; livrarea reala trebuie testata.' : 'SMTP propriu: neconfigurat. Proiectul Free nou nu poate folosi sablonul OTP personalizat cu expeditorul implicit.');
  if (!matches) process.exitCode = 1;
} catch (error) {
  // Never dump the response, headers, token, SMTP configuration, or a user's OTP.
  console.error(error instanceof Error ? error.message : 'Configuratia Auth nu a putut fi verificata.');
  process.exitCode = 1;
}
