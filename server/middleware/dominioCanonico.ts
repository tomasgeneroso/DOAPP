import type { Request, Response, NextFunction } from 'express';

/**
 * Un solo dominio: doapparg.com.
 *
 * `doapparg.site` (y su www) apuntaba a la misma aplicación y respondía 200 con el sitio completo y la API: dos direcciones para lo mismo
 * (cuentas, cookies y enlaces repartidos entre dominios; Google indexando duplicados). Tiene que redirigir a `.com` y nada más.
 *
 * Esto es la segunda defensa: lo normal es que el redireccionamiento lo haga el proveedor (Cloudflare/nginx) antes de llegar acá. Si una
 * petición de un dominio alternativo igual llega a la aplicación:
 *  - GET/HEAD se redirigen (301) a la misma ruta en el dominio principal;
 *  - cualquier otro método se rechaza (421): un POST no se puede «redirigir» sin riesgo de perder o duplicar lo que traía.
 */
export const DOMINIO_PRINCIPAL = 'doapparg.com';

/** Dominios que no deben servir nada: solo redirigir. Se puede ampliar con DOMINIOS_QUE_REDIRIGEN (separados por coma). */
export function dominiosQueRedirigen(extra: string | undefined = process.env.DOMINIOS_QUE_REDIRIGEN): string[] {
  const base = ['doapparg.site', 'www.doapparg.site', 'www.doapparg.com'];
  const adicionales = String(extra || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9.-]+$/.test(d) && d !== DOMINIO_PRINCIPAL);
  return [...new Set([...base, ...adicionales])];
}

/** El host sin puerto y en minúsculas. */
export const hostDe = (valor: unknown): string => String(valor ?? '').split(':')[0].trim().toLowerCase();

/** A dónde va la misma ruta en el dominio principal. La ruta se toma tal cual (ya empieza con «/»): nunca se arma desde el host. */
export function destinoCanonico(rutaYConsulta: string): string {
  const ruta = rutaYConsulta.startsWith('/') && !rutaYConsulta.startsWith('//') ? rutaYConsulta : '/';
  return `https://${DOMINIO_PRINCIPAL}${ruta}`;
}

export function redirigirDominiosAlternativos(lista: string[] = dominiosQueRedirigen()) {
  const alternativos = new Set(lista);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!alternativos.has(hostDe(req.hostname || req.headers.host))) {
      next();
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.redirect(301, destinoCanonico(req.originalUrl || '/'));
      return;
    }
    res.status(421).json({ success: false, message: `Esta dirección no atiende pedidos: usá https://${DOMINIO_PRINCIPAL}` });
  };
}
