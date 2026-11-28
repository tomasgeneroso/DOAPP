import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { avisoPorLaRespuesta, ACCION_SIN_HACERSE, CARGA_FALLIDA, SIN_CONEXION } from '../shared/errores/redDeErrores';

/**
 * Guardas de los pedidos del dueño del 2026-11-27: que ninguna falla pase en silencio, que no haya acciones escondidas (como el botón para terminar el trabajo), que
 * lo que se manda por correo también aparezca como notificación y que el precio se cambie por una sola puerta.
 */
const raiz = process.cwd();
const leer = (r: string) => fs.readFileSync(path.join(raiz, r), 'utf8').replace(/\r\n/g, '\n');
const listar = (d: string, ext: RegExp): string[] =>
  fs.readdirSync(path.join(raiz, d), { withFileTypes: true }).flatMap((e) => {
    const r = `${d}/${e.name}`;
    if (e.isDirectory()) return ['node_modules', '__tests__', 'scripts'].includes(e.name) ? [] : listar(r, ext);
    return ext.test(e.name) ? [r] : [];
  });
const arbol = (r: string) => ts.createSourceFile(r, leer(r), ts.ScriptTarget.Latest, true, r.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

describe('ante una falla, siempre hay algo que mostrar', () => {
  const r = (metodo: string, status?: number, cuerpo?: any, url = '/api/jobs/1') => avisoPorLaRespuesta({ metodo, url, status, cuerpo });

  it('una acción rechazada dice lo que contestó el servidor, o un texto claro', () => {
    expect(r('POST', 409, { message: 'Ya te postulaste' })).toBe('Ya te postulaste');
    expect(r('PUT', 500, null)).toBe(ACCION_SIN_HACERSE);
    expect(r('DELETE', 403, { message: '  ' })).toBe(ACCION_SIN_HACERSE);
    expect(r('POST')).toBe(SIN_CONEXION);
  });

  it('una lectura avisa si el servidor falló o no hubo conexión, y no por un «no está»', () => {
    expect(r('GET', 500)).toBe(CARGA_FALLIDA);
    expect(r('GET')).toBe(CARGA_FALLIDA);
    for (const s of [401, 403, 404]) expect(r('GET', s)).toBeNull();
  });

  it('lo que abre su propio paso o es de fondo no se anuncia', () => {
    expect(r('POST', 200)).toBeNull();
    expect(r('POST', 401)).toBeNull();
    expect(r('PATCH', 402, { requiresPayment: true, message: 'Pagá la diferencia' })).toBeNull();
    expect(r('PATCH', 409, { code: 'CONFIRMAR_EFECTOS', message: 'x' })).toBeNull();
    expect(r('POST', 500, null, '/api/actividad/latido')).toBeNull();
    expect(r('POST', 500, null, '/api/salud/falla')).toBeNull();
  });

  it('la web y la app instalan la red, y el cliente de la app anota cada respuesta fallida', () => {
    expect(leer('client/main.tsx')).toContain('instalarRedDeErrores();');
    expect(leer('client/App.tsx')).toContain('<RedDeErrores />');
    expect(leer('mobile/app/_layout.tsx')).toContain('instalarRedDeErrores();');
    expect(leer('mobile/app/_layout.tsx')).toContain('<AvisoDeError />');
    expect((leer('mobile/services/api.ts').match(/anotarRespuestaFallida\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('ninguna pantalla manda mensajes solo por la conexión en vivo (si está cortada, se pierden sin aviso)', () => {
    for (const f of [...listar('client', /\.tsx?$/), ...listar('mobile/services', /\.tsx?$/), ...listar('mobile/app', /\.tsx?$/)]) {
      expect([f, /emit\(\s*["']message:send["']/.test(leer(f))]).toEqual([f, false]);
    }
  });
});

describe('no hay acciones escondidas', () => {
  it('ningún bloque que se esconde con una condición tiene adentro botones (así se perdió «Completé el trabajo»)', () => {
    // La única permitida: «Volver», que dentro de la vista del trabajo no tiene a dónde volver.
    const PERMITIDAS = ['() => navigate(-1)'];
    const hallazgos: string[] = [];
    for (const f of listar('client', /\.tsx$/)) {
      const sf = arbol(f);
      const visitar = (n: ts.Node) => {
        if (ts.isJsxElement(n)) {
          const attr = n.openingElement.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'className') as ts.JsxAttribute | undefined;
          const texto = attr?.initializer?.getText(sf) ?? '';
          const condicional = !!attr?.initializer && !ts.isStringLiteral(attr.initializer) && /\?\s*['"`]hidden['"`]/.test(texto);
          if (condicional && !/\b(sm|md|lg|xl):(block|flex|inline|grid)\b/.test(texto)) {
            const acciones = [...n.getText(sf).matchAll(/onClick=\{([^}]{0,80})/g)].map((m) => m[1].trim()).filter((a) => !PERMITIDAS.includes(a));
            if (acciones.length) hallazgos.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${acciones[0]}`);
          }
        }
        ts.forEachChild(n, visitar);
      };
      visitar(sf);
    }
    expect(hallazgos).toEqual([]);
  });
});

describe('el menú de quien publicó no se pierde', () => {
  it('«Acciones» (presupuesto, pausar, cancelar, soporte) no depende de que queden lugares ni de que no haya nadie elegido', () => {
    // Estaba dentro del bloque de postulantes: al completarse los lugares desaparecía entero (encontrado el 2026-11-28).
    const sf = arbol('client/pages/JobDetail.tsx');
    const condiciones: string[] = [];
    let encontrados = 0;
    const visitar = (n: ts.Node) => {
      if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === 'JobActionsMenu') {
        encontrados++;
        for (let p: ts.Node = n; p.parent; p = p.parent) {
          const padre = p.parent;
          if (ts.isBinaryExpression(padre) && padre.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && padre.right === p) condiciones.push(padre.left.getText(sf));
          if (ts.isConditionalExpression(padre) && padre.condition !== p) condiciones.push(padre.condition.getText(sf));
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
    expect(encontrados).toBe(1);
    expect(condiciones.filter((c) => /selectedWorkers|maxWorkers|doerId|job\.doer\b/.test(c))).toEqual([]);
  });
});

describe('lo que se manda por correo también aparece en DOAPP', () => {
  // Códigos y enlaces de seguridad (no van a una campana), correos al equipo, pruebas de envío y respuestas que no son correos.
  const SIN_NOTIFICACION_A_PROPOSITO =
    /^(sendVerificationEmail|sendVerificationEmailToUser|sendPasswordResetEmail|sendPasswordCodeEmail|sendCsv|sendMarkdown|sendWhatsAppCode|sendAccountDeletedEmail|sendApprovalReminders|sendReminders|sendAnomalyAlert|correoAlEquipo)$/;
  // `sendApprovalReminders`, `sendReminders` y `sendAnomalyAlert` son funciones propias que crean la notificación adentro. La prueba de envío de una campaña se la manda
  // a sí misma la persona que la pide.
  const ES_UNA_PRUEBA_DE_ENVIO = /prueba: true/;
  const NOTIFICA = /Notification(Model)?\.(create|bulkCreate)\(|createNotification\(|notificationService\.|\bavisar\w*\(|notificar\w*\(/;
  // Archivo → por qué sus `sendEmail` directos no llevan notificación al lado.
  const ARCHIVOS_APARTE: Record<string, string> = {
    'server/services/email.ts': 'el servicio de correo',
    'server/services/avisoAlDueno.ts': 'aviso al dueño sobre fallas',
    'server/services/fcm.ts': 'notificaciones al celular, no correos',
    'server/routes/claveDePanel.ts': 'código de recuperación',
    'server/routes/contact.ts': 'va al equipo; quien escribe puede no tener cuenta',
    'server/routes/admin/platform.ts': 'enlace de recuperación de contraseña',
    'server/routes/admin/roles.ts': 'código de recuperación de contraseña',
  };

  it('cada envío a una persona crea su notificación en el mismo tramo', () => {
    const faltan: string[] = [];
    for (const f of listar('server', /\.ts$/)) {
      if (ARCHIVOS_APARTE[f]) continue;
      const sf = arbol(f);
      const visitar = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          const nombre = n.expression.getText(sf);
          const m = /(?:^|\.)(send[A-Z]\w*|sendEmail|sendToUser)$/.exec(nombre);
          if (m && !/socket|fcm|sgMail|push|^res\.|transporter|\.sendMail|mailgun|sendMessage|sendFile|sendStatus/i.test(nombre) && !SIN_NOTIFICACION_A_PROPOSITO.test(m[1])) {
            let p: ts.Node | undefined = n.parent;
            let tramo: ts.Node | undefined;
            while (p) {
              if (ts.isFunctionLike(p)) {
                tramo = p;
                if (ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) || (p.parent && ts.isCallExpression(p.parent) && /router\.|cron\./.test(p.parent.expression.getText(sf)))) break;
              }
              p = p.parent;
            }
            const cuerpo = tramo ? tramo.getText(sf) : sf.getText();
            if (!NOTIFICA.test(cuerpo) && !ES_UNA_PRUEBA_DE_ENVIO.test(cuerpo)) faltan.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${m[1]}`);
          }
        }
        ts.forEachChild(n, visitar);
      };
      visitar(sf);
    }
    expect(faltan).toEqual([]);
  });
});

describe('el precio se cambia por una sola puerta', () => {
  it('ninguna ruta escribe el precio de un trabajo o de un contrato por su cuenta', () => {
    // Lo que queda: la corrección de un contrato por administración y la ampliación de un contrato que se paga aparte.
    const PERMITIDAS = ['server/routes/admin/contracts.ts', 'server/routes/admin/payments.ts'];
    const escriben: string[] = [];
    for (const f of listar('server/routes', /\.ts$/)) {
      if (PERMITIDAS.includes(f)) continue;
      if (/\b(contract|contrato|job|trabajo|jobToUpdate)\.price\s*=(?!=)/.test(leer(f))) escriben.push(f);
    }
    expect(escriben).toEqual([]);
  });
});
