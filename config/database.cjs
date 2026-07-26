// Sequelize CLI database config.
// Secrets come from environment variables (loaded from .env by .sequelizerc,
// which is gitignored) — never commit plaintext credentials here.
//   - development: local DB, password from DEV_DB_PASSWORD
//   - test:        CI/local test DB, connection from TEST_DATABASE_URL
//   - production:  connection from DATABASE_URL
module.exports = {
  development: {
    username: process.env.DEV_DB_USER || 'postgres',
    password: process.env.DEV_DB_PASSWORD || null,
    database: process.env.DEV_DB_NAME || 'doapp_test',
    host: process.env.DEV_DB_HOST || 'localhost',
    port: Number(process.env.DEV_DB_PORT || 5433),
    dialect: 'postgres',
    logging: false,
  },
  test: {
    username: 'postgres',
    password: null,
    database: 'doapp_test',
    host: 'localhost',
    port: 5433,
    dialect: 'postgres',
    logging: false,
    use_env_variable: 'TEST_DATABASE_URL',
  },
  production: {
    username: 'postgres',
    password: null,
    database: 'doapp',
    host: 'localhost',
    port: 5432,
    dialect: 'postgres',
    logging: false,
    use_env_variable: 'DATABASE_URL',
  },
};
