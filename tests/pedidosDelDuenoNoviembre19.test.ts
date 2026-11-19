import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { areasComoTexto, leerAreasPedidas, puntoEnArea, puntoEnPoligono, sanearArea, sanearZonas } from '../shared/perfiles/zonaDeTrabajo';
import { separarDatosPrivados, CLAVES_PRIVADAS_DE_LA_DIRECCION } from '../client/utils/datosPrivadosDeLaDireccion';
import { AVISO_DE_HERRAMIENTA, PASOS_DE_BIENVENIDA } from '../client/content/centroProfesional';

/**
 * Pedidos del dueño, 2026-11-19: la dirección no muestra identificadores, zonas en el mapa (radio y polígono) con sugerencias, /membership sin 404, desplegables, «Ir ahí»,
 * promocionar perfil con pago, aviso permanente en /pro/finanzas y el chat que no se va solo al cuadro de texto. Las pantallas se miraron en un navegador; esto evita que se deshaga.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('la dirección no muestra identificadores', () => {
  it('los datos privados salen de la dirección y la dirección conserva lo demás', () => {
    const r = separarDatosPrivados('?recipientId=abc&jobId=123&tab=membership&conversationId=zz');
    expect(r.publica).toBe('?tab=membership');
    expect(r.privados).toEqual({ recipientId: 'abc', jobId: '123', conversationId: 'zz' });
    expect(separarDatosPrivados('').publica).toBe('');
    expect(separarDatosPrivados('?tab=x').privados).toEqual({});
    expect(CLAVES_PRIVADAS_DE_LA_DIRECCION).toContain('contractId');
  });

  it('el limpiador está montado dentro del Router y las tres pantallas leen del estado', () => {
    expect(leer('client/App.tsx')).toContain('<LimpiarDireccion />');
    for (const f of ['client/pages/QuoteForm.tsx', 'client/pages/CreateDispute.tsx', 'client/pages/CreateTicket.tsx']) expect(leer(f)).toContain('useParametrosDeLaRuta()');
  });
});

describe('zonas marcadas en el mapa', () => {
  const cuadrado: Array<[number, number]> = [[-32.9, -60.7], [-32.9, -60.6], [-33.0, -60.6], [-33.0, -60.7]];

  it('un punto adentro o afuera de un polígono y de un círculo', () => {
    expect(puntoEnPoligono(-32.95, -60.65, cuadrado)).toBe(true);
    expect(puntoEnPoligono(-32.85, -60.65, cuadrado)).toBe(false);
    expect(puntoEnArea(-32.95, -60.64, { tipo: 'radio', lat: -32.95, lng: -60.64, radiusKm: 1 })).toBe(true);
    expect(puntoEnArea(-31.4, -64.2, { tipo: 'radio', lat: -32.95, lng: -60.64, radiusKm: 50 })).toBe(false);
  });

  it('se sanean: redondeo, topes y formas inválidas', () => {
    expect(sanearArea({ tipo: 'radio', lat: -32.9468, lng: -60.6393, radiusKm: 4.44 })).toEqual({ tipo: 'radio', lat: -32.947, lng: -60.639, radiusKm: 4.4 });
    expect(sanearArea({ tipo: 'radio', lat: -32, lng: -60, radiusKm: 5000 })).toBeNull();
    expect(sanearArea({ tipo: 'poligono', puntos: cuadrado.slice(0, 2) })).toBeNull();
    expect(sanearArea({ tipo: 'poligono', puntos: [[0, 0], [0, 10], [10, 10]] })).toBeNull(); // enorme
    expect(sanearArea({ tipo: 'poligono', puntos: [[0, 0], ['x', 1], [1, 1]] })).toBeNull();
    expect(sanearArea('hola')).toBeNull();
  });

  it('ida y vuelta por la dirección del muro: lo que llega mal formado se descarta', () => {
    const areas = [
      { tipo: 'radio' as const, lat: -32.95, lng: -60.64, radiusKm: 5 },
      { tipo: 'poligono' as const, puntos: cuadrado },
    ];
    expect(leerAreasPedidas(areasComoTexto(areas))).toEqual(areas);
    expect(leerAreasPedidas('r:abc:1:2')).toEqual([]);
    expect(leerAreasPedidas('p:1:2:3:4')).toEqual([]);
    expect(leerAreasPedidas('x'.repeat(7000))).toEqual([]);
    expect(leerAreasPedidas(undefined)).toEqual([]);
  });

  it('a lo sumo 5 zonas con forma por perfil; las demás quedan con solo el nombre', () => {
    const zonas = Array.from({ length: 7 }, (_, i) => ({ name: `Zona ${i + 1}`, area: { tipo: 'radio', lat: -32.95, lng: -60.64, radiusKm: 3 } }));
    const sanas = sanearZonas(zonas);
    expect(sanas.filter((z) => z.area)).toHaveLength(5);
    expect(sanas).toHaveLength(7);
  });

  it('el campo de «otras zonas» sugiere lugares y el mapa se carga recién al abrirlo', () => {
    const z = leer('client/components/perfil/ZonaDeTrabajo.tsx');
    expect(z).toContain('buscarLugares');
    expect(z).toContain('role="combobox"');
    expect(z).toContain('Marcar mi zona en el mapa');
    expect(leer('client/components/perfil/MapaDeZonas.tsx')).toContain("await import('leaflet')");
  });
});

describe('otros pedidos', () => {
  it('/membership lleva a la pantalla de planes (daba 404)', () => {
    expect(leer('client/App.tsx')).toContain('<Route path="/membership" element={<Navigate to="/membership/pricing" replace />} />');
  });

  it('/pro/finanzas muestra siempre el aviso de que DOAPP es solo una herramienta, sin botón para cerrarlo', () => {
    expect(AVISO_DE_HERRAMIENTA).toMatch(/falsificados/);
    expect(AVISO_DE_HERRAMIENTA).toMatch(/licencias/);
    expect(AVISO_DE_HERRAMIENTA).toMatch(/seguros/);
    expect(AVISO_DE_HERRAMIENTA).toMatch(/especialista/);
    expect(leer('client/pages/FinancePanel.tsx')).toContain('<AvisoDeHerramienta />');
    const guia = leer('client/components/profesional/GuiaDelCentro.tsx');
    const aviso = guia.slice(guia.indexOf('export function AvisoDeHerramienta'), guia.indexOf('export function BienvenidaAlCentro'));
    expect(aviso).not.toMatch(/onClick|<button/);
  });

  it('«¿Qué es el Centro Profesional?» y «Mis puntuaciones» son desplegables', () => {
    expect(leer('client/components/profesional/GuiaDelCentro.tsx')).toMatch(/<Desplegable[\s\S]*¿Qué es el Centro Profesional\?/);
    expect(leer('client/pages/Dashboard.tsx')).toContain('<Desplegable');
    expect(leer('client/components/ui/Desplegable.tsx')).toContain('aria-expanded={abierto}');
  });

  it('«Ir ahí» cambia de pestaña y baja hasta ahí (y el último paso baja a la descarga)', () => {
    const f = leer('client/pages/FinancePanel.tsx');
    expect(f).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
    expect(f).toContain('id="secciones-del-centro"');
    expect(f).toContain('id="descarga-del-resumen"');
    expect(PASOS_DE_BIENVENIDA.some((p) => p.ancla === 'descarga-del-resumen')).toBe(true);
  });

  it('el chat baja solo cuando llegó un mensaje nuevo y la persona estaba al final (o lo escribió ella), sin mover la página', () => {
    const c = leer('client/pages/ChatScreen.tsx');
    expect(c).toContain('ultimoMensajeVisto');
    expect(c).not.toContain('.scrollIntoView(');
    expect(c).toContain('lista.scrollTo');
  });

  it('promocionar el perfil lleva al pago, y lo pagado se activa y se muestra en el muro', () => {
    expect(leer('client/components/profile/ProfilePromotion.tsx')).toContain('/api/profile-promotion/pay');
    expect(leer('server/routes/payments.ts')).toContain('payment.paymentType === "profile_promotion"');
    expect(leer('client/pages/Index.tsx')).toContain('<PerfilesDestacados');
  });
});
