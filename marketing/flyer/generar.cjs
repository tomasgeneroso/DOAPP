/**
 * Genera el flyer A4 de DOAPP en dos versiones (claro y oscuro): HTML, PDF listo para imprimir y PNG.
 *
 * Uso (desde la raíz del repo):
 *   npm i --no-save qrcode          # sólo hace falta para generar; no queda en package.json
 *   node marketing/flyer/generar.cjs
 *
 * El QR es ESTÁTICO: lleva la dirección escrita adentro. No vence, no tiene límite de escaneos y no
 * depende de ningún servicio de terceros (los QR "dinámicos" de pago dejan de andar si se deja de
 * pagar). La dirección lleva ?utm_source=flyer&utm_campaign=… para ver en Google Analytics cuánta
 * gente entró por cada versión.
 *
 * El QR va siempre con módulos oscuros sobre fondo blanco, también en el flyer oscuro: muchos lectores
 * no leen QR invertidos (claros sobre oscuro).
 */
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { chromium } = require('playwright');

const SALIDA = __dirname;
const SITIO = 'https://doapparg.com/';
const INSTAGRAM = 'doapparg';

const TEXTO = {
  cliente: '¿Necesitás que te arreglen la canilla?',
  trabajador: '¿Estás buscando trabajo?',
  beta: 'Aprovechá los 3 meses de beta gratis',
};

const TEMAS = {
  claro: {
    fondo: '#ffffff',
    brillo: 'radial-gradient(900px 520px at 50% -120px, #e0f2fe 0%, rgba(224,242,254,0) 70%)',
    texto: '#0f172a',
    acento: '#0284c7',
    suave: '#475569',
    tarjeta: '#ffffff',
    bordeTarjeta: '#bae6fd',
    sombraTarjeta: '0 3mm 9mm rgba(2,132,199,0.18)',
  },
  oscuro: {
    fondo: '#0b1220',
    brillo: 'radial-gradient(900px 520px at 50% -120px, rgba(14,165,233,0.28) 0%, rgba(14,165,233,0) 70%)',
    texto: '#f8fafc',
    acento: '#38bdf8',
    suave: '#94a3b8',
    tarjeta: '#ffffff',
    bordeTarjeta: '#38bdf8',
    sombraTarjeta: '0 0 0 1.2mm rgba(56,189,248,0.25), 0 4mm 12mm rgba(0,0,0,0.5)',
  },
};

const LOGO = `
<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" class="logo" role="img" aria-label="DOAPP">
  <circle cx="150" cy="150" r="145" fill="#00A8E8"/>
  <path d="M 68 70 L 120 70 Q 160 70 160 150 Q 160 230 120 230 L 68 230 Z" fill="#fff"/>
  <circle cx="215" cy="150" r="60" fill="#fff"/>
</svg>`;

const ICONO_IG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="ig" role="img" aria-label="Instagram">
  <defs>
    <radialGradient id="igg" cx="0.3" cy="1.05" r="1.25">
      <stop offset="0" stop-color="#fed576"/>
      <stop offset="0.26" stop-color="#f47133"/>
      <stop offset="0.61" stop-color="#bc3081"/>
      <stop offset="1" stop-color="#4c63d2"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#igg)"/>
  <rect x="14" y="14" width="36" height="36" rx="10" fill="none" stroke="#fff" stroke-width="4"/>
  <circle cx="32" cy="32" r="8.5" fill="none" stroke="#fff" stroke-width="4"/>
  <circle cx="43" cy="21" r="2.6" fill="#fff"/>
</svg>`;

async function qrSvg(url) {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 0,
    color: { dark: '#0b1220', light: '#0000' },
  });
  return svg.replace('<svg ', '<svg class="qr" role="img" aria-label="Código QR de DOAPP" shape-rendering="crispEdges" ');
}

function html(nombre, t, qr) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Flyer DOAPP (${nombre})</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;800;900&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 210mm; height: 297mm; }
  body {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    background: ${t.fondo};
    color: ${t.texto};
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .hoja {
    position: relative; width: 210mm; height: 297mm; overflow: hidden;
    background: ${t.brillo}, ${t.fondo};
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    padding: 15mm 16mm 14mm;
  }
  .marca { display: flex; align-items: center; gap: 4.5mm; }
  .logo { width: 19mm; height: 19mm; display: block; }
  .marca span { font-weight: 900; font-size: 27pt; letter-spacing: -0.02em; line-height: 1; }

  .preguntas { display: flex; flex-direction: column; align-items: center; gap: 7mm; text-align: center; }
  .q { font-weight: 900; font-size: 41pt; line-height: 1.06; letter-spacing: -0.025em; max-width: 178mm; text-wrap: balance; }
  .q.trabajador { color: ${t.acento}; }
  .corte { width: 22mm; height: 1.1mm; border-radius: 1mm; background: ${t.acento}; opacity: 0.45; }

  .bloque-qr { display: flex; flex-direction: column; align-items: center; gap: 6mm; }
  .tarjeta {
    background: ${t.tarjeta}; border-radius: 8mm; padding: 7mm;
    border: 0.5mm solid ${t.bordeTarjeta}; box-shadow: ${t.sombraTarjeta};
  }
  .qr { display: block; width: 76mm; height: 76mm; }

  .pie { display: flex; flex-direction: column; align-items: center; gap: 3.2mm; }
  .beta { font-size: 12.5pt; font-weight: 600; color: ${t.suave}; letter-spacing: 0.005em; }
  .redes { display: flex; align-items: center; gap: 2.6mm; font-size: 12pt; font-weight: 600; color: ${t.texto}; }
  .ig { width: 7.5mm; height: 7.5mm; display: block; }
  .punto { color: ${t.suave}; padding: 0 1mm; }
</style>
</head>
<body>
  <main class="hoja">
    <header class="marca">${LOGO}<span>DOAPP</span></header>

    <section class="preguntas">
      <p class="q cliente">${TEXTO.cliente}</p>
      <div class="corte" aria-hidden="true"></div>
      <p class="q trabajador">${TEXTO.trabajador}</p>
    </section>

    <section class="bloque-qr">
      <div class="tarjeta">${qr}</div>
    </section>

    <footer class="pie">
      <p class="beta">${TEXTO.beta}</p>
      <div class="redes">
        ${ICONO_IG}<span>@${INSTAGRAM}</span><span class="punto">·</span><span>doapparg.com</span>
      </div>
    </footer>
  </main>
</body>
</html>
`;
}

(async () => {
  const navegador = await chromium.launch({ channel: 'chrome', headless: true });
  const resumen = [];
  for (const [nombre, tema] of Object.entries(TEMAS)) {
    const url = `${SITIO}?utm_source=flyer&utm_campaign=${nombre}`;
    const qr = await qrSvg(url);
    const archivoHtml = path.join(SALIDA, `flyer-${nombre}.html`);
    fs.writeFileSync(archivoHtml, html(nombre, tema, qr));

    const pagina = await navegador.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3.125 });
    await pagina.goto('file:///' + archivoHtml.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.pdf({ path: path.join(SALIDA, `flyer-${nombre}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
    await pagina.screenshot({ path: path.join(SALIDA, `flyer-${nombre}.png`), clip: { x: 0, y: 0, width: 794, height: 1123 } });
    await pagina.close();
    resumen.push({ nombre, url });
  }
  await navegador.close();
  console.log(JSON.stringify(resumen, null, 2));
})();
