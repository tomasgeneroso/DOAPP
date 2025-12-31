/**
 * Script para testear trabajos en equipo
 * Ejecutar: npx tsx server/scripts/testTeamJob.ts
 */

import pg from 'pg';
import dbConfig from '../../config/database.json' with { type: 'json' };

const env = process.env.NODE_ENV || 'development';
const config = (dbConfig as any)[env];

async function testTeamJob() {
  console.log('🧪 Iniciando test de trabajos en equipo...\n');

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

    // Buscar trabajos en equipo (maxWorkers > 1)
    const teamJobsResult = await client.query(`
      SELECT j.id, j.title, j.status, j.max_workers, j.selected_workers, j.doer_id, j.worker_allocations,
             u.name as client_name, u.email as client_email
      FROM jobs j
      LEFT JOIN users u ON j.client_id = u.id
      WHERE j.max_workers > 1
      ORDER BY j.created_at DESC
      LIMIT 5
    `);

    const teamJobs = teamJobsResult.rows;

    if (teamJobs.length === 0) {
      console.log('⚠️ No se encontraron trabajos en equipo\n');
      await client.end();
      return;
    }

    console.log(`📋 Encontrados ${teamJobs.length} trabajos en equipo:\n`);

    for (const job of teamJobs) {
      console.log('═'.repeat(60));
      console.log(`📌 Job ID: ${job.id}`);
      console.log(`   Título: ${job.title}`);
      console.log(`   Cliente: ${job.client_name}`);
      console.log(`   Estado: ${job.status}`);
      console.log(`   Max Workers: ${job.max_workers}`);
      console.log(`   Selected Workers: ${JSON.stringify(job.selected_workers)}`);
      console.log(`   Selected Workers Count: ${job.selected_workers?.length || 0}`);
      console.log(`   DoerId: ${job.doer_id || 'null'}`);
      console.log(`   Worker Allocations: ${JSON.stringify(job.worker_allocations, null, 2)}`);

      // Buscar propuestas para este trabajo
      const proposalsResult = await client.query(`
        SELECT p.id, p.status, p.freelancer_id, u.name as freelancer_name, u.email as freelancer_email
        FROM proposals p
        LEFT JOIN users u ON p.freelancer_id = u.id
        WHERE p.job_id = $1
      `, [job.id]);

      console.log(`\n   📝 Propuestas (${proposalsResult.rows.length}):`);
      for (const prop of proposalsResult.rows) {
        console.log(`      - ${prop.freelancer_name || 'Unknown'} (${prop.status}) - ID: ${prop.freelancer_id}`);
      }

      // Buscar contratos para este trabajo
      const contractsResult = await client.query(`
        SELECT c.id, c.status, c.doer_id, u.name as doer_name, u.email as doer_email
        FROM contracts c
        LEFT JOIN users u ON c.doer_id = u.id
        WHERE c.job_id = $1
      `, [job.id]);

      console.log(`\n   📄 Contratos (${contractsResult.rows.length}):`);
      for (const contract of contractsResult.rows) {
        console.log(`      - ${contract.doer_name || 'Unknown'} (${contract.status}) - DoerID: ${contract.doer_id}`);
      }

      // Verificar inconsistencias
      console.log('\n   🔍 Verificación de consistencia:');

      const selectedCount = job.selected_workers?.length || 0;
      const contractCount = contractsResult.rows.filter((c: any) => c.status !== 'cancelled').length;
      const approvedProposals = proposalsResult.rows.filter((p: any) => p.status === 'approved').length;

      if (selectedCount !== contractCount) {
        console.log(`      ❌ INCONSISTENCIA: selectedWorkers (${selectedCount}) != contratos activos (${contractCount})`);
      } else {
        console.log(`      ✅ selectedWorkers coincide con contratos activos`);
      }

      if (selectedCount !== approvedProposals) {
        console.log(`      ❌ INCONSISTENCIA: selectedWorkers (${selectedCount}) != propuestas aprobadas (${approvedProposals})`);
      } else {
        console.log(`      ✅ selectedWorkers coincide con propuestas aprobadas`);
      }

      // Verificar que doerId esté en selectedWorkers si existe
      if (job.doer_id && job.selected_workers && !job.selected_workers.includes(job.doer_id)) {
        console.log(`      ❌ INCONSISTENCIA: doerId no está en selectedWorkers`);
      }

      // CORREGIR INCONSISTENCIAS si es necesario
      if (selectedCount !== approvedProposals && approvedProposals > 0) {
        console.log(`\n   🔧 CORRIGIENDO: Actualizando selectedWorkers basado en propuestas aprobadas...`);

        const approvedFreelancerIds = proposalsResult.rows
          .filter((p: any) => p.status === 'approved')
          .map((p: any) => p.freelancer_id);

        // Actualizar selectedWorkers
        await client.query(`
          UPDATE jobs
          SET selected_workers = $1
          WHERE id = $2
        `, [approvedFreelancerIds, job.id]);

        console.log(`      ✅ selectedWorkers actualizado a: ${JSON.stringify(approvedFreelancerIds)}`);

        // Si hay al menos un trabajador aprobado y no hay doerId, asignar el primero
        if (approvedFreelancerIds.length > 0 && !job.doer_id) {
          await client.query(`
            UPDATE jobs
            SET doer_id = $1
            WHERE id = $2
          `, [approvedFreelancerIds[0], job.id]);
          console.log(`      ✅ doerId asignado: ${approvedFreelancerIds[0]}`);
        }
      }

      console.log('\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
    console.log('✅ Test completado');
  }
}

testTeamJob();
