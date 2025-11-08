import mongoose from 'mongoose';
import Advertisement from '../models/Advertisement.js';
import { config } from '../config/env.js';

const deleteAds = async () => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Conectado a MongoDB');

    const result = await Advertisement.deleteMany({});
    console.log(`🗑️  Eliminadas ${result.deletedCount} publicidades`);

    mongoose.connection.close();
    console.log('✅ Conexión cerrada');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

deleteAds();
