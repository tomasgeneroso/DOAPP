/**
 * Pasa lo que había en Portfolio a publicaciones del perfil (la pestaña se sacó). No borra nada. Vista previa por defecto; escribe con --aplicar.
 *
 *   npx tsx server/scripts/moverPortfolioAlPerfil.ts [--aplicar]
 */
import { initDatabase, sequelize } from '../config/database.js';
import { moverPortfolioAlPerfil } from '../services/moverPortfolioAlPerfil.js';

const TEXTO = { se_publica: 'se va a publicar', publicado: 'PUBLICADO en el perfil', ya_estaba: 'ya estaba en el perfil: no se duplica' } as const;

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  await initDatabase();
  const pasos = await moverPortfolioAlPerfil(aplicar);
  if (pasos.length === 0) console.log('No hay nada en Portfolio.');
  for (const p of pasos) console.log(`· «${p.titulo}» (usuario ${p.userId}): ${TEXTO[p.resultado]}`);
  if (!aplicar && pasos.some((p) => p.resultado === 'se_publica')) console.log('\nVista previa: no se cambió nada. Con --aplicar se publican.');
  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('No se pudo:', e?.message);
  process.exit(1);
});
