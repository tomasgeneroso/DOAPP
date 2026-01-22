import { initDatabase } from '../config/database.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';

async function check() {
  await initDatabase();
  console.log('✅ Connected\n');

  const payments = await Payment.findAll({
    where: { status: 'pending_verification' },
    include: [
      {
        model: Contract,
        as: 'contract',
        include: [{ model: Job, as: 'job' }]
      }
    ],
    limit: 3
  });

  for (const payment of payments) {
    const p = payment.toJSON() as any;
    console.log('=== Payment ===');
    console.log('ID:', p.id.substring(0, 8));
    console.log('Amount (worker payment):', p.amount);
    console.log('Platform Fee:', p.platformFee);
    console.log('Platform Fee %:', p.platformFeePercentage);
    console.log('');
    console.log('Contract ID:', p.contract?.id?.substring(0, 8));
    console.log('Contract Commission:', p.contract?.commission);
    console.log('Contract Price:', p.contract?.price);
    console.log('Job Title:', p.contract?.job?.title);
    console.log('---');
  }

  process.exit(0);
}

check().catch(console.error);
