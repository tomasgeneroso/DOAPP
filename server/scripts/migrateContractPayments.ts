import { config } from 'dotenv';
config();

import { initDatabase } from '../config/database.js';
import Payment from '../models/sql/Payment.model.js';
import Contract from '../models/sql/Contract.model.js';
import User from '../models/sql/User.model.js';
import Job from '../models/sql/Job.model.js';

/**
 * Script para crear Payment records para contratos existentes
 * que no tienen Payment asociado
 */
async function migrateContractPayments() {
  try {
    await initDatabase();

    console.log('\n=== Migrating Contract Payments ===\n');

    // Find all contracts without a Payment record
    const contracts = await Contract.findAll({
      where: {
        paymentStatus: ['pending', 'pending_verification', 'pending_payout', 'escrow', 'held_escrow']
      },
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'title']
        }
      ]
    });

    console.log(`Found ${contracts.length} contracts needing Payment records\n`);

    let created = 0;
    let skipped = 0;

    for (const contract of contracts) {
      const contractData = contract.toJSON() as any;

      // Check if payment already exists for this contract
      const existingPayment = await Payment.findOne({
        where: { contractId: contract.id }
      });

      if (existingPayment) {
        console.log(`⏭️  Skipped: Contract ${contract.id} already has Payment`);
        skipped++;
        continue;
      }

      // Determine payment status based on contract status
      let paymentStatus: string;
      if (contract.paymentStatus === 'pending_payout') {
        // Contract completed, waiting for admin to pay worker
        paymentStatus = 'pending_verification'; // Admin needs to verify and pay
      } else if (contract.paymentStatus === 'escrow' || contract.paymentStatus === 'held_escrow') {
        // Payment already in escrow
        paymentStatus = 'held_escrow';
      } else {
        // Contract pending payment from client
        paymentStatus = 'pending_verification';
      }

      // Create Payment record
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: contract.clientId,
        recipientId: contract.doerId,
        amount: contract.allocatedAmount || contract.price,
        currency: 'ARS',
        status: paymentStatus,
        paymentType: 'contract_payment',
        paymentMethod: 'mercadopago', // Default to mercadopago
        isEscrow: true,
        platformFee: 0, // Calculate if needed
        platformFeePercentage: 0,
        pendingVerification: paymentStatus === 'pending_verification',
        description: `Pago para contrato: ${contractData.job?.title || 'Sin título'}`,
        metadata: {
          migratedFromContract: true,
          migratedAt: new Date().toISOString(),
          originalPaymentStatus: contract.paymentStatus,
          originalEscrowStatus: contract.escrowStatus
        }
      });

      console.log(`✅ Created Payment for Contract ${contract.id}`);
      console.log(`   - Job: ${contractData.job?.title}`);
      console.log(`   - Client: ${contractData.client?.name}`);
      console.log(`   - Doer: ${contractData.doer?.name}`);
      console.log(`   - Amount: $${payment.amount} ARS`);
      console.log(`   - Status: ${payment.status}`);
      console.log('');

      created++;
    }

    console.log('\n=== Migration Complete ===');
    console.log(`✅ Created: ${created} payments`);
    console.log(`⏭️  Skipped: ${skipped} payments (already exist)`);
    console.log(`📊 Total processed: ${contracts.length} contracts\n`);

    // Verify results
    const totalPayments = await Payment.count();
    const pendingPayments = await Payment.count({
      where: {
        status: ['pending_verification', 'pending']
      }
    });

    console.log(`\n📈 Database Summary:`);
    console.log(`   Total Payments: ${totalPayments}`);
    console.log(`   Pending Verification: ${pendingPayments}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateContractPayments();
