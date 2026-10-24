import cron from 'node-cron';
import { iniciarContratosQueLlegaronASuHora, cerrarContratosQueTerminaron } from '../services/cicloDelContrato.js';

/**
 * Cada 5 minutos: empieza los contratos a los que les llegó la hora de inicio y pasa a «esperando confirmación» los que llegaron a su hora de fin sin
 * que nadie confirmara (24 h después se dan por terminados). Las reglas y el porqué están en services/cicloDelContrato.ts; la confirmación automática (pago) sigue en autoConfirmContracts.ts.
 */
export function startCicloDelContratoJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const empezaron = await iniciarContratosQueLlegaronASuHora();
      const terminaron = await cerrarContratosQueTerminaron();
      if (empezaron || terminaron) console.log(`🔄 [CRON] Ciclo del contrato: ${empezaron} empezaron, ${terminaron} terminaron`);
    } catch (error) {
      console.error('❌ [CRON] Error en el ciclo del contrato:', error);
    }
  });
  console.log('✅ [CRON] Ciclo del contrato iniciado (cada 5 minutos)');
}
