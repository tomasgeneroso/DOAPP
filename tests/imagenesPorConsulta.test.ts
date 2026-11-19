import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Las imágenes subidas se piden por `/api/archivo?ruta=…` y NUNCA por una dirección que termine en .png/.jpg bajo /api: el nginx del servidor responde solo
 * (404 propio, que Cloudflare guarda 4 horas) a esas direcciones y la foto recién subida «no se podía mostrar» (reporte del dueño, 2026-11-17).
 */
const RAIZ = process.cwd();
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

describe('imágenes por consulta', () => {
  it('la web arma la dirección con ?ruta= y no con /uploads/…png', () => {
    const f = leer('client/utils/imageUrl.ts');
    expect(f).toContain('/archivo?ruta=');
    expect(f).not.toMatch(/API_BASE\}\/uploads|API_BASE\}\$\{path\}`;\s*\n\s*\}\s*\n\s*\/\/ Stored as "uploads/);
  });

  it('el servidor la atiende delante de las mismas carpetas privadas que /uploads', () => {
    const f = leer('server/index.ts');
    expect(f).toContain("archivoPorConsultaRouter.use(uploadsCors, archivoPorConsulta, protegerArchivosPrivados, uploadsStatic, uploadsStaticDelProceso)");
    expect(f).toContain("app.use(\"/api/archivo\", archivoPorConsultaRouter)");
  });

  it('las fotos de perfil rotas se reconocen también por la dirección nueva', () => {
    expect(leer('client/utils/imagenesRotas.ts')).toContain('ruta=avatars');
  });
});
