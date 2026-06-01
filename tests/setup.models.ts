// Setup for the CommonJS "models" jest project.
// CommonJS tolerates the circular imports between Sequelize models (ESM throws a
// TDZ: "Cannot access 'Payment' before initialization"), so here we can safely
// register the full model set on the shared Sequelize instance.
import dotenv from 'dotenv';
import { initDatabase } from '../server/config/database.js';

dotenv.config({ path: '.env.test' });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.CLIENT_URL = 'http://localhost:5173';

if (typeof jest !== 'undefined') {
  jest.setTimeout(30000);
}

// Register all models (sequelize.addModels) before model tests run.
beforeAll(async () => {
  await initDatabase();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
