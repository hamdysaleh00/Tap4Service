// Inspect only a new in-memory schema, never a database containing real data.
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const db = new DatabaseSync(':memory:');
for (const file of ['drizzle/0000_misty_baron_zemo.sql', 'db/staged/0001_normalized.sql', 'db/staged/0002_auth.sql', 'db/staged/0003_polling_indexes.sql']) db.exec(await readFile(file, 'utf8'));
const tables = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(t => ({
  ...t, columns: db.prepare(`PRAGMA table_info(${t.name})`).all(),
  foreignKeys: db.prepare(`PRAGMA foreign_key_list(${t.name})`).all(),
  indexes: db.prepare(`PRAGMA index_list(${t.name})`).all().map(i => ({ ...i,
    columns: db.prepare(`PRAGMA index_info(${i.name})`).all(), sql: db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(i.name)?.sql })),
}));
await mkdir('outputs/project-audit', { recursive: true });
await writeFile('outputs/project-audit/schema.json', JSON.stringify(tables, null, 2));
const dictionary = tables.map(t => `### ${t.name}\n\n| Column | SQLite type | Required | PK position | Default |\n| --- | --- | --- | --- | --- |\n${t.columns.map(c => `| ${c.name} | ${c.type} | ${c.notnull ? 'Yes' : 'No (or enforced by PK/schema)'} | ${c.pk || ''} | ${c.dflt_value ?? ''} |`).join('\n')}\n\nForeign keys: ${t.foreignKeys.map(f => `${f.from} → ${f.table}.${f.to} (group ${f.id}, ${f.on_delete})`).join('; ') || 'none'}.\n\nIndexes: ${t.indexes.map(i => `${i.name} (${i.columns.map(c => c.name).join(', ')})${i.unique ? ' UNIQUE' : ''}${i.partial ? ' PARTIAL' : ''}`).join('; ') || 'none'}.\n\n<details><summary>Exact implemented DDL and explicit indexes</summary>\n\n\x60\x60\x60sql\n${t.sql};\n${t.indexes.filter(i => i.sql).map(i => i.sql + ';').join('\n')}\n\x60\x60\x60\n\n</details>\n`).join('\n');
const er = ['erDiagram', ...tables.map(t => `    ${t.name} {\n${t.columns.filter(c => c.pk || t.foreignKeys.some(f => f.from === c.name)).map(c => `        ${c.type || 'TEXT'} ${c.name}${c.pk ? ' PK' : ' FK'}`).join('\n')}\n    }`),
  ...tables.flatMap(t => [...new Set(t.foreignKeys.map(f => f.id))].map(id => {
    const f = t.foreignKeys.filter(f => f.id === id); return `    ${f[0].table} ||--o{ ${t.name} : "${f.map(k => k.from).join('+')}"`;
  }))].join('\n');
await writeFile('outputs/project-audit/schema-dictionary.md', dictionary);
await writeFile('outputs/project-audit/schema-er.mmd', er);
console.log(JSON.stringify({ tables: tables.length, columns: tables.reduce((n, t) => n + t.columns.length, 0), explicitIndexes: tables.flatMap(t => t.indexes).filter(i => i.sql).length, tableNames: tables.map(t => t.name) }));
db.close();
