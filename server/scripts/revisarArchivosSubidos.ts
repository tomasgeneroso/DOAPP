/**
 * Revisa lo que ya está subido en `uploads/` y aparta lo que podría ejecutarse en el navegador (auditoría de seguridad, 2026-11-24).
 *
 * Antes de ese día los archivos se guardaban con la extensión que escribía quien los subía: podía haber un `.html`, `.svg` o `.js` hecho pasar por imagen. Desde
 * ahora el servidor ya no los abre (se descargan y sin scripts), pero conviene sacarlos del medio.
 *
 *   npx tsx server/scripts/revisarArchivosSubidos.ts            → solo muestra lo que encontró (vista previa)
 *   npx tsx server/scripts/revisarArchivosSubidos.ts --aplicar  → les agrega «.bloqueado» al nombre (no borra nada: se puede deshacer quitando el sufijo)
 *
 * Marca un archivo si: tiene una extensión de página o programa (html, svg, js, php…), o si, siendo imagen/PDF por su nombre, el principio del contenido parece una
 * página (`<html`, `<script`, `<svg`, `<?xml`…).
 */
import fs from 'fs';
import path from 'path';
import { motivoDeSospecha } from '../utils/archivosSospechosos.js';

const RAIZ = path.join(process.cwd(), 'uploads');
const aplicar = process.argv.includes('--aplicar');

function* recorrer(dir: string): Generator<string> {
  for (const nombre of fs.readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    const st = fs.lstatSync(ruta);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* recorrer(ruta);
    else yield ruta;
  }
}

function main(): void {
  if (!fs.existsSync(RAIZ)) {
    console.log(`No existe ${RAIZ}: nada que revisar.`);
    return;
  }
  let vistos = 0;
  const marcados: Array<{ ruta: string; motivo: string }> = [];
  for (const ruta of recorrer(RAIZ)) {
    vistos++;
    let principio = '';
    try {
      const fd = fs.openSync(ruta, 'r');
      const buf = Buffer.alloc(2048);
      const n = fs.readSync(fd, buf, 0, 2048, 0);
      fs.closeSync(fd);
      principio = buf.subarray(0, n).toString('latin1');
    } catch {
      continue;
    }
    const motivo = motivoDeSospecha(ruta, principio);
    if (motivo) marcados.push({ ruta, motivo });
  }
  console.log(`Archivos revisados: ${vistos}. Sospechosos: ${marcados.length}.`);
  for (const m of marcados) console.log(` - ${path.relative(RAIZ, m.ruta)}  (${m.motivo})`);
  if (!marcados.length) return;
  if (!aplicar) {
    console.log('\nEs una vista previa. Para apartarlos: agregá --aplicar.');
    return;
  }
  for (const m of marcados) fs.renameSync(m.ruta, `${m.ruta}.bloqueado`);
  console.log(`\nListo: ${marcados.length} archivo(s) renombrados con «.bloqueado».`);
}

main();
