import { config } from 'dotenv';
config();

import { initDatabase } from '../config/database.js';
import Payment from '../models/sql/Payment.model.js';
import User from '../models/sql/User.model.js';
import Contract from '../models/sql/Contract.model.js';

async function checkPayments() {
  try {
    await initDatabase();

    console.log('\n=== Checking Payments Table ===\n');

    // Get all payments
    const allPayments = await Payment.findAll({
      limit: 20,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'status', 'paymentType', 'amount', 'pendingVerification', 'mercadopagoPaymentId', 'createdAt']
    });

    console.log(`Total payments found: ${allPayments.length}\n`);

    if (allPayments.length > 0) {
      console.log('Recent payments:');
      allPayments.forEach((p: any) => {
        console.log(`  - ID: ${p.id.substring(0, 8)}...`);
        console.log(`    Type: ${p.paymentType}`);
        console.log(`    Status: ${p.status}`);
        console.log(`    Amount: ${p.amount} ARS`);
        console.log(`    Pending Verification: ${p.pendingVerification}`);
        console.log(`    MercadoPago ID: ${p.mercadopagoPaymentId || 'N/A'}`);
        console.log(`    Created: ${p.createdAt}`);
        console.log('');
      });
    }

    // Check pending_verification payments
    const pendingPayments = await Payment.findAll({
      where: {
        status: ['pending_verification', 'pending']
      },
      include: [
        {
          model: User,
          as: 'payer',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'recipient',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    console.log(`\nPayments with status pending/pending_verification: ${pendingPayments.length}\n`);

    if (pendingPayments.length > 0) {
      pendingPayments.forEach((p: any) => {
        console.log(`  - ID: ${p.id}`);
        console.log(`    Type: ${p.paymentType}`);
        console.log(`    Status: ${p.status}`);
        console.log(`    Amount: ${p.amount} ARS`);
        console.log(`    Payer: ${p.payer?.name || 'N/A'}`);
        console.log(`    Recipient: ${p.recipient?.name || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('  ⚠️  No pending payments found in database!\n');
      console.log('  This explains why the finance module is empty.');
      console.log('  Solutions:');
      console.log('  1. Create a test payment through the app');
      console.log('  2. Process an existing job publication payment');
      console.log('  3. Create a contract and process its payment\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPayments();
