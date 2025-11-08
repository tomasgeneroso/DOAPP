import { config } from 'dotenv';
import { Sequelize } from 'sequelize';

// Load environment variables
config();

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'doapp',
  username: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  logging: console.log,
});

async function migrate() {
  try {
    console.log('🔄 Conectando a PostgreSQL...');
    await sequelize.authenticate();
    console.log('✅ Conexión establecida');

    console.log('\n🔄 Ejecutando migración de campos de referidos...\n');

    // Agregar columna referralCode
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE;
    `);
    console.log('✅ Columna referral_code agregada');

    // Crear índice
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    `);
    console.log('✅ Índice creado');

    // Agregar campos de contadores
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0 NOT NULL;
    `);
    console.log('✅ Columna total_referrals agregada');

    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_referrals INTEGER DEFAULT 0 NOT NULL;
    `);
    console.log('✅ Columna completed_referrals agregada');

    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS free_contracts_remaining INTEGER DEFAULT 0 NOT NULL;
    `);
    console.log('✅ Columna free_contracts_remaining agregada');

    // Campos early users
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_early_user BOOLEAN DEFAULT FALSE NOT NULL;
    `);
    console.log('✅ Columna is_early_user agregada');

    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS early_user_number INTEGER;
    `);
    console.log('✅ Columna early_user_number agregada');

    // Códigos de invitación
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_codes_remaining INTEGER DEFAULT 3 NOT NULL;
    `);
    console.log('✅ Columna invitation_codes_remaining agregada');

    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_codes_used INTEGER DEFAULT 0 NOT NULL;
    `);
    console.log('✅ Columna invitation_codes_used agregada');

    // Tasa de comisión
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS current_commission_rate DECIMAL(4, 2) DEFAULT 8.0 NOT NULL;
    `);
    console.log('✅ Columna current_commission_rate agregada');

    // Beneficios usados
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_benefits_used INTEGER DEFAULT 0 NOT NULL;
    `);
    console.log('✅ Columna referral_benefits_used agregada');

    // Generar códigos para usuarios existentes
    console.log('\n🔄 Generando códigos de referido para usuarios existentes...');
    const result = await sequelize.query(`
      UPDATE users
      SET referral_code = UPPER(
        SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT) FROM 1 FOR 8)
      )
      WHERE referral_code IS NULL;
    `);
    console.log(`✅ Códigos generados para usuarios existentes`);

    console.log('\n✅ ¡Migración completada exitosamente!');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    await sequelize.close();
    process.exit(1);
  }
}

migrate();
