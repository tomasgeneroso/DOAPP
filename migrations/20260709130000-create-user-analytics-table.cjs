'use strict';

/**
 * Creates the user_analytics table. It's registered in the model layer and
 * normally created by sequelize.sync(), but production drifted (sync ran before
 * the model existed / didn't create it), so queries fail with
 * `relation "user_analytics" does not exist`. Idempotent: CREATE TABLE/INDEX IF
 * NOT EXISTS. Column names/types mirror the model (underscored, timestamps).
 * `id` has no DB default — Sequelize supplies the UUIDV4 on insert.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`CREATE TABLE IF NOT EXISTS user_analytics (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      profile_views_total INTEGER NOT NULL DEFAULT 0,
      profile_views_unique INTEGER NOT NULL DEFAULT 0,
      profile_views_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      conversations_total INTEGER NOT NULL DEFAULT 0,
      conversations_with_completed_contract INTEGER NOT NULL DEFAULT 0,
      conversation_partners JSONB NOT NULL DEFAULT '[]'::jsonb,
      contracts_total_completed INTEGER NOT NULL DEFAULT 0,
      contracts_total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
      contracts_average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
      contracts_repeat_clients INTEGER NOT NULL DEFAULT 0,
      contracts_success_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      contracts_average_completion_time NUMERIC(10,2) NOT NULL DEFAULT 0,
      contracts_by_category JSONB NOT NULL DEFAULT '[]'::jsonb,
      contracts_monthly_stats JSONB NOT NULL DEFAULT '[]'::jsonb,
      search_appearances_total INTEGER NOT NULL DEFAULT 0,
      search_clicked_from_search INTEGER NOT NULL DEFAULT 0,
      search_click_through_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      engagement_proposals_sent INTEGER NOT NULL DEFAULT 0,
      engagement_proposals_accepted INTEGER NOT NULL DEFAULT 0,
      engagement_acceptance_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      engagement_average_response_time NUMERIC(10,2) NOT NULL DEFAULT 0,
      engagement_jobs_posted INTEGER NOT NULL DEFAULT 0,
      engagement_jobs_completed INTEGER NOT NULL DEFAULT 0,
      peak_activity_most_active_day VARCHAR(20),
      peak_activity_most_active_hour INTEGER,
      peak_activity_most_active_month VARCHAR(20),
      last_calculated TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await q(`CREATE UNIQUE INDEX IF NOT EXISTS user_analytics_user_id_unique ON user_analytics (user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS user_analytics_last_calculated ON user_analytics (last_calculated)`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS user_analytics`);
  },
};
