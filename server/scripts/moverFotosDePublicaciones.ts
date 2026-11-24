/**
 * Pasa las fotos de las publicaciones del perfil a su propia carpeta (auditoría de seguridad, 2026-11-24).
 *
 * Hasta ese día las fotos de una publicación se guardaban en `uploads/disputes/`, mezcladas con las pruebas de los reclamos. Desde ahora esa carpeta es privada
 * (solo las ven las partes del reclamo y el equipo) y las publicaciones nuevas usan `uploads/post-media/`. Este script mueve las que ya existían y corrige la
 * dirección guardada en cada publicación, para que NINGUNA foto vieja quede en la carpeta privada ni haya que dejar excepciones.
 *
 *   npx tsx server/scripts/moverFotosDePublicaciones.ts            → vista previa (no toca nada)
 *   npx tsx server/scripts/moverFotosDePublicaciones.ts --aplicar  → mueve los archivos y actualiza las publicaciones
 *
 * Seguro de repetir: lo que ya se movió no se vuelve a tocar. Un archivo que no está en el disco se cuenta aparte y no frena el resto.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { Post } from '../models/sql/Post.model.js';
import { CARPETA_VIEJA, CARPETA_NUEVA, nombreEnLaCarpetaVieja, direccionNueva } from '../utils/fotosDePublicaciones.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

const aplicar = process.argv.includes('--aplicar');
const ORIGEN = CARPETA_VIEJA;
const DESTINO = CARPETA_NUEVA;
const UPLOADS = path.join(process.cwd(), 'uploads');

async function main(): Promise<void> {
  await initDatabase();
  fs.mkdirSync(path.join(UPLOADS, DESTINO), { recursive: true });
  const publicaciones = await Post.findAll();
  let publicacionesAfectadas = 0;
  let archivosMovidos = 0;
  let archivosQueFaltan = 0;

  for (const p of publicaciones) {
    const galeria: any[] = Array.isArray((p as any).gallery) ? (p as any).gallery : [];
    let cambio = false;
    const nueva = galeria.map((item) => {
      const copia = { ...item };
      for (const campo of ['url', 'thumbnail'] as const) {
        const nombre = nombreEnLaCarpetaVieja(copia[campo]);
        if (!nombre) continue;
        const desde = path.join(UPLOADS, ORIGEN, nombre);
        const hasta = path.join(UPLOADS, DESTINO, nombre);
        if (fs.existsSync(desde)) {
          if (aplicar && !fs.existsSync(hasta)) fs.copyFileSync(desde, hasta);
          archivosMovidos++;
        } else if (!fs.existsSync(hasta)) {
          archivosQueFaltan++;
          continue; // sin el archivo no se cambia la dirección
        }
        copia[campo] = direccionNueva(String(copia[campo]));
        cambio = true;
      }
      return copia;
    });
    if (!cambio) continue;
    publicacionesAfectadas++;
    if (aplicar) {
      (p as any).gallery = nueva;
      (p as any).changed('gallery', true);
      await p.save();
      // Recién con la publicación apuntando a la carpeta nueva se borra el archivo de la vieja.
      for (const item of galeria) {
        const nombre = nombreEnLaCarpetaVieja(item.url);
        if (nombre && fs.existsSync(path.join(UPLOADS, DESTINO, nombre))) {
          try { fs.unlinkSync(path.join(UPLOADS, ORIGEN, nombre)); } catch { /* ya no estaba */ }
        }
        const miniatura = nombreEnLaCarpetaVieja(item.thumbnail);
        if (miniatura && miniatura !== nombre && fs.existsSync(path.join(UPLOADS, DESTINO, miniatura))) {
          try { fs.unlinkSync(path.join(UPLOADS, ORIGEN, miniatura)); } catch { /* ya no estaba */ }
        }
      }
    }
  }

  console.log(`Publicaciones revisadas: ${publicaciones.length}`);
  console.log(`Publicaciones con fotos en la carpeta vieja: ${publicacionesAfectadas}`);
  console.log(`Fotos ${aplicar ? 'movidas' : 'por mover'}: ${archivosMovidos}`);
  if (archivosQueFaltan) console.log(`Fotos que no están en el disco (se dejaron como estaban): ${archivosQueFaltan}`);
  if (!aplicar) console.log('\nEs una vista previa. Para mover: agregá --aplicar.');
}

main()
  .catch((e) => {
    console.error('Error:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
