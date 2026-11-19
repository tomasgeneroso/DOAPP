// Prueba de humo del entorno YA desplegado: qué pasa de verdad entre el navegador y la aplicación (Cloudflare, nginx, Express), no lo que pasa en las pruebas locales.
//
// Por qué existe (pedido del dueño, 2026-11-17: «siempre que arreglás algo se rompe otra cosa»): las pruebas corren contra la aplicación sola. Varias roturas vivieron
// en las capas de afuera, que las pruebas no ven: por ejemplo, el nginx del servidor contestaba por su cuenta (404 propio, guardado 4 horas por Cloudflare) a cualquier
// dirección que terminara en .png/.jpg, y una foto recién subida «no se podía mostrar». Esto recorre las puertas de entrada que más duelen y falla con un motivo claro.
//
// Uso: node .github/scripts/humo-del-entorno.mjs https://staging.doapparg.com
// No manda datos de nadie: solo pide direcciones públicas y mira el tipo de respuesta.

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Uso: node humo-del-entorno.mjs https://dominio');
  process.exit(2);
}

let fallas = 0;
const resultados = [];
async function pedir(ruta, opciones = {}) {
  const r = await fetch(base + ruta, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...opciones });
  const tipo = r.headers.get('content-type') || '';
  const cuerpo = await r.text().catch(() => '');
  return { estado: r.status, tipo, cuerpo };
}
async function prueba(nombre, fn) {
  try {
    const motivo = await fn();
    if (motivo) throw new Error(motivo);
    resultados.push(`OK    ${nombre}`);
  } catch (e) {
    fallas++;
    resultados.push(`FALLA ${nombre}  →  ${e.message}`);
  }
}
const esJson = (t) => /application\/json/i.test(t);
const esHtmlDeNginx = (r) => /text\/html/i.test(r.tipo) && /nginx/i.test(r.cuerpo);

await prueba('la aplicación responde (/api/health)', async () => {
  const r = await pedir('/api/health');
  if (r.estado !== 200 || !esJson(r.tipo)) return `estado ${r.estado}, tipo ${r.tipo}`;
});

await prueba('la portada se sirve y trae la aplicación', async () => {
  const r = await pedir('/');
  if (r.estado !== 200) return `estado ${r.estado}`;
  if (!/id="root"/.test(r.cuerpo)) return 'no se encontró el contenedor de la aplicación';
});

await prueba('las imágenes se piden por /api/archivo y llegan a la aplicación (no al nginx)', async () => {
  const sinRuta = await pedir('/api/archivo');
  if (sinRuta.estado !== 400 || !esJson(sinRuta.tipo)) return `sin ruta: estado ${sinRuta.estado}, tipo ${sinRuta.tipo} (¿la ruta no existe o la atiende otra capa?)`;
  const noExiste = await pedir('/api/archivo?ruta=avatars%2Fno-existe-humo.png');
  if (esHtmlDeNginx(noExiste) || !esJson(noExiste.tipo)) return `archivo inexistente: estado ${noExiste.estado}, tipo ${noExiste.tipo}: lo contestó una capa de afuera`;
});

await prueba('una dirección /api que termina en .png llega a la aplicación o se reconoce como del nginx (informativo)', async () => {
  // Aviso, no falla: así se sabe si el nginx sigue contestando solo a las imágenes (por eso la web usa /api/archivo?ruta=).
  const r = await pedir('/api/uploads/avatars/no-existe-humo.png');
  if (esHtmlDeNginx(r)) console.log('ℹ️  El nginx contesta solo a /api/…png (esperado: la web usa /api/archivo?ruta=…).');
});

await prueba('sin sesión, las notificaciones piden entrar (401 en JSON)', async () => {
  const r = await pedir('/api/notifications?limit=1');
  if (r.estado !== 401 || !esJson(r.tipo)) return `estado ${r.estado}, tipo ${r.tipo}`;
});

await prueba('sin sesión, el chat pide entrar (401 en JSON)', async () => {
  const r = await pedir('/api/chat/conversations');
  if (r.estado !== 401 || !esJson(r.tipo)) return `estado ${r.estado}, tipo ${r.tipo}`;
});

console.log(`\nPrueba de humo de ${base}\n` + resultados.join('\n'));
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
