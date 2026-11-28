/**
 * Deshace una baja de presupuesto hecha con una persona ya elegida: el trabajo y su contrato vuelven al monto original y lo acreditado sale del saldo del cliente con
 * un asiento de ajuste. Por defecto solo muestra qué haría.
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/revertirBajaDePresupuesto.ts --publicacion=<id> [--aplicar]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { esPermisoDenegado, explicarPermisoDenegado } from '../services/permisosDeLaBase.js';
import { revertirBajaDePresupuesto } from '../services/reversionDeBaja.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

const arg = (nombre: string) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);

initDatabase()
  .then(() => {
    const publicacion = arg('publicacion');
    if (!publicacion) throw new Error('Falta --publicacion=<id>');
    return revertirBajaDePresupuesto({ publicacion, aplicar: process.argv.includes('--aplicar'), forzar: process.argv.includes('--forzar') });
  })
  .catch(async (e) => {
    console.error('Error:', esPermisoDenegado(e) ? await explicarPermisoDenegado(e) : e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
