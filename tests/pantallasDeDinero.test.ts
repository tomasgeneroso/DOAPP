import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { BANCOS, NOMBRES_DE_BANCOS, bancoDelCbu, esBancoDeLaLista, esCvu } from '../shared/constants/bancos.js';

const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
function archivos(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (/\.(ts|tsx)$/.test(n)) salida.push(ruta);
  }
  return salida;
}

describe('modales: ninguno queda cortado', () => {
  const css = leer('client/global.css');

  it('la capa de los modales viejos (fixed inset-0 flex items-center justify-center) scrollea y su panel se centra con márgenes automáticos', () => {
    expect(css).toMatch(/\.fixed\.inset-0\.flex\.items-center\.justify-center:not\(\.flex-col\)\s*\{[^}]*align-items:\s*flex-start;[^}]*overflow-y:\s*auto;/);
    expect(css).toMatch(/\.fixed\.inset-0\.flex\.items-center\.justify-center:not\(\.flex-col\)\s*>\s*\*\s*\{\s*margin-block:\s*auto;/);
  });

  it('el Modal base: capa que scrollea, panel con min-h-full + my-auto, alto máximo en dvh, título y botones fijos, Escape, sin scroll de fondo y con transición', () => {
    const m = leer('client/components/ui/Modal.tsx');
    expect(m).toMatch(/fixed inset-0 z-50 overflow-y-auto/);
    expect(m).toMatch(/flex min-h-full items-center justify-center/);
    expect(m).toMatch(/my-auto/);
    expect(m).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(m).toMatch(/min-h-0 flex-1 overflow-y-auto/); // solo el medio se desplaza
    expect(m).toMatch(/footer &&/);
    expect(m).toMatch(/e\.key === "Escape"/);
    expect(m).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(m).toMatch(/aria-modal="true"/);
    expect(m).toMatch(/motion-reduce:transition-none/);
    expect(m).toMatch(/transition-opacity/); // aparece y se va con transición, nunca de golpe
  });

  it('el modal de cancelar la publicación y el del resultado usan el Modal base (los botones siempre se ven)', () => {
    const cancelar = leer('client/components/jobDetail/CancelJobModal.tsx');
    expect(cancelar).toMatch(/<Modal\b/);
    expect(cancelar).toMatch(/footer=\{/);
    expect(cancelar).not.toMatch(/fixed inset-0/);
    const resultado = leer('client/components/jobDetail/CancelacionResultadoModal.tsx');
    expect(resultado).toMatch(/<Modal\b/);
    expect(resultado).toMatch(/footer=\{/);
  });

  it('un modal nuevo no vuelve al patrón que recorta: si usa «fixed inset-0» con panel centrado, tiene que ser el Modal base o quedar cubierto por la regla global', () => {
    // La regla global cubre `.fixed.inset-0.flex.items-center.justify-center`. Cualquier otro centrado (grid, place-items, translate) NO está
    // cubierto y recorta igual: se prohíbe.
    const culpables: string[] = [];
    for (const f of archivos(join(raiz, 'client'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/className=["'`{][^"'`]*fixed inset-0[^"'`]*["'`}]/g)) {
        const clase = m[0];
        if (/place-items-center|grid place-content-center|-translate-y-1\/2/.test(clase) && !/pointer-events-none/.test(clase)) {
          culpables.push(`${f.replace(raiz, '')}: ${clase.slice(0, 90)}`);
        }
      }
    }
    expect(culpables).toEqual([]);
  });
});

describe('la consola del navegador no muestra datos de la sesión', () => {
  it('el build de producción elimina console.log/info/debug (y deja error y warn para diagnosticar)', () => {
    const v = leer('vite.config.ts');
    expect(v).toMatch(/pure:\s*\[[^\]]*"console\.log"[^\]]*"console\.info"[^\]]*"console\.debug"/);
    expect(v).not.toMatch(/"console\.error"|"console\.warn"/);
  });

  it('ningún console.log/info/debug del cliente imprime ids de usuario, tokens, correos ni respuestas completas', () => {
    const SENSIBLE = /user\??\.(id|email|name|phone)|data\.user\??\.id|userId|clientId|doerId|[tT]oken|email|password|cbu|\bdni\b|phone|\.id\b|\bid:|jobsData|\bpayload\b|session|cookie|\buid\b|payment_id|collection_id|paymentId/;
    const culpables: string[] = [];
    for (const f of archivos(join(raiz, 'client'))) {
      const lineas = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
      lineas.forEach((l, i) => {
        if (!/^\s*console\.(log|info|debug)\(/.test(l)) return;
        // La sentencia completa: hasta que se cierran los paréntesis (puede ocupar varias líneas).
        let j = i;
        let abiertos = 0;
        let sentencia = '';
        do {
          sentencia += `${lineas[j]}\n`;
          for (const c of lineas[j]) abiertos += c === '(' ? 1 : c === ')' ? -1 : 0;
          j++;
        } while (abiertos > 0 && j < lineas.length);
        if (SENSIBLE.test(sentencia)) culpables.push(`${f.replace(raiz, '')}:${i + 1}`);
      });
    }
    expect(culpables).toEqual([]);
  });

  it('el token de notificaciones push (FCM) no se imprime', () => {
    expect(leer('client/lib/firebase.ts')).not.toMatch(/console\.(log|info|debug)\([^)]*token/i);
  });
});

describe('banco o billetera: se elige de una lista', () => {
  it('la lista tiene Mercado Pago primero, billeteras y bancos, sin repetidos', () => {
    expect(NOMBRES_DE_BANCOS[0]).toBe('Mercado Pago');
    expect(new Set(NOMBRES_DE_BANCOS).size).toBe(NOMBRES_DE_BANCOS.length);
    expect(BANCOS.some((b) => b.tipo === 'billetera')).toBe(true);
    expect(BANCOS.some((b) => b.tipo === 'banco')).toBe(true);
  });

  it('un nombre escrito a mano (cuentas viejas) no está en la lista y se muestra como «Otro»', () => {
    expect(esBancoDeLaLista('Mercado Pago')).toBe(true);
    expect(esBancoDeLaLista('mercadopago')).toBe(false);
    expect(esBancoDeLaLista('MP')).toBe(false);
    expect(esBancoDeLaLista('')).toBe(false);
    expect(esBancoDeLaLista(null)).toBe(false);
  });

  it('el CBU delata el banco por sus tres primeros dígitos; un CVU es de una billetera', () => {
    expect(bancoDelCbu('0110599520000012345678')?.nombre).toBe('Banco Nación');
    expect(bancoDelCbu('0720000088000012345678')?.nombre).toBe('Santander');
    expect(bancoDelCbu('1230000000000000000000')).toBeNull();
    expect(bancoDelCbu('1')).toBeNull();
    expect(esCvu('0000003100012345678901')).toBe(true);
    expect(esCvu('0110599520000012345678')).toBe(false);
    expect(esCvu('000')).toBe(false);
  });

  it('el retiro y el perfil usan el selector y no un campo de texto libre para el banco', () => {
    const retiro = leer('client/pages/WithdrawalRequestPage.tsx');
    expect(retiro).toMatch(/<SelectorDeBanco/);
    expect(retiro).not.toMatch(/value=\{bankName\}\s*\n\s*onChange=\{\(e\) => setBankName/);
    expect(leer('client/pages/UserSettings.tsx')).toMatch(/<SelectorDeBanco/);
    const sel = leer('client/components/ui/SelectorDeBanco.tsx');
    expect(sel).toMatch(/Otro…/);
    expect(sel).toMatch(/bancoDelCbu/);
  });
});

describe('app: resultado de la cancelación y modal sin cortes', () => {
  it('el resumen se ordena en secciones: estado, tu dinero (filas) y qué pasó (avisos con su referencia)', async () => {
    const { resumenDeCancelacion } = await import('../mobile/utils/resumenDeCancelacion.js');
    const r = resumenDeCancelacion('Arreglo de canilla', {
      salida: 'saldo',
      plataMovida: true,
      refund: { toClient: 40356, toWorker: 0, commissionWithheld: 0, processingNotRefunded: 2155.28, onWithdrawal: { comision: 1800 } },
      avisos: [{ codigo: 'DEV-SIN-ID-DE-PAGO', mensaje: 'No pudimos devolver el dinero a tu medio de pago, así que lo dejamos como saldo a favor.', gravedad: 'baja' }],
    });
    expect(r.titulo).toBe('Cancelaste «Arreglo de canilla»');
    expect(r.paraRevisar).toBe(false); // un aviso informativo no alarma
    expect(r.cuerpo).toContain('TU DINERO');
    expect(r.cuerpo).toContain('• Saldo a favor: $40.356');
    expect(r.cuerpo).toContain('• Costo de procesamiento (no se devuelve, la pasarela ya lo cobró): $2.155,28');
    expect(r.cuerpo).toContain('• Si lo retirás a tu banco recibís: $38.556 (se descuentan $1.800');
    expect(r.cuerpo).toContain('QUÉ PASÓ');
    expect(r.cuerpo).toContain('Referencia: DEV-SIN-ID-DE-PAGO');
    expect(r.cuerpo).not.toMatch(/Hubo un problema al mover el dinero/);
  });

  it('si el dinero quedó en revisión NO dice que ya está acreditado, y el título avisa que hay que revisar', async () => {
    const { resumenDeCancelacion } = await import('../mobile/utils/resumenDeCancelacion.js');
    const r = resumenDeCancelacion('x', {
      plataMovida: false,
      refund: { toClient: 40356, toWorker: 0, commissionWithheld: 0, processingNotRefunded: 0 },
      avisos: [{ codigo: 'PAGO-SIN-CONFIRMAR', mensaje: 'Todavía no podemos devolverte el dinero.', gravedad: 'alta' }],
    });
    expect(r.titulo).toBe('Cancelado, pero revisá esto');
    expect(r.paraRevisar).toBe(true);
    expect(r.cuerpo).toContain('en revisión');
    expect(r.cuerpo).not.toContain('Saldo a favor acreditado');
    expect(r.cuerpo).not.toContain('TU DINERO'); // no se listan montos como si se hubieran movido
  });

  it('una devolución por Mercado Pago dice cuánto volvió al medio de pago', async () => {
    const { resumenDeCancelacion } = await import('../mobile/utils/resumenDeCancelacion.js');
    const r = resumenDeCancelacion('x', {
      salida: 'devolucion',
      plataMovida: true,
      devueltoPorMp: 38556,
      refund: { toClient: 40356, toWorker: 0, commissionWithheld: 0, processingNotRefunded: 2155.28, onWithdrawal: { comision: 1800 } },
    });
    expect(r.cuerpo).toContain('Devolución en camino');
    expect(r.cuerpo).toContain('• Devuelto a tu medio de pago: $38.556');
    expect(r.cuerpo).not.toContain('Si lo retirás a tu banco');
  });

  it('el modal de cancelar de la app deja el título y los botones fijos y scrollea el medio; el banco se elige de una lista', () => {
    const job = leer('mobile/app/job/[id].tsx');
    expect(job).toMatch(/modalContent: \{[^}]*maxHeight: '92%'/);
    expect(job).toMatch(/<ScrollView style=\{\{ flexShrink: 1 \}\} keyboardShouldPersistTaps="handled"/);
    expect(job).toMatch(/resumenDeCancelacion\(job\.title/);
    expect(job).not.toMatch(/Hubo un problema al mover el dinero/);
    const ajustes = leer('mobile/app/settings.tsx');
    expect(ajustes).toMatch(/<SelectorDeBanco/);
    expect(ajustes).not.toMatch(/placeholder="Mercado Pago, Brubank, etc\."/);
  });
});
