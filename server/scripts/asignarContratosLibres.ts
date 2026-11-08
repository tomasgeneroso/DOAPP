/**
 * Da el BENEFICIO DE LANZAMIENTO (POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO contrato libre de comisión, una sola vez, y POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO mes de PRO)
 * a las cuentas que ya existían: las más antiguas con la identidad VERIFICADA, hasta POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES. A las que la regla anterior
 * había marcado como «primeras» al registrarse pero NO están verificadas les quita la marca (la reciben al verificarse). Las cuentas nuevas lo reciben solas
 * al verificarse.
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
