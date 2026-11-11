import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * TODO el panel de administración se actualiza en tiempo real (regla del dueño, 2026-11-09).
 *
 * Una pantalla de administración que muestra datos y no escucha los avisos del servidor queda mostrando lo viejo hasta que alguien recarga: el equipo mira una
 * lista de pagos o de identidades «por revisar» que ya resolvió otra persona. Esta guarda recorre las pantallas de `client/pages/admin` y exige que cada una que
 * carga datos escuche `useCambiosDeAdministracion` (o `useEventoEnVivo`), salvo las que figuran abajo con su razón. Una pantalla nueva tiene que escuchar o anotarse
 * acá con el motivo (y el motivo tiene que ser de verdad: una calculadora, un formulario, un interruptor).
 */
const RAIZ = process.cwd();
const DIR = join(RAIZ, 'client/pages/admin');

const SIN_TIEMPO_REAL: Record<string, string> = {
  'AdminLayout.tsx': 'el menú: sus contadores se actualizan con su propio sondeo y no es una lista de datos',
  'AdminSearch.tsx': 'una búsqueda puntual: se pide cada vez que se busca',
  'AuditoriaSaldos.tsx': 'una auditoría bajo demanda («Correr»): recalcularla en cada movimiento de dinero la haría pesada',
  'BusinessPlan.tsx': 'una calculadora de proyección: trabaja con lo que escribe la persona',
  'UnitEconomics.tsx': 'una calculadora de economía unitaria',
  'ContentAgent.tsx': 'generación de contenido bajo demanda',
  'CreateContract.tsx': 'un formulario',
  'CreateDispute.tsx': 'un formulario',
  'CreateTicket.tsx': 'un formulario',
  'ModulesManager.tsx': 'interruptores de configuración que cambia una sola persona (el dueño)',
  'PerformanceMonitor.tsx': 'se actualiza sola con su propio sondeo cada pocos segundos',
  'PlatformPhase.tsx': 'un interruptor con confirmación del dueño',
  'PlatformPhaseReset.tsx': 'un interruptor con confirmación del dueño',
  'Settings.tsx': 'un formulario de configuración',
};

const pantallas = readdirSync(DIR)
  .filter((n) => n.endsWith('.tsx'))
  .map((nombre) => ({ nombre, texto: readFileSync(join(DIR, nombre), 'utf8').replace(/\r\n/g, '\n') }));

const cargaDatos = (t: string) => /fetch\(|adminApi\.|API_URL/.test(t);
const escuchaEnVivo = (t: string) => /useCambiosDeAdministracion\(|useEventoEnVivo\(|useRecargaJuntada\(/.test(t);

describe('administración: todas las pantallas que cargan datos se actualizan en vivo', () => {
  it('cada pantalla que carga datos escucha los avisos del servidor, o figura con su razón', () => {
    const sinEscuchar = pantallas.filter((p) => cargaDatos(p.texto) && !escuchaEnVivo(p.texto) && !(p.nombre in SIN_TIEMPO_REAL)).map((p) => p.nombre);
    expect(sinEscuchar).toEqual([]);
  });

  it('la lista de excepciones no se pudre: cada una existe, carga datos y sigue sin escuchar (si ya escucha, se saca de la lista)', () => {
    for (const [nombre, razon] of Object.entries(SIN_TIEMPO_REAL)) {
      const p = pantallas.find((x) => x.nombre === nombre);
      expect(p).toBeDefined();
      expect(razon.length).toBeGreaterThan(10);
      expect(escuchaEnVivo(p!.texto)).toBe(false);
    }
  });

  it('los tipos de aviso que escuchan las pantallas existen en el servidor (un tipo mal escrito no recibe nada, en silencio)', () => {
    const servidor = readFileSync(join(RAIZ, 'server/services/avisosPorCambios.ts'), 'utf8');
    const validos = new Set<string>([
      ...[...servidor.matchAll(/delAdministrador\('(\w+)'/g)].map((m) => m[1]),
      ...[...servidor.matchAll(/cuelgaDelContrato\(\w+, '(\w+)'/g)].map((m) => m[1]),
      ...[...servidor.matchAll(/soloParaAdministracion\(\w+, '(\w+)'/g)].map((m) => m[1]),
    ]);
    const usados = new Set<string>();
    for (const p of pantallas) {
      for (const m of p.texto.matchAll(/useCambiosDeAdministracion\(\s*\[([^\]]*)\]/g)) {
        for (const t of m[1].matchAll(/'(\w+)'/g)) usados.add(t[1]);
      }
    }
    expect([...usados].filter((t) => !validos.has(t))).toEqual([]);
    expect(usados.size).toBeGreaterThan(5);
  });

  it('las pantallas nuevas de esta tanda están en vivo', () => {
    for (const nombre of ['PanelGeneralDePublicaciones.tsx', 'CancelacionesDeContrato.tsx', 'Contracts.tsx', 'PendingPayments.tsx']) {
      expect(escuchaEnVivo(pantallas.find((p) => p.nombre === nombre)!.texto)).toBe(true);
    }
  });
});
