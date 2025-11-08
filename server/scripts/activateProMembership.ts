import mongoose from 'mongoose';
import User from '../models/User.js';
import Membership from '../models/Membership.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script para activar membresía PRO de un usuario específico
 * Uso: npx tsx server/scripts/activateProMembership.ts <email>
 */

async function activateProMembership(email: string) {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ MongoDB conectado');

    // Buscar usuario por email
    const user = await User.findOne({ email });
    if (!user) {
      console.error('❌ Usuario no encontrado:', email);
      process.exit(1);
    }

    console.log('👤 Usuario encontrado:', user.email);
    console.log('📊 Estado actual:');
    console.log('   - membershipTier:', user.membershipTier || 'free');
    console.log('   - hasMembership:', user.hasMembership || false);
    console.log('   - monthlyContractsUsed:', user.monthlyContractsUsed || 0);
    console.log('   - monthlyFreeContractsLimit:', user.monthlyFreeContractsLimit || 0);

    // Buscar o crear membresía
    let membership = await Membership.findOne({ userId: user._id });

    if (!membership) {
      console.log('📝 Creando nueva membresía PRO...');
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      membership = new Membership({
        userId: user._id,
        tier: 'pro',
        status: 'active',
        startDate,
        endDate,
        priceEUR: 5.99,
        priceARS: 6480, // Aproximado
        exchangeRateAtPurchase: 1080, // EUR/ARS aproximado
        autoRenew: true,
        paymentMethod: 'mercadopago',
        paymentStatus: 'paid',
        lastPaymentDate: new Date(),
      });
      await membership.save();
      console.log('✅ Membresía creada');
    } else {
      console.log('📝 Actualizando membresía existente...');
      membership.status = 'active';
      membership.tier = 'pro';
      membership.paymentStatus = 'paid';
      membership.lastPaymentDate = new Date();

      if (!membership.endDate || membership.endDate < new Date()) {
        const newEndDate = new Date();
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        membership.endDate = newEndDate;
      }

      await membership.save();
      console.log('✅ Membresía actualizada');
    }

    // Actualizar usuario
    console.log('👤 Actualizando usuario...');
    user.membershipTier = 'pro';
    user.hasMembership = true;
    user.isPremiumVerified = false; // Se activará después de KYC
    user.monthlyContractsUsed = 0;
    user.monthlyFreeContractsLimit = 3;
    user.earnedBonusContract = false;
    user.lastMonthlyReset = new Date();
    user.currentCommissionRate = 2; // 2% para PRO
    user.membershipId = membership._id as mongoose.Types.ObjectId;
    user.membershipStartDate = membership.startDate;
    user.membershipEndDate = membership.endDate;

    await user.save();

    console.log('\n✅ MEMBRESÍA PRO ACTIVADA EXITOSAMENTE');
    console.log('📊 Nuevo estado:');
    console.log('   - membershipTier:', user.membershipTier);
    console.log('   - hasMembership:', user.hasMembership);
    console.log('   - monthlyContractsUsed:', user.monthlyContractsUsed);
    console.log('   - monthlyFreeContractsLimit:', user.monthlyFreeContractsLimit);
    console.log('   - currentCommissionRate:', user.currentCommissionRate + '%');
    console.log('   - membershipEndDate:', user.membershipEndDate);
    console.log('\n🎉 El usuario ahora tiene acceso completo a PRO!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB desconectado');
    process.exit(0);
  }
}

// Obtener email de los argumentos
const email = process.argv[2];

if (!email) {
  console.error('❌ Debes proporcionar un email');
  console.log('Uso: npx tsx server/scripts/activateProMembership.ts <email>');
  process.exit(1);
}

activateProMembership(email);
