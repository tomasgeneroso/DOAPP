import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Segundo lote de pedidos del dueño, 2026-11-19: la dirección y el mapa, el aviso de fechas en las tareas, los datos de cobro, el estimado antes de Mercado Pago, los íconos del chat,
 * «Dónde trabaja» en el perfil, las descripciones de las puntuaciones, «Reportar perfil» en español, el comprobante de la publicación y la lista de cancelaciones del equipo.
 * Cada pantalla se miró en un navegador; esto evita que se deshaga sin querer.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('segundo lote de pedidos', () => {
  it('la dirección: al ubicar por el texto el barrio y el código postal acompañan al mapa, y si cae en otra ciudad se avisa', () => {
    expect(leer('client/hooks/useCoherenciaDeDireccion.ts')).toContain('alUbicarPorElTexto');
    expect(leer('client/pages/CreateContractScreen.tsx')).toContain('coherencia.alUbicarPorElTexto(lat, lng)');
  });

  it('las tareas avisan DENTRO del bloque qué fechas faltan para poder ponerles un día', () => {
    const f = leer('client/components/jobs/TareasDelTrabajo.tsx');
    expect(f).toContain('aviso-fechas-de-las-tareas');
    expect(f).toContain('role="alert"');
    expect(leer('client/pages/CreateContractScreen.tsx')).toContain("alElegirFechas={() => senalarCampo('startDate')}");
  });

  it('el estimado de lo que se paga está en el formulario, antes de Mercado Pago, y sale del mismo cálculo del cobro', () => {
    expect(leer('client/pages/CreateContractScreen.tsx')).toContain('<EstimadoDelPago');
    expect(leer('client/components/jobs/EstimadoDelPago.tsx')).toContain('/api/payments/quote?price=');
    expect(leer('client/pages/CreateContractScreen.tsx')).not.toContain('Comisión mínima{');
  });

  it('los datos de cobro (transferencia y Binance) se cargan en el panel y rigen en el pago', () => {
    expect(leer('client/pages/admin/PlatformPhase.tsx')).toContain('<DatosDeCobroPanel');
    expect(leer('server/routes/payments.ts')).toContain('datosBancariosVigentes as datosBancarios');
    expect(leer('server/routes/payments.ts')).toContain('binanceVigente()');
    expect(leer('server/index.ts')).toContain('cargarDatosDeCobro()');
  });

  it('los íconos del chat funcionan: la carita abre emojis y los tres puntos abren un menú', () => {
    const m = leer('client/pages/MessagesScreen.tsx');
    expect(m).toContain('<SelectorDeEmojis');
    expect(m).toContain('marcarTodasComoLeidas');
    expect(m).not.toMatch(/<button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">\s*<MoreVertical/);
    expect(leer('client/pages/ChatScreen.tsx')).toContain('<SelectorDeEmojis');
    // y el chat tampoco mueve la página mientras se escribe
    expect(m).not.toContain('.scrollIntoView(');
  });

  it('el perfil explica «Dónde trabaja» y no publica el dibujo de las zonas', () => {
    expect(leer('client/pages/ProfilePage.tsx')).toContain('data-testid="donde-trabaja"');
    expect(leer('client/pages/ProfilePage.tsx')).toContain('otra zona');
    const u = leer('server/routes/users.ts');
    expect(u).toContain('function zonasPublicas');
    expect(u).not.toMatch(/workZones: (u|user)\.workZones[,\s]/);
  });

  it('la descripción de cada tipo de puntuación se ve siempre (no en un globo que solo aparecía al pasar el mouse)', () => {
    const f = leer('client/components/user/MultipleRatings.tsx');
    expect(f).toContain('descripcion-de-puntuacion');
    expect(f).not.toContain('group-hover:visible');
  });

  it('«Reportar perfil» está en español (textos de reserva y motivos)', () => {
    const f = leer('client/components/user/ReportProfileModal.tsx');
    expect(f).toContain("t('profile.reportProfile', 'Reportar perfil')");
    expect(f).not.toMatch(/Report Profile|Send Report|Identity theft/);
    expect(JSON.parse(leer('client/i18n/locales/es.json')).profile.reportScam).toBe('Estafa o intento de fraude');
  });

  it('el comprobante: «Mis trabajos» y el detalle traen el pago de la publicación, hay página para subirlo y la nota del equipo avisa', () => {
    expect(leer('server/routes/jobs.ts')).not.toContain('payment: null,');
    expect(leer('server/routes/jobs.ts')).toContain('pagosDeLasPublicaciones(');
    expect(leer('client/App.tsx')).toContain('path="/payments/:paymentId/comprobante"');
    expect(leer('server/routes/admin/payments.ts')).toContain("actionText: 'Subir comprobante'");
    expect(leer('client/pages/JobDetail.tsx')).toContain('subir-comprobante-de-la-publicacion');
    expect(leer('client/pages/admin/PendingPayments.tsx')).toContain('["pending", "processing", "pending_verification"].includes(String(payment.status))');
  });

  it('/admin/contracts/:id solo atiende UUID, así que /cancellation-requests llega a su lista', () => {
    expect(leer('server/routes/admin/contracts.ts')).toContain('soloUuid');
  });
});
