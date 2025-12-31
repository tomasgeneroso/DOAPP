/**
 * Script para crear contratos faltantes para trabajos en equipo
 * Ejecutar: npx tsx server/scripts/fixMissingContracts.ts
 */

import pg from 'pg';
import dbConfig from '../../config/database.json' with { type: 'json' };

const env = process.env.NODE_ENV || 'development';
const config = (dbConfig as any)[env];

const PLATFORM_COMMISSION = 0.1;

async function fixMissingContracts() {
  console.log('🔧 Buscando trabajos con contratos faltantes...\n');

  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
  });

  try {
    await client.connect();
    console.log('✅ Conexión a la base de datos establecida\n');

    // Buscar trabajos en equipo con propuestas aprobadas pero sin contratos
    const jobsResult = await client.query(`
      SELECT j.id, j.title, j.price, j.client_id, j.start_date, j.end_date
      FROM jobs j
      WHERE j.max_workers > 1
        AND j.status IN ('open', 'in_progress')
        AND EXISTS (
          SELECT 1 FROM proposals p WHERE p.job_id = j.id AND p.status = 'approved'
        )
    `);

    for (const job of jobsResult.rows) {
      console.log(`\n📋 Verificando Job: ${job.title} (${job.id})`);

      // Buscar propuestas aprobadas sin contrato
      const proposalsResult = await client.query(`
        SELECT p.id, p.freelancer_id, p.proposed_price, p.estimated_duration, p.client_id
        FROM proposals p
        WHERE p.job_id = $1
          AND p.status = 'approved'
          AND NOT EXISTS (
            SELECT 1 FROM contracts c WHERE c.job_id = p.job_id AND c.doer_id = p.freelancer_id
          )
      `, [job.id]);

      if (proposalsResult.rows.length === 0) {
        console.log('   ✅ Todos los contratos existen');
        continue;
      }

      console.log(`   ⚠️ Encontradas ${proposalsResult.rows.length} propuestas sin contrato`);

      for (const proposal of proposalsResult.rows) {
        const workerAllocation = parseFloat(proposal.proposed_price);
        const commission = workerAllocation * PLATFORM_COMMISSION;
        const totalPrice = workerAllocation + commission;
        const jobPrice = parseFloat(job.price);
        const percentageOfBudget = (workerAllocation / jobPrice) * 100;

        // Generate pairing code
        const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
        const pairingExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Use job dates
        const startDate = job.start_date || new Date();
        const endDate = job.end_date || new Date(Date.now() + (proposal.estimated_duration || 7) * 24 * 60 * 60 * 1000);

        const insertResult = await client.query(`
          INSERT INTO contracts (
            id, job_id, client_id, doer_id, type, price, commission, total_price,
            start_date, end_date, status, terms_accepted, terms_accepted_by_client,
            terms_accepted_by_doer, pairing_code, pairing_generated_at, pairing_expiry,
            allocated_amount, percentage_of_budget, client_confirmed, doer_confirmed,
            created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, 'trabajo', $4, $5, $6,
            $7, $8, 'pending', false, false,
            false, $9, NOW(), $10,
            $4, $11, false, false,
            NOW(), NOW()
          ) RETURNING id
        `, [
          job.id,
          job.client_id,
          proposal.freelancer_id,
          workerAllocation,
          commission,
          totalPrice,
          startDate,
          endDate,
          pairingCode,
          pairingExpiry,
          percentageOfBudget
        ]);

        console.log(`   ✅ Contrato creado: ${insertResult.rows[0].id} para worker ${proposal.freelancer_id}`);
      }
    }

    console.log('\n✅ Proceso completado');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

fixMissingContracts();
