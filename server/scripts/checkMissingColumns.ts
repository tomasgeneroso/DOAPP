/**
 * Preventive column-drift check.
 *
 * Tables are created/grown by `sequelize.sync()`. Production runs with
 * `alter: false`, so columns added to a model AFTER its table was first synced
 * are never created on existing databases — causing runtime crashes like
 * `column Ticket.created_by does not exist` or `price_a_r_s does not exist`.
 *
 * This compares every model's expected DB columns (rawAttributes[].field, which
 * already resolves underscored snake_case) against the actual columns in
 * information_schema, and reports any the model expects but the DB lacks.
 *
 * Run:  npx tsx server/scripts/checkMissingColumns.ts
 * Exit: 0 = clean, 1 = missing columns found, 2 = error.
 */
import { sequelize, initDatabase } from '../config/database.js';

(async () => {
  await initDatabase();
  const models = sequelize.models as Record<string, any>;
  const report: { table: string; missing: string[] }[] = [];
  let totalMissing = 0;

  for (const name of Object.keys(models)) {
    const model = models[name];
    const tn = model.getTableName();
    const table = typeof tn === 'string' ? tn : tn.tableName;

    const [rows]: any = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = :t`,
      { replacements: { t: table } },
    );
    const actual = new Set<string>(rows.map((r: any) => r.column_name));
    if (actual.size === 0) continue; // table doesn't exist yet — skip

    const attrs = (model.getAttributes ? model.getAttributes() : model.rawAttributes) as Record<string, any>;
    const missing: string[] = [];
    for (const key of Object.keys(attrs)) {
      const a = attrs[key];
      if (a?.type?.key === 'VIRTUAL') continue; // not a real column
      const field = a.field || key;
      if (!actual.has(field)) missing.push(field);
    }
    if (missing.length) {
      report.push({ table, missing });
      totalMissing += missing.length;
    }
  }

  if (report.length === 0) {
    console.log('✅ No missing columns — every model attribute has a matching DB column.');
  } else {
    console.log('⚠️  Missing columns (model expects them, the DB lacks them):\n');
    for (const r of report) console.log(`  ${r.table}: ${r.missing.join(', ')}`);
    console.log(`\nTotal: ${totalMissing} column(s) across ${report.length} table(s).`);
    console.log('Fix each with an idempotent migration:');
    console.log('  ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <column> <type>;');
  }

  await sequelize.close();
  process.exit(report.length ? 1 : 0);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(2);
});
