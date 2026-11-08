/**
 * Busca cuentas de la MISMA persona con documentos distintos (por ejemplo, su DNI y su pasaporte argentinos y su DNI y pasaporte italianos): las que comparten la
 * clave de persona (primer apellido + primer nombre + fecha de nacimiento) a partir de los datos de Didit que cada cuenta guardó.
 *
 * Por defecto solo muestra qué encontraría (vista previa) y no escribe nada. Con --aplicar guarda la clave de cada cuenta y deja las alertas para administración
 * (Administración → Identidades): no une ni bloquea ninguna cuenta. Correrlo de nuevo no repite alertas. No imprime nombres ni fechas de nacimiento.
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/detectarCuentasDuplicadas.ts            # vista previa
 *   npx tsx server/scripts/detectarCuentasDuplicadas.ts --aplicar  # escribe
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { esPermisoDenegado, explicarPermisoDenegado } from '../services/permisosDeLaBase.js';
import { detectarDuplicadosExistentes } from '../services/identidadDePersona.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

initDatabase()
  .then(() => detectarDuplicadosExistentes({ aplicar: process.argv.includes('--aplicar') }))
  .catch(async (e) => {
    console.error('Error:', esPermisoDenegado(e) ? await explicarPermisoDenegado(e) : e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
