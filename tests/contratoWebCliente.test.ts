import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * La pantalla del contrato (web) hablaba con el servidor como si `api` fuera axios, pero `client/lib/api.ts`
 * devuelve el JSON tal cual y lanza `Error(mensaje del servidor)`. Efectos en producción:
 *   - generar y confirmar el código de emparejamiento, e iniciar sin código, fallaban con un error aunque el
 *     servidor hubiera hecho el cambio (`response.data` no existe → TypeError), y el cartel nunca se actualizaba;
 *   - los mensajes de error del servidor ("El código solo se puede generar 24 horas antes…") nunca llegaban:
 *     `error.response?.data?.message` es siempre undefined con este cliente;
 *   - «Abrir chat» llamaba a /chat/conversations/by-contract/:id, una ruta que no existe (la real es
 *     /chat/contract/:id y responde { success, data: conversación });
 *   - no había ningún botón para aceptar el contrato (PUT /contracts/:id/accept), así que un contrato aprobado por
 *     administración no podía avanzar desde la web.
 * Estas pruebas leen el código fuente: son guardas contra volver a escribirlo mal.
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

const contrato = leer('client/pages/ContractDetail.tsx');
const detalleDeTrabajo = leer('client/pages/JobDetail.tsx');
const rutasDeChat = leer('server/routes/chat.ts');
const rutasDeContratos = leer('server/routes/contracts.ts');
const clienteApi = leer('client/lib/api.ts');

describe('ContractDetail usa el cliente api como lo que es (JSON desenvuelto, Error con el mensaje)', () => {
  it('el cliente api devuelve el JSON y lanza Error(message) (si esto cambia, hay que revisar la pantalla)', () => {
    expect(clienteApi).toMatch(/return res\.json\(\);/);
    expect(clienteApi).toMatch(/throw new Error\(error\.message \|\| `HTTP \$\{res\.status\}`\)/);
  });

  it('no lee response.data.success ni response.data.message (eso es axios)', () => {
    expect(contrato).not.toMatch(/response\.data\.success/);
    expect(contrato).not.toMatch(/response\.data\.message/);
  });

  it('no busca el mensaje de error en error.response (con este cliente nunca existe)', () => {
    expect(contrato).not.toMatch(/error\.response/);
  });

  it('los tres pedidos del emparejamiento miran response.success', () => {
    for (const ruta of ['generate-pairing', 'confirm-pairing', 'force-start-pairing']) {
      const i = contrato.indexOf(`/contracts/\${id}/${ruta}`);
      expect(i).toBeGreaterThan(-1);
      expect(contrato.slice(i, i + 400)).toMatch(/if \(response\.success\)/);
    }
  });
});

describe('abrir el chat del contrato usa una ruta que existe', () => {
  it('el servidor tiene GET /chat/contract/:contractId y responde { success, data }', () => {
    expect(rutasDeChat).toMatch(/router\.get\("\/contract\/:contractId"/);
    const i = rutasDeChat.indexOf('router.get("/contract/:contractId"');
    expect(rutasDeChat.slice(i, i + 3500)).toMatch(/data: conversationData/);
  });

  it('la web no llama más a by-contract (no existe)', () => {
    expect(contrato).not.toMatch(/by-contract/);
    expect(detalleDeTrabajo).not.toMatch(/by-contract/);
  });

  it('la web llama a /chat/contract/:id y navega con data.id', () => {
    expect(contrato).toMatch(/api\.get\(`\/chat\/contract\/\$\{id\}`\)/);
    expect(contrato).toMatch(/navigate\(`\/chat\/\$\{response\.data\.id\}`\)/);
    expect(detalleDeTrabajo).toMatch(/`\/api\/chat\/contract\/\$\{contractData\.id\}`/);
    expect(detalleDeTrabajo).toMatch(/navigate\(`\/chat\/\$\{data\.data\.id\}`\)/);
  });
});

describe('aceptar el contrato desde la web', () => {
  it('el servidor acepta PUT /contracts/:id/accept', () => {
    expect(rutasDeContratos).toMatch(/router\.put\("\/:id\/accept"/);
  });

  it('la pantalla llama a ese pedido', () => {
    expect(contrato).toMatch(/api\.put\(`\/contracts\/\$\{id\}\/accept`\)/);
  });

  it('el botón sólo aparece con el contrato aprobado ("ready") y a quien todavía no aceptó', () => {
    const i = contrato.indexOf("contract.status === 'ready'");
    expect(i).toBeGreaterThan(-1);
    const trozo = contrato.slice(i, i + 1000);
    expect(trozo).toMatch(/isClient && !contract\.termsAcceptedByClient/);
    expect(trozo).toMatch(/isDoer && !contract\.termsAcceptedByDoer/);
    expect(trozo).toMatch(/onClick=\{handleAcceptContract\}/);
  });
});

describe('el código de emparejamiento se puede escribir completo (el personal tiene 6 caracteres)', () => {
  it('el campo de la web admite hasta 8 y se habilita desde 4 (no exactamente 4)', () => {
    expect(contrato).toMatch(/maxLength=\{8\}/);
    expect(contrato).toMatch(/pairingCode\.length < 4/);
    expect(contrato).not.toMatch(/maxLength=\{4\}/);
    expect(contrato).not.toMatch(/pairingCode\.length !== 4/);
  });

  it('el servidor genera el código personal de 6 caracteres y la columna admite 8', () => {
    const usuario = leer('server/models/sql/User.model.ts');
    expect(usuario).toMatch(/for \(let i = 0; i < 6; i\+\+\) code \+=/);
    expect(usuario).toMatch(/@Column\(DataType\.STRING\(8\)\)\n\s+personalPairingCode/);
  });
});
