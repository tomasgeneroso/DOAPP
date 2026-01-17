import { sequelize, initDatabase } from '../config/database.js';
import { User } from '../models/sql/User.model.js';

async function check() {
  try {
    await initDatabase();
    console.log('Connected to DB');

    const admin = await User.findOne({ where: { email: 'admin@test.com' } });
    if (admin) {
      console.log('Found user:');
      console.log('  email:', admin.email);
      console.log('  role:', admin.role);
      console.log('  adminRole:', admin.adminRole);
      console.log('  id:', admin.id);
    } else {
      console.log('User admin@test.com not found');
    }

    await sequelize.close();
    process.exit(0);
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

check();
