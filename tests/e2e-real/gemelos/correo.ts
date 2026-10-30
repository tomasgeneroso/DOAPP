import { createServer, type Server as ServidorHttp } from 'node:http';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

/**
 * El gemelo del CORREO. El servidor de DOAPP manda sus correos por SMTP; acá hay un servidor SMTP que los recibe y los guarda en memoria,
 * y una API HTTP para leerlos. Una prueba lee el correo igual que lo haría una persona: busca el último que le llegó, lo abre y toca el enlace.
 *
 *   GET    /correos?para=<correo>&asunto=<texto>   los correos que llegaron (más nuevos primero)
 *   DELETE /correos                                 vacía la bandeja
 */
export interface CorreoRecibido {
  id: number;
  recibidoEl: string;
  para: string[];
  de: string;
  asunto: string;
  texto: string;
  html: string;
  /** Todos los enlaces del correo (de los `href` del HTML y de las direcciones sueltas del texto). */
  enlaces: string[];
}

export interface GemeloDelCorreo {
  detener: () => Promise<void>;
  bandeja: CorreoRecibido[];
}

const ENLACE = /https?:\/\/[^\s"'<>)\]]+/g;

export async function levantarGemeloDelCorreo(puertoSmtp: number, puertoApi: number): Promise<GemeloDelCorreo> {
  const bandeja: CorreoRecibido[] = [];
  let siguiente = 1;

  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    onAuth: (_auth, _sesion, cb) => cb(null, { user: 'e2e' }),
    onData(flujo, _sesion, cb) {
      simpleParser(flujo)
        .then((m) => {
          const texto = m.text || '';
          const html = typeof m.html === 'string' ? m.html : '';
          const enlaces = new Set<string>();
          for (const [, href] of html.matchAll(/href=["']([^"']+)["']/gi)) enlaces.add(href.replace(/&amp;/g, '&'));
          for (const e of texto.match(ENLACE) || []) enlaces.add(e);
          const para = (Array.isArray(m.to) ? m.to : m.to ? [m.to] : []).flatMap((t) => t.value.map((v) => (v.address || '').toLowerCase()));
          bandeja.unshift({
            id: siguiente++,
            recibidoEl: new Date().toISOString(),
            para,
            de: m.from?.text || '',
            asunto: m.subject || '',
            texto,
            html,
            enlaces: [...enlaces],
          });
          cb();
        })
        .catch((e) => cb(e));
    },
  });
  await new Promise<void>((ok, mal) => {
    smtp.once('error', mal);
    smtp.listen(puertoSmtp, '127.0.0.1', () => ok());
  });

  const api: ServidorHttp = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/correos' && req.method === 'DELETE') {
      bandeja.length = 0;
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === '/correos' && req.method === 'GET') {
      const para = (url.searchParams.get('para') || '').toLowerCase();
      const asunto = (url.searchParams.get('asunto') || '').toLowerCase();
      const lista = bandeja.filter((c) => (!para || c.para.includes(para)) && (!asunto || c.asunto.toLowerCase().includes(asunto)));
      res.end(JSON.stringify(lista));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((ok) => api.listen(puertoApi, '127.0.0.1', () => ok()));

  return {
    bandeja,
    detener: () =>
      new Promise<void>((ok) => {
        api.close(() => smtp.close(() => ok()));
      }),
  };
}
