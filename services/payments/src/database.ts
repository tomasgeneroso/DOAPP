import { Sequelize } from 'sequelize-typescript';
import { config } from './config.js';

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  username: config.database.user,
  password: config.database.password,
  logging: config.isProduction ? false : console.log,
  pool: {
    max: 20,
    min: 5,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
  },
});

export async function initializeDatabase(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log(`✅ [${config.serviceName}] Database connection established`);

    // Import models
    const { Contract } = await import('./models/Contract.model.js');
    const { Payment } = await import('./models/Payment.model.js');
    const { Membership } = await import('./models/Membership.model.js');
    const { BalanceTransaction } = await import('./models/BalanceTransaction.model.js');

    // Add models to sequelize
    sequelize.addModels([Contract, Payment, Membership, BalanceTransaction]);

    // Sync models (only in development)
    if (!config.isProduction) {
      await sequelize.sync({ alter: true });
      console.log(`✅ [${config.serviceName}] Models synchronized`);
    }
  } catch (error) {
    console.error(`❌ [${config.serviceName}] Database connection failed:`, error);
    throw error;
  }
}
