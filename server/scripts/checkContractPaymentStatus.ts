import { initDatabase } from '../config/database.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';

async function checkContractPaymentStatus() {
  await initDatabase();
  console.log('✅ Database connected');

  // Get all contracts with their payments
  const contracts = await Contract.findAll({
    where: {
      status: 'completed'
    },
    include: [
      { model: Job, as: 'job', attributes: ['id', 'title'] },
      { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'doer', attributes: ['id', 'name', 'email'] }
    ]
  });

  console.log(`\n=== Contratos Completados (${contracts.length}) ===\n`);

  for (const contract of contracts) {
    const job = contract.job as any;
    const client = contract.client as any;
    const doer = contract.doer as any;

    // Find associated payment
    const payment = await Payment.findOne({
      where: { contractId: contract.id }
    });

    console.log(`📋 Contract: ${contract.id.substring(0, 8)}...`);
    console.log(`   Job: ${job?.title || 'N/A'}`);
    console.log(`   Cliente: ${client?.name} → Trabajador: ${doer?.name}`);
    console.log(`   Precio: $${contract.price}`);
    console.log(`   Contract Status: ${contract.status}`);
    console.log(`   Contract escrowStatus: ${contract.escrowStatus}`);
    console.log(`   Contract paymentStatus: ${contract.paymentStatus}`);
    console.log(`   clientConfirmed: ${contract.clientConfirmed}`);
    console.log(`   doerConfirmed: ${contract.doerConfirmed}`);

    if (payment) {
      console.log(`   💰 Payment ID: ${payment.id.substring(0, 8)}...`);
      console.log(`   💰 Payment status: ${payment.status}`);
      console.log(`   💰 Payment amount: $${payment.amount}`);
      console.log(`   💰 Payment platformFee: $${payment.platformFee || 0}`);
    } else {
      console.log(`   ⚠️ NO PAYMENT RECORD FOUND!`);
    }

    // Diagnose issue
    if (contract.clientConfirmed && contract.doerConfirmed) {
      if (payment?.status === 'pending_verification' || payment?.status === 'pending') {
        console.log(`   ❌ PROBLEMA: Contrato completado pero pago no verificado por admin`);
        console.log(`   ➡️ Este contrato NO aparecerá en "Pagos a Trabajadores" hasta que admin verifique el pago`);
      } else if (payment?.status === 'held_escrow' || contract.escrowStatus === 'held_escrow') {
        console.log(`   ✅ Escrow verificado - Listo para pagar al trabajador`);
      } else if (payment?.status === 'completed') {
        console.log(`   ✅ Pago completado - Trabajador ya recibió el pago`);
      }
    }

    console.log('');
  }

  process.exit(0);
}

checkContractPaymentStatus().catch(console.error);
