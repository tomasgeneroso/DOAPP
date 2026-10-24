/**
 * Marca como «primeras cuentas» (POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES) a las que ya existían: las más antiguas con el registro completo.
 * Quedan con el contrato libre de comisión del mes durante un año (POLITICAS.CONTRATOS_LIBRES_POR_MES). Las cuentas nuevas se marcan solas al completar
 * el registro.
 *
 * Por defecto solo muestra qué haría (vista previa). Con --aplicar lo escribe. Correrlo dos veces no duplica nada.
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/asignarContratosLibres.ts            # vista previa
 *   npx tsx server/scripts/asignarContratosLibres.ts --aplicar  # escribe
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { esPermisoDenegado, explicarPermisoDenegado } from '../services/permisosDeLaBase.js';
import { asignarContratosLibresAExistentes } from '../services/exencionDeComision.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

initDatabase()
  .then(() => asignarContratosLibresAExistentes({ aplicar: process.argv.includes('--aplicar') }))
  .catch(async (e) => {
    console.error('Error:', esPermisoDenegado(e) ? await explicarPermisoDenegado(e) : e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
