/**
 * Reparte los contratos libres de comisión de lanzamiento (POLITICAS.CONTRATOS_LIBRES_DE_COMISION) entre las cuentas que ya existían: las más
 * antiguas, hasta completar POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES. Las cuentas nuevas lo reciben solas al crearse.
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
