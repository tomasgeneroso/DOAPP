import { config } from 'dotenv';
import { Sequelize } from 'sequelize';
import readline from 'readline';

// Load environment variables
config();

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'doapp',
  username: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  logging: false,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function cleanup() {
  try {
    console.log('🔄 Conectando a PostgreSQL...');
    await sequelize.authenticate();
    console.log('✅ Conexión establecida\n');

    // Buscar usuarios sin referral completo
    const [users] = await sequelize.query(`
      SELECT u.id, u.email, u.name, u.referred_by, u.created_at
      FROM users u
      WHERE u.referred_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM referrals r WHERE r.referred_user_id = u.id
      )
      ORDER BY u.created_at DESC
      LIMIT 10;
    `);

    if (!users || (users as any[]).length === 0) {
      console.log('✅ No se encontraron usuarios con problemas de referido');
      await sequelize.close();
      rl.close();
      process.exit(0);
    }

    console.log('📋 Usuarios encontrados con problemas de referido:\n');
    (users as any[]).forEach((user, idx) => {
      console.log(`${idx + 1}. Email: ${user.email}`);
      console.log(`   Nombre: ${user.name}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Creado: ${user.created_at}\n`);
    });

    rl.question('¿Quieres eliminar estos usuarios? (s/n): ', async (answer) => {
      if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'y') {
        const userIds = (users as any[]).map((u: any) => u.id);

        console.log('\n🗑️  Eliminando usuarios...');
        await sequelize.query(`
          DELETE FROM users WHERE id = ANY(ARRAY[$1]::uuid[]);
        `, {
          bind: [userIds]
        });

        console.log(`✅ ${(users as any[]).length} usuario(s) eliminado(s)`);
      } else {
        console.log('❌ Operación cancelada');
      }

      await sequelize.close();
      rl.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    await sequelize.close();
    rl.close();
    process.exit(1);
  }
}

cleanup();
