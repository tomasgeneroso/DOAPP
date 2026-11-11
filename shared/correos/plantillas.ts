/**
 * Módulo de correos a usuarios (regla del dueño, 2026-11-11): plantillas que el equipo escribe y elige, con variables que se reemplazan por los datos de cada persona.
 *
 * Esto es lo que comparten el servidor (que arma y manda cada correo) y la pantalla de administración (que muestra la vista previa): un solo armado, así lo que se ve al
 * escribir es lo que le llega a la persona. El texto de la plantilla es TEXTO, no HTML: se escapa y se arma con párrafos, así nadie rompe el diseño ni mete código.
 */

/** Variables que se pueden escribir entre llaves dobles en el asunto y en el cuerpo. */
export const VARIABLES_DE_PLANTILLA = [
  { nombre: 'saludo', descripcion: '«Hola Ana» (o solo «Hola» si todavía no sabemos el nombre)' },
  { nombre: 'nombre', descripcion: 'El primer nombre de la persona (vacío si todavía no lo cargó)' },
  { nombre: 'enlaceRegistro', descripcion: 'La dirección para terminar el registro' },
  { nombre: 'enlaceApp', descripcion: 'La dirección de DOAPP' },
] as const;

export type NombreDeVariable = (typeof VARIABLES_DE_PLANTILLA)[number]['nombre'];

export const LIMITES_DE_PLANTILLA = { nombre: 80, asunto: 150, cuerpo: 5000, botonTexto: 40, botonUrl: 300 } as const;

export interface PlantillaDeCorreo {
  asunto: string;
  cuerpo: string;
  /** Texto del botón (opcional). Sin texto no hay botón. */
  botonTexto?: string | null;
  /** A dónde lleva el botón: una variable ({{enlaceRegistro}}) o una dirección https de DOAPP. */
  botonUrl?: string | null;
}

/** Lo que vale cada variable para UNA persona. `enlaceDeBaja` va aparte: no es una variable del texto, lo pone el pie del correo. */
export interface DatosDeLaPersona {
  nombre: string;
  enlaceRegistro: string;
  enlaceApp: string;
  enlaceDeBaja: string;
}

const patronDeVariable = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
const conocidas = new Set<string>(VARIABLES_DE_PLANTILLA.map((v) => v.nombre));

/** Las variables que el texto usa y no existen (un error de tipeo: «{{nombr}}» llegaría tal cual al correo). */
export function variablesDesconocidas(texto: string): string[] {
  const mal = new Set<string>();
  for (const m of String(texto ?? '').matchAll(patronDeVariable)) if (!conocidas.has(m[1])) mal.add(m[1]);
  return [...mal];
}

/** Primer nombre listo para saludar: sin el nombre provisorio del registro en pasos («Nuevo usuario»). */
export function primerNombre(nombreCompleto: string | null | undefined): string {
  const limpio = String(nombreCompleto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio || /^nuevo usuario$/i.test(limpio)) return '';
  const primero = limpio.split(' ')[0];
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

export function reemplazarVariables(texto: string, datos: DatosDeLaPersona): string {
  const nombre = primerNombre(datos.nombre);
  const valores: Record<NombreDeVariable, string> = {
    saludo: nombre ? `Hola ${nombre}` : 'Hola',
    nombre,
    enlaceRegistro: datos.enlaceRegistro,
    enlaceApp: datos.enlaceApp,
  };
  return String(texto ?? '').replace(patronDeVariable, (entero, v: string) => (v in valores ? valores[v as NombreDeVariable] : entero));
}

const escapar = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface CorreoArmado {
  asunto: string;
  html: string;
  texto: string;
}

/**
 * Arma el correo de una persona. `prueba`: antepone «[PRUEBA]» al asunto y avisa arriba que es una prueba (para mandarle al equipo cómo se ve sin molestar a nadie).
 * El pie lleva siempre quién manda, por qué le llega y cómo darse de baja (es obligatorio en la Argentina para los correos que no son del servicio mismo).
 */
export function armarCorreo(plantilla: PlantillaDeCorreo, datos: DatosDeLaPersona, opciones: { prueba?: boolean } = {}): CorreoArmado {
  const asunto = `${opciones.prueba ? '[PRUEBA] ' : ''}${reemplazarVariables(plantilla.asunto, datos).replace(/\s+/g, ' ').trim()}`;
  const cuerpo = reemplazarVariables(plantilla.cuerpo, datos).replace(/\r\n/g, '\n').trim();
  const parrafos = cuerpo.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const botonTexto = String(plantilla.botonTexto ?? '').trim();
  const botonUrl = reemplazarVariables(String(plantilla.botonUrl ?? ''), datos).trim();
  const hayBoton = !!botonTexto && /^https:\/\//i.test(botonUrl);

  const p = (t: string, estilo = '') => `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;${estilo}">${t}</p>`;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(asunto)}</title></head>
<body style="margin:0;padding:24px;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0284c7;padding:18px 28px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#ffffff;">DOAPP</td></tr>
<tr><td style="padding:28px;">
${opciones.prueba ? p('<strong>Esto es una PRUEBA:</strong> solo lo ves vos. Así le va a llegar a cada persona.', 'background:#fef3c7;border-radius:8px;padding:10px 12px;color:#92400e;font-size:13px;') : ''}
${parrafos.map((t) => p(escapar(t).replace(/\n/g, '<br>'))).join('\n')}
${hayBoton ? `<p style="margin:24px 0;text-align:center;"><a href="${escapar(botonUrl)}" style="display:inline-block;background:#0284c7;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;">${escapar(botonTexto)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:18px 28px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">
Te escribe DOAPP (<a href="${escapar(datos.enlaceApp)}" style="color:#64748b;">${escapar(datos.enlaceApp.replace(/^https?:\/\//, ''))}</a>) porque tenés una cuenta en la plataforma.<br>
Si no querés recibir más correos como este, <a href="${escapar(datos.enlaceDeBaja)}" style="color:#64748b;">darte de baja acá</a>.
</td></tr></table></body></html>`;

  const texto = [
    opciones.prueba ? 'ESTO ES UNA PRUEBA: solo lo ves vos.\n' : '',
    parrafos.join('\n\n'),
    hayBoton ? `\n${botonTexto}: ${botonUrl}` : '',
    `\n—\nTe escribe DOAPP (${datos.enlaceApp}) porque tenés una cuenta en la plataforma.\nSi no querés recibir más correos como este, darte de baja: ${datos.enlaceDeBaja}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { asunto, html, texto };
}

export interface ErrorDePlantilla {
  campo: 'nombre' | 'asunto' | 'cuerpo' | 'botonTexto' | 'botonUrl';
  mensaje: string;
}

/**
 * Qué está mal en una plantilla, dicho para quien la escribe. `hostsPermitidos`: las direcciones https a las que puede llevar el botón (las de DOAPP): un botón que lleva a
 * cualquier otro sitio es la forma más fácil de usar el correo de la plataforma para estafar.
 */
export function erroresDePlantilla(p: PlantillaDeCorreo & { nombre?: string }, hostsPermitidos: string[]): ErrorDePlantilla[] {
  const errores: ErrorDePlantilla[] = [];
  const largo = (campo: ErrorDePlantilla['campo'], valor: string, max: number, nombre: string) => {
    if (valor.length > max) errores.push({ campo, mensaje: `${nombre} tiene más de ${max} caracteres.` });
  };
  if (p.nombre !== undefined) {
    if (!p.nombre.trim()) errores.push({ campo: 'nombre', mensaje: 'Ponele un nombre a la plantilla.' });
    largo('nombre', p.nombre, LIMITES_DE_PLANTILLA.nombre, 'El nombre');
  }
  if (!String(p.asunto ?? '').trim()) errores.push({ campo: 'asunto', mensaje: 'Falta el asunto.' });
  largo('asunto', String(p.asunto ?? ''), LIMITES_DE_PLANTILLA.asunto, 'El asunto');
  if (!String(p.cuerpo ?? '').trim()) errores.push({ campo: 'cuerpo', mensaje: 'Falta el texto del correo.' });
  largo('cuerpo', String(p.cuerpo ?? ''), LIMITES_DE_PLANTILLA.cuerpo, 'El texto');
  largo('botonTexto', String(p.botonTexto ?? ''), LIMITES_DE_PLANTILLA.botonTexto, 'El texto del botón');
  largo('botonUrl', String(p.botonUrl ?? ''), LIMITES_DE_PLANTILLA.botonUrl, 'La dirección del botón');

  for (const [campo, valor] of [['asunto', p.asunto], ['cuerpo', p.cuerpo], ['botonUrl', p.botonUrl]] as const) {
    const mal = variablesDesconocidas(String(valor ?? ''));
    if (mal.length) errores.push({ campo, mensaje: `Variable desconocida: ${mal.map((m) => `{{${m}}}`).join(', ')}. Usá solo las de la lista.` });
  }

  const texto = String(p.botonTexto ?? '').trim();
  const url = String(p.botonUrl ?? '').trim();
  if (texto && !url) errores.push({ campo: 'botonUrl', mensaje: 'El botón necesita una dirección.' });
  if (url && !texto) errores.push({ campo: 'botonTexto', mensaje: 'La dirección necesita un texto para el botón.' });
  if (url && !/^\{\{\s*(enlaceRegistro|enlaceApp)\s*\}\}$/.test(url)) {
    let host = '';
    try {
      const u = new URL(url);
      host = u.protocol === 'https:' ? u.hostname.toLowerCase() : '';
    } catch {
      host = '';
    }
    if (!host || !hostsPermitidos.map((h) => h.toLowerCase()).includes(host)) {
      errores.push({ campo: 'botonUrl', mensaje: 'El botón solo puede llevar a una dirección https de DOAPP (o usar {{enlaceRegistro}} / {{enlaceApp}}).' });
    }
  }
  return errores;
}
