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
    const { User } = await import('./models/User.model.js');
    const { RefreshToken } = await import('./models/RefreshToken.model.js');
    const { PasswordResetToken } = await import('./models/PasswordResetToken.model.js');

    // Add models to sequelize
    sequelize.addModels([User, RefreshToken, PasswordResetToken]);

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
