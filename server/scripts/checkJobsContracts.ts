import { config } from 'dotenv';
config();

import { initDatabase } from '../config/database.js';
import Job from '../models/sql/Job.model.js';
import Contract from '../models/sql/Contract.model.js';
import User from '../models/sql/User.model.js';

async function checkJobsContracts() {
  try {
    await initDatabase();

    console.log('\n=== Checking Jobs & Contracts ===\n');

    // Check jobs
    const jobs = await Job.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'status', 'price', 'publicationPaymentId', 'createdAt'],
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['name', 'email']
        }
      ]
    });

    console.log(`Total jobs: ${jobs.length}\n`);

    if (jobs.length > 0) {
      console.log('Recent jobs:');
      jobs.forEach((j: any) => {
        console.log(`  - ${j.title}`);
        console.log(`    Status: ${j.status}`);
        console.log(`    Price: ${j.price} ARS`);
        console.log(`    Client: ${j.client?.name}`);
        console.log(`    Has Payment ID: ${j.publicationPaymentId ? 'Yes' : 'No'}`);
        console.log(`    Created: ${j.createdAt}`);
        console.log('');
      });
    }

    // Check jobs that need publication payment
    const jobsNeedingPayment = await Job.findAll({
      where: {
        status: ['draft', 'pending_payment', 'pending_approval']
      }
    });

    console.log(`Jobs needing publication payment: ${jobsNeedingPayment.length}\n`);

    // Check contracts
    const contracts = await Contract.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'status', 'price', 'paymentStatus', 'escrowStatus', 'createdAt'],
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['name']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['name']
        },
        {
          model: Job,
          as: 'job',
          attributes: ['title']
        }
      ]
    });

    console.log(`Total contracts: ${contracts.length}\n`);

    if (contracts.length > 0) {
      console.log('Recent contracts:');
      contracts.forEach((c: any) => {
        console.log(`  - Job: ${c.job?.title}`);
        console.log(`    Status: ${c.status}`);
        console.log(`    Payment Status: ${c.paymentStatus}`);
        console.log(`    Escrow Status: ${c.escrowStatus}`);
        console.log(`    Price: ${c.price} ARS`);
        console.log(`    Client: ${c.client?.name}`);
        console.log(`    Doer: ${c.doer?.name}`);
        console.log('');
      });
    }

    // Check contracts needing payment
    const contractsNeedingPayment = await Contract.findAll({
      where: {
        paymentStatus: ['pending', 'pending_verification']
      }
    });

    console.log(`Contracts needing payment: ${contractsNeedingPayment.length}\n`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkJobsContracts();
