import { describe, it, expect } from '@jest/globals';
import { esTarjetaDePostulacion, motivoParaNoAceptar } from '../shared/chat/tarjetas';

/** Qué es una postulación en el chat (reporte del dueño, 2026-11-27: los avisos del equipo salían como «Te postulaste a este trabajo · Pendiente», vacíos). */
describe('tarjetas del chat', () => {
  it.each([
    ['👤 Ana se sumó al equipo (2 de 3).', { action: 'equipo_suma', jobId: 'j', equipo: true }],
    ['🔒 El trabajo terminó: este chat se cierra.', { action: 'chat_cerrado', jobId: 'j' }],
    ['📋 Chat grupal del trabajo: X||Equipo de trabajo||Este chat incluye a todos.', { action: 'group_chat_created', jobId: 'j' }],
    ['Ana compartió su trabajo publicado||X||📋 X', { action: 'job_attachment', jobId: 'j' }],
    ['Pago confirmado||Cotización pagada||Monto: $10', { action: 'quote_payment_confirmed' }],
    ['Propuesta aceptada||X||ok', { action: 'direct_proposal_accepted', proposalId: 'p' }],
  ])('es un aviso y no una postulación: %s', (texto, metadata) => {
    expect(esTarjetaDePostulacion(texto, metadata)).toBe(false);
  });

  it('una postulación y una propuesta directa sí son tarjetas', () => {
    expect(esTarjetaDePostulacion('Ana aplicó al trabajo||X||…', { action: 'job_application', proposalId: 'p' })).toBe(true);
    expect(esTarjetaDePostulacion('Ana se postuló al trabajo||X||…', { proposalId: 'p' })).toBe(true);
    expect(esTarjetaDePostulacion('x', { action: 'direct_contract_proposal', proposalId: 'p' })).toBe(true);
  });

  it('antes de ofrecer «Aceptar» se mira el trabajo', () => {
    expect(motivoParaNoAceptar({ jobStatus: 'open' })).toBeNull();
    expect(motivoParaNoAceptar({})).toBeNull();
    expect(motivoParaNoAceptar({ jobStatus: 'cancelled' })).toMatch(/cancelado/);
    expect(motivoParaNoAceptar({ jobStatus: 'completed' })).toMatch(/terminó/);
    expect(motivoParaNoAceptar({ jobStatus: 'draft', action: 'direct_contract_proposal' })).toBeNull();
  });
});
