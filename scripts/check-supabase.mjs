// Verifies the Supabase connection and that Row Level Security keeps data private.
// Usage: npm run check:supabase   (reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env)
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = { ...loadEnv(resolve(process.cwd(), '.env')), ...process.env };
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const TABLES = ['profiles', 'user_searches', 'threads', 'messages'];
let failed = false;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => {
  failed = true;
  console.log(`  FAIL  ${m}`);
};

if (!url || !key || url.includes('your-project-id')) {
  console.error('Missing or placeholder VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

console.log(`Checking ${url}\n`);

// 1. Key sanity: must be the anon/publishable key, never service_role.
try {
  const role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
  role === 'anon' ? ok('key role is "anon"') : bad(`key role is "${role}" - must be anon (never ship service_role)`);
} catch {
  /* new-style sb_publishable_ keys are not JWTs */
  key.startsWith('sb_publishable_') ? ok('publishable key format') : bad('key is not a recognisable anon/publishable key');
}

// 2. Reachability.
const headers = { apikey: key, Authorization: `Bearer ${key}` };
try {
  const res = await fetch(`${url}/auth/v1/health`, { headers, signal: AbortSignal.timeout(10000) });
  res.ok ? ok(`auth service reachable (HTTP ${res.status})`) : bad(`auth service HTTP ${res.status}`);
} catch (e) {
  bad(`cannot reach project (${e.cause?.code ?? e.message}). Does the project exist and is it un-paused?`);
  process.exit(1);
}

// 3. As an anonymous visitor, no table may be readable or writable.
for (const t of TABLES) {
  const read = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers, signal: AbortSignal.timeout(10000) });
  if (read.status === 404 || read.status === 400) {
    bad(`${t}: table missing - run supabase_schema.sql`);
    continue;
  }
  if (read.status === 401 || read.status === 403) {
    ok(`${t}: anon read denied (HTTP ${read.status})`);
  } else if (read.ok) {
    const rows = await read.json();
    rows.length === 0
      ? ok(`${t}: anon read returns no rows (RLS filtering)`)
      : bad(`${t}: anon can READ other users' rows - RLS is too open`);
  } else {
    bad(`${t}: unexpected HTTP ${read.status}`);
  }

  const write = await fetch(`${url}/rest/v1/${t}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10000),
  });
  write.status === 201
    ? bad(`${t}: anon INSERT succeeded - RLS is too open`)
    : ok(`${t}: anon insert rejected (HTTP ${write.status})`);
}

console.log(failed ? '\nResult: FAILED' : '\nResult: all checks passed');
process.exit(failed ? 1 : 0);
