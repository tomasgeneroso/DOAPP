import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

/**
 * Cliente de los web services de ARCA.
 *
 * ATENCION: esta parte no está probada contra ARCA. No se puede: hace falta un
 * certificado digital emitido por ellos, que se tramita con clave fiscal, y
 * todavía no lo tenemos. Lo que sí está probado es todo lo que la rodea -- el
 * interruptor, la validación del CUIT y que la app siga funcionando cuando esto
 * no responde.
 *
 * Cuando llegue el certificado, el primer paso es probar contra el ambiente de
 * homologación (WSASS) antes de tocar producción.
 *
 * El protocolo tiene dos etapas:
 *
 *   WSAA   se le manda un XML firmado con el certificado y devuelve un Ticket
 *          de Acceso (token + sign) que vale 12 horas.
 *   Padrón se le manda el CUIT junto con ese ticket y devuelve los datos.
 *
 * La firma es CMS/PKCS#7, que en Node puro es incómoda; se delega en openssl,
 * que está en cualquier Linux y evita sumar una dependencia de criptografía
 * para una sola llamada.
 */

const HOMOLOGACION = process.env.ARCA_ENV !== 'production';

const WSAA_URL = HOMOLOGACION
  ? 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaa.afip.gov.ar/ws/services/LoginCms';

const PADRON_URL = HOMOLOGACION
  ? 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5'
  : 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5';

const SERVICE = 'ws_sr_padron_a5';

interface Ticket { token: string; sign: string; expira: number }

/** El ticket vale 12 horas: se reusa en memoria en vez de pedir uno por consulta. */
let cached: Ticket | null = null;

function xmlValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

/** Login Ticket Request: lo que WSAA espera firmado. */
function buildLoginTicketRequest(): string {
  const now = Date.now();
  const gen = new Date(now - 10 * 60 * 1000).toISOString();
  const exp = new Date(now + 12 * 60 * 60 * 1000).toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now / 1000)}</uniqueId>
    <generationTime>${gen}</generationTime>
    <expirationTime>${exp}</expirationTime>
  </header>
  <service>${SERVICE}</service>
</loginTicketRequest>`;
}

/**
 * Firma el pedido en formato CMS y lo devuelve en base64.
 *
 * El certificado y la clave llegan por variables de entorno en PEM. Se escriben
 * en un directorio temporal porque openssl los necesita como archivos, y se
 * borran siempre -- incluso si la firma falla -- para no dejar una clave
 * privada en el disco.
 */
async function signCms(payload: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'arca-'));
  try {
    const cert = join(dir, 'cert.pem');
    const key = join(dir, 'key.pem');
    const data = join(dir, 'tra.xml');

    await writeFile(cert, String(process.env.ARCA_CERT).replace(/\\n/g, '\n'), 'utf8');
    await writeFile(key, String(process.env.ARCA_KEY).replace(/\\n/g, '\n'), 'utf8');
    await writeFile(data, payload, 'utf8');

    const { stdout } = await exec('openssl', [
      'cms', '-sign',
      '-in', data,
      '-signer', cert,
      '-inkey', key,
      '-nodetach', '-outform', 'DER',
      '-binary',
    ], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 } as any);

    return Buffer.from(stdout as any).toString('base64');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function getTicket(): Promise<Ticket> {
  if (cached && cached.expira > Date.now() + 5 * 60 * 1000) return cached;

  const cms = await signCms(buildLoginTicketRequest());

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(WSAA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: envelope,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`WSAA respondió ${res.status}: ${text.slice(0, 300)}`);

  // La respuesta trae el XML del ticket escapado dentro del sobre SOAP.
  const inner = (xmlValue(text, 'loginCmsReturn') || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  const token = xmlValue(inner, 'token');
  const sign = xmlValue(inner, 'sign');
  const expText = xmlValue(inner, 'expirationTime');

  if (!token || !sign) throw new Error('WSAA no devolvió token y sign');

  cached = {
    token,
    sign,
    expira: expText ? new Date(expText).getTime() : Date.now() + 11 * 60 * 60 * 1000,
  };
  return cached;
}

export async function getPadronClient() {
  const ticket = await getTicket();
  const cuitRepresentada = String(process.env.ARCA_CUIT).replace(/[^0-9]/g, '');

  return {
    async getPersona(cuit: string): Promise<any> {
      const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Body>
    <a5:getPersona>
      <token>${ticket.token}</token>
      <sign>${ticket.sign}</sign>
      <cuitRepresentada>${cuitRepresentada}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </a5:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

      const res = await fetch(PADRON_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: envelope,
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`Padrón respondió ${res.status}`);
      if (/noExistePersona|<faultstring>/i.test(text)) return null;

      return parsePersona(text);
    },
  };
}

/**
 * Extrae los campos del XML de respuesta.
 *
 * Se leen los pocos campos que la app usa en lugar de armar un parser completo:
 * el resto de la respuesta no nos interesa y un parser genérico sería más
 * superficie para mantener sin ganar nada.
 */
function parsePersona(xml: string): any {
  const g = (tag: string) => xmlValue(xml, tag);

  const monotributo = /<datosMonotributo>/i.test(xml)
    ? { categoriaMonotributo: g('categoriaMonotributo') || g('descripcionCategoria') }
    : null;

  const impuestos = [...xml.matchAll(/<idImpuesto>(\d+)<\/idImpuesto>/gi)]
    .map((m) => ({ idImpuesto: Number(m[1]) }));

  return {
    datosGenerales: {
      razonSocial: g('razonSocial'),
      apellido: g('apellido'),
      nombre: g('nombre'),
      tipoPersona: g('tipoPersona'),
      tipoDocumento: g('tipoDocumento'),
      numeroDocumento: g('numeroDocumento'),
      estadoClave: g('estadoClave'),
      domicilioFiscal: /<domicilioFiscal>/i.test(xml)
        ? {
            direccion: g('direccion'),
            localidad: g('localidad'),
            descripcionProvincia: g('descripcionProvincia'),
            codPostal: g('codPostal'),
          }
        : null,
    },
    datosMonotributo: monotributo,
    datosRegimenGeneral: { impuesto: impuestos },
  };
}
