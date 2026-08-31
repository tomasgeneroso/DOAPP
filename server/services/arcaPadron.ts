import { AppSetting } from '../models/sql/AppSetting.model.js';

/**
 * Consulta del padrón de ARCA por CUIT/CUIL.
 *
 * Qué resuelve: hoy `fiscalCondition`, `monotributoCategory` y `taxStatus` los
 * declara el usuario y no se contrastan con nada. Es el mismo problema que
 * tuvimos con la matrícula -- un dato que la app muestra como si lo supiera
 * cuando en realidad se lo creyó.
 *
 * ARCA expone un servicio SOAP (ws_sr_constancia_inscripcion, antes "Alcance
 * 5") que devuelve, para un CUIT: nombre o razón social, tipo y número de
 * documento, domicilio fiscal, condición impositiva y estado. Es gratuito.
 *
 * Qué NO resuelve, y conviene tenerlo claro: confirma que el CUIT existe y a
 * quién pertenece, no que la persona sentada del otro lado sea esa. Eso lo hace
 * Didit. Se complementan; ninguno reemplaza al otro.
 *
 * Requisitos operativos, que son la parte lenta:
 *   1. Certificado digital X.509 emitido por ARCA (clave fiscal).
 *   2. Autenticar contra WSAA para obtener un Ticket de Acceso.
 *   3. Consumir el servicio con ese ticket.
 *
 * Hasta que el certificado exista, esto queda apagado y responde "no
 * disponible" en vez de romper: la app tiene que funcionar igual sin ARCA.
 */

const SETTING_KEY = 'arca_padron';

/** Apagado por defecto: sin certificado cargado no hay nada que consultar. */
export async function isArcaEnabled(): Promise<boolean> {
  try {
    const row = await AppSetting.findByPk(SETTING_KEY);
    return row?.value?.enabled === true;
  } catch {
    return false;
  }
}

export async function setArcaEnabled(enabled: boolean, updatedBy?: string): Promise<void> {
  await AppSetting.upsert({
    key: SETTING_KEY,
    value: { enabled, changedAt: new Date().toISOString() },
    updatedBy,
  } as any);
}

/** Si están las credenciales para siquiera intentarlo. */
export function isArcaConfigured(): boolean {
  return Boolean(
    process.env.ARCA_CUIT &&
    process.env.ARCA_CERT &&
    process.env.ARCA_KEY,
  );
}

export interface PadronResult {
  ok: boolean;
  /** Motivo estable para que el llamador decida sin leer el mensaje. */
  reason?: 'DISABLED' | 'NOT_CONFIGURED' | 'INVALID_CUIT' | 'NOT_FOUND' | 'UPSTREAM_ERROR';
  message?: string;
  data?: {
    cuit: string;
    nombre: string;
    tipoPersona: 'FISICA' | 'JURIDICA';
    documento: { tipo: string; numero: string } | null;
    domicilio: {
      calle: string | null;
      localidad: string | null;
      provincia: string | null;
      codigoPostal: string | null;
    } | null;
    /** monotributo | responsable_inscripto | exento | no_alcanzado | desconocido */
    condicionFiscal: string;
    categoriaMonotributo: string | null;
    estado: string;
    consultadoEn: string;
  };
}

/**
 * Valida el dígito verificador del CUIT antes de salir a la red.
 *
 * Un CUIT mal tipeado es el caso más común y no hace falta molestar a ARCA para
 * detectarlo: el algoritmo es público y determinístico.
 */
export function isValidCuit(raw: string): boolean {
  const cuit = String(raw || '').replace(/[^0-9]/g, '');
  if (cuit.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cuit)) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(cuit[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;

  return verificador === Number(cuit[10]);
}

/** Normaliza lo que devuelve ARCA a los valores que usa la app. */
function mapCondicion(impuestos: any[], monotributo: any[]): { condicion: string; categoria: string | null } {
  if (Array.isArray(monotributo) && monotributo.length > 0) {
    const cat = monotributo[0]?.categoriaMonotributo || monotributo[0]?.descripcionCategoria || null;
    return { condicion: 'monotributo', categoria: cat ? String(cat) : null };
  }

  const ids = (Array.isArray(impuestos) ? impuestos : []).map((i) => Number(i?.idImpuesto));
  // 30 = IVA. Estar inscripto en IVA es lo que define al responsable inscripto.
  if (ids.includes(30)) return { condicion: 'responsable_inscripto', categoria: null };
  if (ids.includes(32)) return { condicion: 'exento', categoria: null };

  return { condicion: 'desconocido', categoria: null };
}

/**
 * Consulta el padrón.
 *
 * La llamada SOAP concreta vive detrás de este límite a propósito: mientras no
 * haya certificado, el resto de la app ya puede integrarse contra esta forma y
 * el día que el certificado exista sólo cambia el interior.
 */
export async function consultarPadron(cuitRaw: string): Promise<PadronResult> {
  if (!(await isArcaEnabled())) {
    return {
      ok: false,
      reason: 'DISABLED',
      message: 'La verificación con ARCA está desactivada.',
    };
  }

  if (!isValidCuit(cuitRaw)) {
    return {
      ok: false,
      reason: 'INVALID_CUIT',
      message: 'El CUIT/CUIL no es válido. Revisá que estén los 11 dígitos.',
    };
  }

  if (!isArcaConfigured()) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      message:
        'Falta el certificado digital de ARCA. Se tramita con clave fiscal y se carga en ARCA_CERT, ARCA_KEY y ARCA_CUIT.',
    };
  }

  const cuit = String(cuitRaw).replace(/[^0-9]/g, '');

  try {
    const { getPadronClient } = await import('./arcaClient.js');
    const client = await getPadronClient();
    const raw = await client.getPersona(cuit);

    if (!raw) {
      return { ok: false, reason: 'NOT_FOUND', message: 'ARCA no tiene datos para ese CUIT.' };
    }

    const persona = raw.datosGenerales || raw;
    const { condicion, categoria } = mapCondicion(
      raw.datosRegimenGeneral?.impuesto || [],
      raw.datosMonotributo ? [raw.datosMonotributo] : [],
    );

    const dom = persona.domicilioFiscal || null;
    const nombre = persona.razonSocial
      || [persona.apellido, persona.nombre].filter(Boolean).join(', ')
      || '';

    return {
      ok: true,
      data: {
        cuit,
        nombre,
        tipoPersona: persona.tipoPersona === 'JURIDICA' ? 'JURIDICA' : 'FISICA',
        documento: persona.numeroDocumento
          ? { tipo: persona.tipoDocumento || 'DNI', numero: String(persona.numeroDocumento) }
          : null,
        domicilio: dom
          ? {
              calle: dom.direccion || null,
              localidad: dom.localidad || null,
              provincia: dom.descripcionProvincia || null,
              codigoPostal: dom.codPostal ? String(dom.codPostal) : null,
            }
          : null,
        condicionFiscal: condicion,
        categoriaMonotributo: categoria,
        estado: persona.estadoClave || 'DESCONOCIDO',
        consultadoEn: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    // Que ARCA no responda no puede impedirle a nadie usar la app.
    console.warn('[arca] consulta fallida:', error?.message);
    return {
      ok: false,
      reason: 'UPSTREAM_ERROR',
      message: 'No se pudo consultar ARCA en este momento. Probá más tarde.',
    };
  }
}
