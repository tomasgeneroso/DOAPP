import bcrypt from 'bcryptjs';
import pg from 'pg';

const hashPasswords = async () => {
  const client = new pg.Client({
    host: 'localhost',
    port: 5433,
    database: 'doapp_test',
    user: 'postgres',
    password: 'Corchoytomsy99'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Hash the password using bcryptjs (same as User model)
    const password = '123456';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    console.log('Original password:', password);
    console.log('Hashed password:', hashedPassword);
    console.log('Hash length:', hashedPassword.length);

    // Update ALL users with this hashed password (replace existing hashes)
    const result = await client.query(
      'UPDATE users SET password = $1',
      [hashedPassword]
    );

    console.log(`✅ Updated ${result.rowCount} users with hashed passwords`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
};

hashPasswords();
