// Local, redacted heuristic scan. Not a substitute for a specialist secret scanner.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const git = (...args) => { const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.status) throw new Error('Git scan input failed.'); return r.stdout; };
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['aws-access-id', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['provider-token', /\b(?:sk_live_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk-proj-[A-Za-z0-9_-]{30,})\b/g],
  ['credential-url', /https?:\/\/[^\s/@]+:[^\s/@]+@[^\s/]+/g],
];
const findings = [];
function inspect(text, file, source) {
  for (const [kind, regex] of patterns) for (const m of text.matchAll(regex)) findings.push({ kind, file, source, line: text.slice(0, m.index).split('\n').length });
}
const staged = process.argv.includes('--staged');
const files = staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR').trim().split('\n') : git('ls-files', '--cached', '--others', '--exclude-standard').trim().split('\n');
const unsafePaths = files.filter(f => /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|node_modules|\.wrangler|outputs)(?:\/|$)|\.(?:sqlite|db|pem|p12|pfx|t2sbackup|backup)$/i.test(f));
for (const f of files.filter(Boolean)) {
  const bytes = staged ? Buffer.from(git('show', ':' + f)) : await readFile(f);
  if (!bytes.includes(0)) inspect(bytes.toString('utf8'), f, staged ? 'staged' : 'worktree');
}
let historicalBlobs = 0;
if (!staged) {
  const objects = git('rev-list', '--objects', '--all').trim().split('\n').map(line => { const i = line.indexOf(' '); return { id: i < 0 ? line : line.slice(0, i), file: i < 0 ? '(object)' : line.slice(i + 1) }; });
  const r = spawnSync('git', ['cat-file', '--batch'], { input: objects.map(o => o.id).join('\n') + '\n', maxBuffer: 64 * 1024 * 1024 });
  if (r.status) throw new Error('Historical blob scan failed.');
  let at = 0;
  for (const o of objects) {
    const end = r.stdout.indexOf(10, at), header = r.stdout.subarray(at, end).toString().split(' '), size = Number(header[2]);
    at = end + 1; const bytes = r.stdout.subarray(at, at + size); at += size + 1;
    if (header[1] === 'blob') { historicalBlobs++; if (!bytes.includes(0)) inspect(bytes.toString('utf8'), o.file, o.id); }
  }
}
await mkdir('outputs/project-audit', { recursive: true });
const result = { timestamp: new Date().toISOString(), mode: staged ? 'staged' : 'worktree-and-all-reachable-history', files: files.length,
  historicalBlobs, unsafePaths, findings, result: findings.length || unsafePaths.length ? 'REVIEW' : 'NO_MATCHES',
  limitation: 'Pattern-based redacted scan only; does not prove absence of arbitrary secrets or customer data.' };
await writeFile(`outputs/project-audit/${staged ? 'staged-' : ''}secret-scan.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
