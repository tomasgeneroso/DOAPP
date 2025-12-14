// Test setup for PostgreSQL/Sequelize
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Mock environment variables for testing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.CLIENT_URL = 'http://localhost:5173';

// Increase timeout for database operations
jest.setTimeout(30000);

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
