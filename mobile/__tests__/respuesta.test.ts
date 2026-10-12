/**
 * Cómo responde de verdad el servidor, contra cómo lo leían las pantallas de la app:
 *   GET /contracts            → { success, contracts }            (la pantalla leía data.contracts)
 *   GET /contracts/:id        → { success, contract }             (leía data.contract)
 *   GET /contracts/by-job/:id → { success, contract }  UNO        (leía data.contracts)
 *   GET /proposals/job/:id    → { success, proposals }            (leía data.proposals)
 *   GET /proposals?type=sent  → { success, proposals }            (leía data.proposals)
 *   GET /chat/conversations/:id → { success, data: conversación } (leía data.conversation)
 *   POST /chat/.../messages   → { success, message }              (leía data.message)
 * Con esas lecturas las pantallas quedaban vacías sin ningún error.
 */
import { contratosDelTrabajo, leerClave, leerConversacion, leerCuerpo, leerLista } from '../services/respuesta';

describe('leerClave', () => {
  it('lee la clave al lado de success (como responde el servidor)', () => {
    expect(leerClave({ success: true, contract: { id: 'c1' } }, 'contract')).toEqual({ id: 'c1' });
  });

  it('también la lee envuelta en data', () => {
    expect(leerClave({ success: true, data: { contract: { id: 'c1' } } }, 'contract')).toEqual({ id: 'c1' });
  });

  it('si están las dos, manda la de al lado de success', () => {
    expect(leerClave({ success: true, contract: { id: 'a' }, data: { contract: { id: 'b' } } }, 'contract')).toEqual({ id: 'a' });
  });

  it('sin éxito, sin la clave o con null: undefined (nunca un valor inventado)', () => {
    expect(leerClave(null, 'contract')).toBeUndefined();
    expect(leerClave({ success: false, contract: { id: 'c1' } }, 'contract')).toBeUndefined();
    expect(leerClave({ success: true }, 'contract')).toBeUndefined();
    expect(leerClave({ success: true, contract: null }, 'contract')).toBeUndefined();
    expect(leerClave({ success: true, data: null }, 'contract')).toBeUndefined();
  });

  it('un 0 o un texto vacío válidos no se pierden', () => {
    expect(leerClave({ success: true, total: 0 }, 'total')).toBe(0);
    expect(leerClave({ success: true, nota: '' }, 'nota')).toBe('');
  });
});

describe('leerLista', () => {
  it('devuelve la lista en las dos formas', () => {
    expect(leerLista({ success: true, contracts: [1, 2] }, 'contracts')).toEqual([1, 2]);
    expect(leerLista({ success: true, data: { contracts: [3] } }, 'contracts')).toEqual([3]);
  });

  it('una lista vacía es una lista (distinta de «no hay dato»)', () => {
    expect(leerLista({ success: true, contracts: [] }, 'contracts')).toEqual([]);
  });

  it('si no es una lista, undefined', () => {
    expect(leerLista({ success: true, contracts: 'no' }, 'contracts')).toBeUndefined();
    expect(leerLista({ success: true, contracts: { a: 1 } }, 'contracts')).toBeUndefined();
    expect(leerLista({ success: false, contracts: [1] }, 'contracts')).toBeUndefined();
  });
});

describe('contratosDelTrabajo', () => {
  it('by-job devuelve UN contrato: la pantalla lo recibe como lista de uno', () => {
    expect(contratosDelTrabajo({ success: true, contract: { id: 'c1' } })).toEqual([{ id: 'c1' }]);
  });

  it('si algún día manda la lista, se usa la lista', () => {
    expect(contratosDelTrabajo({ success: true, contracts: [{ id: 'a' }, { id: 'b' }] })).toHaveLength(2);
  });

  it('un 404 («Contrato no encontrado para este trabajo») es una lista vacía', () => {
    expect(contratosDelTrabajo({ success: false, status: 404, message: 'Contrato no encontrado para este trabajo' })).toEqual([]);
    expect(contratosDelTrabajo(null)).toEqual([]);
  });
});

describe('leerConversacion', () => {
  it('el servidor manda la conversación como data', () => {
    expect(leerConversacion({ success: true, data: { id: 'k1', participants: [] } })).toEqual({ id: 'k1', participants: [] });
  });

  it('también acepta data.conversation y conversation', () => {
    expect(leerConversacion({ success: true, data: { conversation: { id: 'k2' } } })).toEqual({ id: 'k2' });
    expect(leerConversacion({ success: true, conversation: { id: 'k3' } })).toEqual({ id: 'k3' });
  });

  it('data que es una lista no es una conversación', () => {
    expect(leerConversacion({ success: true, data: [1, 2] })).toBeUndefined();
    expect(leerCuerpo({ success: true, data: [1, 2] })).toBeUndefined();
  });
});

describe('el mensaje enviado (POST /chat/conversations/:id/messages → { success, message })', () => {
  it('se lee de al lado de success', () => {
    expect(leerClave({ success: true, message: { id: 'm1', content: 'hola' } }, 'message')).toEqual({ id: 'm1', content: 'hola' });
  });
});

describe('las pantallas leen las respuestas con el lector común', () => {
  // Guarda de código fuente: volver a escribir `response.data.contract` hace que la pantalla quede vacía sin error.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  const leer = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
  const PROHIBIDO = /response\.data!?\.(contracts?|proposals?|conversation|message)\b/;

  it.each([
    'app/contracts/index.tsx',
    'app/contracts/[id].tsx',
    'app/job/[id].tsx',
    'app/proposals/index.tsx',
    'app/chat/[id].tsx',
  ])('%s no lee response.data.<clave> de las rutas que mandan la clave al lado de success', (rel) => {
    expect(leer(rel)).not.toMatch(PROHIBIDO);
    expect(leer(rel)).toMatch(/from '\.\.\/\.\.\/services\/respuesta'/);
  });
});
