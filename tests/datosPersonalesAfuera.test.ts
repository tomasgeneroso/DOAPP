import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  direccionSinDatos,
  enmascararCorreo,
  enmascararTelefono,
  limpiarTextoLibre,
  parametrosSinDatos,
  referrerSinDatos,
  ubicacionParaAnalitica,
} from '../shared/seguridad/datosPersonales.js';
import { sendWhatsAppCode } from '../server/services/whatsapp.js';

/**
 * Ningún dato personal sale de DOAPP hacia un tercero ni queda entero en un registro.
 *
 * Qué motivó esto (auditoría del 2026-11-06):
 *  - La analítica de la web le daba a Google la dirección de cada pantalla CON su query: `/reset-password?token=…`,
 *    `/verify-email?token=…`, `/auth/callback?token=<sesión>`, `/invitacion/<código>`. Además `send_page_view: true` deja que Google
 *    lea solo `document.location` y `document.referrer`, que traen todo eso (el referrer de la pantalla siguiente a entrar con Google
 *    es la pantalla de retorno con la sesión en la dirección).
 *  - La app mandaba un correo adentro del `User-Agent` de un pedido a OpenStreetMap.
 *  - El servidor escribía en su registro el correo de cada destinatario, y el teléfono con el código de verificación.
 *  - El correo de una cuenta viajaba en la dirección de un GET (`check-availability?email=`) y en la de una redirección (`mp_email=`).
 */

// `process.cwd()` y no `__dirname`: el proyecto corre estos tests como módulos ES, donde no existe.
const RAIZ = process.cwd();

function archivos(dir: string, exclusiones: RegExp[] = []): string[] {
  const completo = join(RAIZ, dir);
  if (!existsSync(completo)) return [];
  const salida: string[] = [];
  for (const e of readdirSync(completo, { withFileTypes: true })) {
    const relativo = `${dir}/${e.name}`;
    if (e.name === 'node_modules' || exclusiones.some((x) => x.test(relativo))) continue;
    if (e.isDirectory()) salida.push(...archivos(relativo, exclusiones));
    else if (/\.(ts|tsx)$/.test(e.name)) salida.push(relativo);
  }
  return salida;
}

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (relativo: string) => sinComentarios(readFileSync(join(RAIZ, relativo), 'utf8'));

describe('enmascarar y limpiar', () => {
  it('el correo se ve sin la dirección entera', () => {
    expect(enmascararCorreo('juan.perez@gmail.com')).toBe('j***@gmail.com');
    expect(enmascararCorreo('a@b.co')).toBe('a***@b.co');
    expect(enmascararCorreo('juan.perez@gmail.com')).not.toContain('perez');
  });

  it('una lista de correos se enmascara uno por uno', () => {
    expect(enmascararCorreo('ana@x.com, beto@y.com')).toBe('a***@x.com, b***@y.com');
    expect(enmascararCorreo(['ana@x.com', 'beto@y.com'])).toBe('a***@x.com, b***@y.com');
  });

  it('lo que no es un correo no se deja ver', () => {
    for (const raro of ['', 'sin-arroba', '@x.com', 'ana@', null, undefined]) expect(enmascararCorreo(raro)).toBe('***');
  });

  it('el teléfono deja solo los últimos cuatro dígitos', () => {
    expect(enmascararTelefono('+54 9 11 2233-4455')).toBe('***4455');
    expect(enmascararTelefono('5491122334455')).toBe('***4455');
    expect(enmascararTelefono('123')).toBe('***');
    expect(enmascararTelefono(undefined)).toBe('***');
  });

  it('el texto libre pierde correos y números largos, y se corta', () => {
    expect(limpiarTextoLibre('escribime a ana@correo.com por favor')).toBe('escribime a [correo] por favor');
    expect(limpiarTextoLibre('llamame al 11 2233-4455')).toBe('llamame al [número]');
    expect(limpiarTextoLibre('mi dni es 30.123.456')).toBe('mi dni es [número]');
    expect(limpiarTextoLibre('x'.repeat(300))).toHaveLength(100);
  });

  it('el texto libre común queda como estaba (una búsqueda, un precio corto)', () => {
    expect(limpiarTextoLibre('plomero urgente en Palermo')).toBe('plomero urgente en Palermo');
    expect(limpiarTextoLibre('2 ambientes $5000')).toBe('2 ambientes $5000');
  });
});

describe('direccionSinDatos (lo que se le cuenta a Google de cada pantalla)', () => {
  it('no deja pasar la query ni el fragmento: ahí viajan los secretos', () => {
    expect(direccionSinDatos('/reset-password?token=SECRETO123&email=ana@correo.com')).toBe('/reset-password');
    expect(direccionSinDatos('/verify-email?token=SECRETO123')).toBe('/verify-email');
    expect(direccionSinDatos('/auth/callback?token=eyJhbGciOi.AAA.BBB&needsDni=true')).toBe('/auth/callback');
    expect(direccionSinDatos('/admin/users?search=ana@correo.com')).toBe('/admin/users');
    expect(direccionSinDatos('/pagina#access_token=SECRETO')).toBe('/pagina');
  });

  it('conserva la ruta común', () => {
    expect(direccionSinDatos('/')).toBe('/');
    expect(direccionSinDatos('/jobs/123e4567-e89b-12d3-a456-426614174000')).toBe('/jobs/123e4567-e89b-12d3-a456-426614174000');
  });

  it('el código de una invitación no sale', () => {
    expect(direccionSinDatos('/invitacion/INF-ABC123')).toBe('/invitacion/:codigo');
    expect(direccionSinDatos('/invitacion/INF-ABC123?utm=x')).toBe('/invitacion/:codigo');
  });

  it('un correo dentro de la ruta (también codificado) no sale', () => {
    expect(direccionSinDatos('/usuarios/ana@correo.com/perfil')).toBe('/usuarios/:correo/perfil');
    expect(direccionSinDatos('/usuarios/ana%40correo.com')).toBe('/usuarios/:correo');
  });

  it('acepta una dirección completa y lo que no es dirección', () => {
    expect(direccionSinDatos('https://doapparg.com/reset-password?token=SECRETO')).toBe('/reset-password');
    expect(direccionSinDatos('')).toBe('/');
    expect(direccionSinDatos(undefined)).toBe('/');
  });

  it('el referrer pierde la query pero conserva el origen', () => {
    expect(referrerSinDatos('https://doapparg.com/auth/callback?token=SECRETO')).toBe('https://doapparg.com/auth/callback');
    expect(referrerSinDatos('https://www.google.com/')).toBe('https://www.google.com/');
    expect(referrerSinDatos('')).toBe('');
    expect(referrerSinDatos('no es una dirección')).toBe('');
  });
});

describe('ubicacionParaAnalitica (la dirección de la primera visita, con su campaña)', () => {
  const origen = 'https://doapparg.com';

  it('conserva la campaña: sin utm_* ni gclid Google no sabría qué anuncio trajo a la persona', () => {
    expect(ubicacionParaAnalitica({ origin: origen, pathname: '/', search: '?utm_source=meta&utm_medium=cpc&utm_campaign=piloto&gclid=Cj0KCQiA1234567890' }))
      .toBe('https://doapparg.com/?utm_source=meta&utm_medium=cpc&utm_campaign=piloto&gclid=Cj0KCQiA1234567890');
  });

  it('todo lo demás de la query sale: tokens, correos, búsquedas', () => {
    const salida = ubicacionParaAnalitica({ origin: origen, pathname: '/reset-password', search: '?token=SECRETO&email=ana@correo.com&search=x&utm_source=mail' });
    expect(salida).toBe('https://doapparg.com/reset-password?utm_source=mail');
    expect(salida).not.toMatch(/SECRETO|ana|search/);
  });

  it('una campaña cuyo valor trae un correo se descarta', () => {
    expect(ubicacionParaAnalitica({ origin: origen, pathname: '/', search: '?utm_source=ana@correo.com&utm_medium=cpc' })).toBe('https://doapparg.com/?utm_medium=cpc');
  });

  it('sin query, o sin campaña, queda solo el origen y la ruta limpia', () => {
    expect(ubicacionParaAnalitica({ origin: origen, pathname: '/jobs/1' })).toBe('https://doapparg.com/jobs/1');
    expect(ubicacionParaAnalitica({ origin: origen, pathname: '/auth/callback', search: '?token=eyJ.AAA.BBB' })).toBe('https://doapparg.com/auth/callback');
    expect(ubicacionParaAnalitica({ origin: origen, pathname: '/invitacion/INF-ABC123', search: '?x=1' })).toBe('https://doapparg.com/invitacion/:codigo');
  });
});

describe('parametrosSinDatos (los eventos de analítica)', () => {
  it('limpia los campos de texto libre y deja intactos importes e ids', () => {
    const limpio = parametrosSinDatos({
      search_term: 'plomero ana@correo.com',
      event_label: 'llamar 11 2233-4455',
      price_range: '50000-100000',
      value: 150000,
      job_id: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(limpio.search_term).toBe('plomero [correo]');
    expect(limpio.event_label).toBe('llamar [número]');
    expect(limpio.price_range).toBe('50000-100000');
    expect(limpio.value).toBe(150000);
    expect(limpio.job_id).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('entra a las listas de items', () => {
    const limpio = parametrosSinDatos({ items: [{ item_id: 'a1', item_location: 'Av. Siempreviva 742, tel 11 2233-4455' }] });
    expect(JSON.stringify(limpio)).not.toContain('2233');
    expect((limpio.items as Array<{ item_id: string }>)[0].item_id).toBe('a1');
  });
});

describe('el código de verificación y el teléfono no quedan en el registro', () => {
  const previo = { ...process.env };
  afterEach(() => {
    process.env = { ...previo };
    jest.restoreAllMocks();
  });

  /** Todo lo que el servidor escribió en su registro al intentar mandar un código con el canal sin configurar. */
  async function registroDeUnEnvio(entorno: string): Promise<string> {
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
    delete process.env.WHATSAPP_OTP_TEMPLATE;
    process.env.NODE_ENV = entorno;
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sendWhatsAppCode('+54 9 11 2233-4455', '987654');
    return [...aviso.mock.calls, ...error.mock.calls, ...info.mock.calls].flat().join(' ');
  }

  it('en producción no se escribe ni el código ni el teléfono', async () => {
    const texto = await registroDeUnEnvio('production');
    expect(texto).not.toContain('987654');
    expect(texto).not.toContain('5491122334455');
    expect(texto).not.toContain('2233');
  });

  it('fuera de producción el código sigue visible (para poder probar el flujo) pero el teléfono va enmascarado', async () => {
    const texto = await registroDeUnEnvio('development');
    expect(texto).toContain('987654');
    expect(texto).not.toContain('5491122334455');
  });
});

describe('lo que sale de la web hacia Google', () => {
  const analitica = leer('client/utils/analytics.ts');
  const componente = leer('client/components/GoogleAnalytics.tsx');

  it('ninguno de los dos archivos lee la query, el href ni deja que Google arme la visita solo', () => {
    for (const [nombre, codigo] of [['analytics.ts', analitica], ['GoogleAnalytics.tsx', componente]] as const) {
      expect({ nombre, lee: /location\.(search|href|hash)/.test(codigo) }).toEqual({ nombre, lee: false });
      expect({ nombre, automatica: /send_page_view:\s*true/.test(codigo) }).toEqual({ nombre, automatica: false });
    }
  });

  it('la dirección y el referrer pasan por las funciones que los limpian', () => {
    expect(analitica).toMatch(/direccionSinDatos/);
    expect(analitica).toMatch(/referrerSinDatos/);
    expect(analitica).toMatch(/parametrosSinDatos/);
  });

  it('cada evento sale por el envoltorio que limpia: el resto del archivo no llama a gtag a mano', () => {
    // Solo `gtagSeguro` puede llamar a `window.gtag(`: si alguien agrega un evento que lo llame directo, se salta la limpieza.
    const llamadas = [...analitica.matchAll(/window\.gtag\??\.?\(/g)].length;
    expect(llamadas).toBeLessThanOrEqual(2);
  });
});

describe('la analítica espera el consentimiento', () => {
  it('Google Analytics solo se carga si la persona aceptó en el cartel, y ningún evento sale sin ese permiso', () => {
    const componente = leer('client/components/GoogleAnalytics.tsx');
    expect(componente).toMatch(/useEleccionDeCookies\(\)\s*===\s*'aceptado'/);
    expect(componente).toMatch(/if \(!aceptada\) return;/); // antes de crear el <script>
    expect(componente.indexOf('if (!aceptada) return;')).toBeLessThan(componente.indexOf('googletagmanager.com/gtag/js'));
    // `index.html` deja un `gtag` que solo encola: lo encolado antes de aceptar se enviaría entero al cargar el script.
    expect(leer('client/utils/analytics.ts')).toMatch(/leerEleccionDeCookies\(\)\s*!==\s*"aceptado"/);
  });

  it('el cartel está en la aplicación y se puede cambiar la elección desde el pie de página', () => {
    expect(leer('client/App.tsx')).toMatch(/<BannerDeCookies\s*\/>/);
    expect(leer('client/components/app/Footer.tsx')).toMatch(/guardarEleccionDeCookies\(null\)/);
  });
});

describe('la sesión del ingreso social no viaja en la dirección', () => {
  const auth = leer('server/routes/auth.ts');

  it('Google, Facebook y X vuelven a /auth/callback sin token: la sesión va en una cookie httpOnly', () => {
    // Una dirección queda en los registros de nginx y Cloudflare y en el historial: la sesión no puede estar ahí.
    expect(auth).not.toMatch(/auth\/callback\?token=/);
    expect(auth).toMatch(/function guardarSesionEnCookie[\s\S]{0,200}httpOnly:\s*true/);
    expect([...auth.matchAll(/guardarSesionEnCookie\(res,/g)]).toHaveLength(3);
    expect([...auth.matchAll(/direccionDeRetornoSocial\(/g)].length).toBeGreaterThanOrEqual(4); // la definición + los tres retornos
  });

  it('el servidor no escribe en su registro ningún pedazo del token', () => {
    expect(auth).not.toMatch(/console\.\w+\([^;]*token\.substring/);
  });

  it('la pantalla de retorno entra con la cookie: pide /auth/me con credenciales y no exige token en la dirección', () => {
    const retorno = leer('client/pages/AuthCallback.tsx');
    expect(retorno).toMatch(/credentials:\s*'include'/);
    expect(retorno).toMatch(/\.\.\.\(token\s*\?\s*\{\s*Authorization/); // el token de la dirección es solo compatibilidad
    expect(retorno).toMatch(/replaceState/); // y si vino alguno, se borra de la dirección
  });
});

describe('ningún User-Agent propio lleva un correo', () => {
  const dirs = ['client', 'shared', 'server/routes', 'server/services', 'server/utils', 'server/middleware', 'mobile/app', 'mobile/components', 'mobile/services', 'mobile/hooks', 'mobile/utils', 'mobile/context'];

  it('hay código que mirar (el test no puede pasar contra carpetas vacías)', () => {
    expect(dirs.flatMap((d) => archivos(d)).length).toBeGreaterThan(300);
  });

  it('ni en `headers`, ni en la opción `userAgent` que reciben las funciones de shared/geo', () => {
    const conCorreo = /user-?agent['"]?\s*:\s*[`'"][^`'"\n]*@[^`'"\n]*[`'"]/i;
    const infractores = dirs.flatMap((d) => archivos(d)).filter((f) => conCorreo.test(leer(f)));
    expect(infractores).toEqual([]);
  });
});

describe('el correo no viaja en una dirección', () => {
  it('ni en una redirección del servidor ni en un pedido de la web', () => {
    const enLaDireccion = /[?&](email|mp_email|correo|phone|telefono|dni)=(\$\{|['"`]\s*\+)|mp_email/;
    const dirs = ['server/routes', 'server/services', 'server/config', 'server/middleware', 'client'];
    const infractores = dirs.flatMap((d) => archivos(d)).filter((f) => enLaDireccion.test(leer(f)));
    expect(infractores).toEqual([]);
  });

  it('el buscador de administración no arma /admin/users?search=<correo>', () => {
    const buscador = leer('client/pages/admin/AdminSearch.tsx');
    expect(buscador).not.toMatch(/search=\$\{[^}]*email/);
  });

  it('comprobar si un correo está libre es un POST con el correo en el cuerpo', () => {
    const login = leer('client/pages/LoginScreen.tsx');
    expect(login).not.toMatch(/check-availability\?/);
    expect(login).toMatch(/check-availability[\s\S]{0,120}method:\s*['"]POST['"]/);
    expect(leer('server/routes/auth.ts')).toMatch(/router\.post\(\s*["']\/check-availability["']/);
  });
});

describe('los registros del servidor no escriben correos ni teléfonos enteros', () => {
  it('ningún console.* interpola un correo, un destinatario o un teléfono sin enmascarar', () => {
    const dirs = ['server/services', 'server/routes', 'server/jobs', 'server/config', 'server/middleware', 'server/utils'];
    const pideEnmascarar = /\$\{[^}]*(\.email\b|\bemail\b|options\.to\b|\bphone\b|\bto\b)[^}]*\}/;
    const comaConDato = /console\.\w+\([^;]*,\s*(\w+\.)*(email|phone|telefono)\s*[,)]/;
    const infractores: string[] = [];
    for (const f of dirs.flatMap((d) => archivos(d))) {
      leer(f)
        .split('\n')
        .forEach((linea, i) => {
          if (!/console\.\w+\(/.test(linea) || /enmascar/.test(linea)) return;
          if (pideEnmascarar.test(linea) || comaConDato.test(linea)) infractores.push(`${f}:${i + 1}`);
        });
    }
    expect(infractores).toEqual([]);
  });
});

describe('el registro de nginx del repositorio no escribe la consulta de la dirección', () => {
  const conf = leer('nginx/registro-sin-datos.conf');
  // Solo las líneas que NO son comentarios: lo que nginx de verdad ejecuta.
  const activo = conf.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

  it('el formato de registro usa la ruta sin consulta y el Referer sin consulta', () => {
    const formato = activo.match(/log_format\s+sin_datos([\s\S]*?);/)?.[1] ?? '';
    expect(formato).toContain('$ruta_sin_consulta');
    expect(formato).toContain('$referer_sin_consulta');
  });

  it('el formato no usa nada que traiga la consulta entera', () => {
    const formato = activo.match(/log_format\s+sin_datos([\s\S]*?);/)?.[1] ?? '';
    for (const prohibido of ['$request ', '$request"', '$request_uri', '$args', '$query_string', '$is_args', '$http_referer', '$http_cookie', '$http_authorization']) {
      expect(formato).not.toContain(prohibido);
    }
  });

  it('las dos funciones que limpian cortan en el «?»', () => {
    expect(activo).toMatch(/map\s+\$request_uri\s+\$ruta_sin_consulta[\s\S]*\[\^\?\]\*/);
    expect(activo).toMatch(/map\s+\$http_referer\s+\$referer_sin_consulta[\s\S]*\[\^\?#\]\*/);
  });
});
