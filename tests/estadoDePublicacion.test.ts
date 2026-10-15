import { describe, it, expect } from '@jest/globals';
import { estadoDePublicacion } from '../shared/jobs/estadoDePublicacion.js';

describe('estadoDePublicacion', () => {
  it('un borrador dice que falta pagar o verificar la identidad y ofrece pagar', () => {
    const e = estadoDePublicacion({ id: 'j1', status: 'draft' });
    expect(e).toMatchObject({ etiqueta: 'Sin publicar', enElMuro: false, tono: 'atencion', accion: { texto: 'Pagar y publicar', ruta: '/jobs/j1/payment' } });
    expect(e.explicacion).toMatch(/falta pagar/);
  });

  it('pagado y esperando al administrador: explica por qué no está en el muro', () => {
    const e = estadoDePublicacion({ id: 'j1', status: 'pending_approval' });
    expect(e).toMatchObject({ etiqueta: 'En revisión', enElMuro: false, tono: 'espera' });
    expect(e.explicacion).toMatch(/administrador/);
    expect(e.accion).toBeUndefined(); // no hay nada que hacer: solo esperar
  });

  it('pago en proceso: espera, con enlace para ver el pago', () => {
    expect(estadoDePublicacion({ id: 'j1', status: 'pending_payment' })).toMatchObject({ etiqueta: 'Pago en proceso', enElMuro: false, tono: 'espera', accion: { ruta: '/jobs/j1/payment' } });
  });

  it('solo «open» y «published» están en el muro', () => {
    const estados = ['draft', 'pending_payment', 'pending_approval', 'open', 'published', 'paused', 'in_progress', 'completed', 'cancelled', 'disputed', 'otro'];
    const enMuro = estados.filter((s) => estadoDePublicacion({ id: 'j', status: s }).enElMuro);
    expect(enMuro.sort()).toEqual(['open', 'published']);
  });

  it('un estado desconocido no rompe: muestra el estado tal cual', () => {
    expect(estadoDePublicacion({ id: 'j', status: 'algo_nuevo' })).toMatchObject({ etiqueta: 'algo_nuevo', explicacion: '', enElMuro: false });
  });

  it('el pausado avisa que no se ve hasta reanudarlo', () => {
    expect(estadoDePublicacion({ id: 'j', status: 'paused' }).explicacion).toMatch(/reanudes/);
  });
});
