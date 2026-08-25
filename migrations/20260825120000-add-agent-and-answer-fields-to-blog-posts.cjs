'use strict';

/**
 * Content-agent authorship, the review gate, and the two blocks answer engines
 * lift (FAQ pairs and one-sentence takeaways).
 *
 * Idempotent: mirrors ensureCriticalSchema, which creates the same columns on
 * boot.
 */
module.exports = {
  async up(queryInterface) {
    const sql = [
      `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS generated_by VARCHAR(16) NOT NULL DEFAULT 'human'`,
      `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS reviewed_by UUID`,
      `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,
      `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
      `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS faq JSONB NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb`,
    ];
    for (const s of sql) await queryInterface.sequelize.query(s);
  },

  async down(queryInterface) {
    const cols = ['generated_by', 'reviewed_by', 'reviewed_at', 'rejection_reason', 'faq', 'key_takeaways'];
    for (const c of cols) {
      await queryInterface.sequelize.query(`ALTER TABLE blog_posts DROP COLUMN IF EXISTS ${c}`);
    }
  },
};
