import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BeforeAfterShare } from '../models/sql/BeforeAfterShare.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { Post } from '../models/sql/Post.model.js';
import { sanitizePlainText } from '../utils/sanitizer.js';
import { FOTOS_POR_LADO } from '../../shared/momentos/momentos.js';

/**
 * «Antes y después» de un trabajo terminado (plan «Momentos DOAPP»). Las fotos de entrega son PRIVADAS hasta que se copian a la carpeta pública para el muro.
 * Al contratar, las dos partes autorizan esa publicación (T&C 6.8, `contracts.photo_consent_at`): cualquiera de las dos publica sin pedir permiso de nuevo.
 * Hace falta que acepte la otra en los contratos sin ese registro (anteriores a la cláusula) y cuando ya se retiró o se rechazó una vez. Cualquiera de las dos
 * lo retira en cualquier momento: se borra la publicación y las copias.
 */

export type Resultado<T = undefined> = { ok: true; dato: T } | { ok: false; status: number; message: string };
const falla = (status: number, message: string) => ({ ok: false as const, status, message });

const carpetaDeSubidas = (): string => path.join(process.cwd(), 'uploads');
const EXTENSIONES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** La ruta propia de una foto («/uploads/carpeta/archivo.ext»), venga relativa o con el dominio; null si no es de una de las carpetas permitidas. */
export function rutaPropia(direccion: unknown, carpeta: 'job-images' | 'delivery' | 'post-media'): string | null {
  if (typeof direccion !== 'string') return null;
  let ruta = direccion;
  if (/^https?:\/\//i.test(ruta)) {
    try { ruta = new URL(ruta).pathname; } catch { return null; }
  }
  const m = ruta.match(new RegExp(`^/uploads/${carpeta}/([A-Za-z0-9._-]+)$`));
  return m && !m[1].includes('..') && EXTENSIONES.has(path.extname(m[1]).toLowerCase()) ? ruta : null;
}

const enDisco = (ruta: string): string => path.join(carpetaDeSubidas(), ruta.replace(/^\/uploads\//, ''));

async function contratoDeUnaParte(contractId: string, userId: string): Promise<{ contrato: any; trabajo: any; otra: string } | null> {
  const contrato: any = await Contract.findByPk(contractId);
  if (!contrato) return null;
  const cliente = String(contrato.clientId);
  const doer = String(contrato.doerId);
  if (userId !== cliente && userId !== doer) return null;
  const trabajo: any = await Job.findByPk(contrato.jobId, { attributes: ['id', 'title', 'images'] });
  return { contrato, trabajo, otra: userId === cliente ? doer : cliente };
}

/**
 * Se publica sin pedir permiso cuando las dos lo autorizaron al contratar y nadie dijo después que no: haberlo retirado (o rechazado) vale más que la
 * autorización general, y desde ahí hace falta que la otra parte acepte.
 */
const seAutorizoAlContratar = (contrato: any, pedido: unknown): boolean => !!contrato.photoConsentAt && !pedido;

const disponibles = (contrato: any, trabajo: any) => ({
  antes: ((trabajo?.images || []) as unknown[]).map((u) => rutaPropia(u, 'job-images')).filter((u): u is string => !!u),
  despues: ((contrato.deliveryPhotos || []) as Array<{ url?: string }>).map((f) => rutaPropia(f?.url, 'delivery')).filter((u): u is string => !!u),
});

async function avisar(recipientId: string, title: string, message: string, contractId: string): Promise<void> {
  try {
    await Notification.create({
      recipientId, type: 'info', category: 'contract', title, message, relatedModel: 'Contract', relatedId: contractId,
      actionUrl: `/contracts/${contractId}`, sentVia: ['in_app'], data: { contractId },
    } as any);
  } catch (e: any) {
    console.error('Antes y después, aviso:', e?.message);
  }
}

export async function estadoDeAntesYDespues(contractId: string, userId: string): Promise<Resultado<any>> {
  const c = await contratoDeUnaParte(contractId, userId);
  if (!c) return falla(404, 'No encontramos ese contrato.');
  const fotos = disponibles(c.contrato, c.trabajo);
  const pedido = await BeforeAfterShare.findOne({ where: { contractId } });
  // Si quien lo publicó borró la publicación desde el muro, para esta pantalla quedó retirado.
  let estado = pedido?.status ?? null;
  if (pedido && estado === 'published' && !(pedido.postId && (await Post.findByPk(pedido.postId, { attributes: ['id'] })))) estado = 'withdrawn';
  return {
    ok: true,
    dato: {
      terminado: c.contrato.status === 'completed',
      fotos,
      puedeProponer: c.contrato.status === 'completed' && fotos.despues.length > 0 && (estado === null || estado === 'rejected' || estado === 'withdrawn'),
      sePublicaDirecto: seAutorizoAlContratar(c.contrato, pedido),
      pedido: pedido ? { id: pedido.id, estado, loPropusisteVos: String(pedido.proposedBy) === userId, fotos: pedido.photos, texto: pedido.caption || '', publicacionId: estado === 'published' ? pedido.postId : null } : null,
    },
  };
}

export async function proponer(contractId: string, userId: string, entrada: { antes?: unknown; despues?: unknown; texto?: unknown }): Promise<Resultado<{ id: string; publicacionId: string | null }>> {
  const c = await contratoDeUnaParte(contractId, userId);
  if (!c) return falla(404, 'No encontramos ese contrato.');
  if (c.contrato.status !== 'completed') return falla(409, 'El antes y después se publica cuando el trabajo está terminado.');
  const fotos = disponibles(c.contrato, c.trabajo);
  const elegidas = (v: unknown, de: string[]): string[] | null => {
    const lista = Array.isArray(v) ? [...new Set(v.map(String))] : [];
    return lista.length <= FOTOS_POR_LADO && lista.every((f) => de.includes(f)) ? lista : null;
  };
  const antes = elegidas(entrada.antes, fotos.antes);
  const despues = elegidas(entrada.despues, fotos.despues);
  if (!antes || !despues) return falla(400, `Elegí hasta ${FOTOS_POR_LADO} fotos de cada lado, entre las de este trabajo.`);
  if (despues.length === 0) return falla(400, 'Elegí al menos una foto de cómo quedó.');
  const texto = sanitizePlainText(String(entrada.texto || '')).slice(0, 300);

  const previo = await BeforeAfterShare.findOne({ where: { contractId } });
  const directo = seAutorizoAlContratar(c.contrato, previo);
  const datos = { proposedBy: userId, status: 'pending' as const, photos: { antes, despues }, caption: texto, answeredBy: null, answeredAt: null, postId: null };
  let id: string;
  if (previo) {
    // Solo se reutiliza si no está esperando respuesta ni publicado (o si la publicación ya no existe). El cambio es condicional: dos toques no proponen dos veces.
    const sigueEnElMuro = previo.status === 'published' && !!(previo.postId && (await Post.findByPk(previo.postId, { attributes: ['id'] })));
    if (previo.status === 'pending' || sigueEnElMuro) return falla(409, 'Ya hay un antes y después de este trabajo.');
    const [cambiados] = await BeforeAfterShare.update(datos as any, { where: { id: previo.id, status: previo.status } });
    if (cambiados === 0) return falla(409, 'Ya hay un antes y después de este trabajo.');
    id = previo.id;
  } else {
    try {
      id = (await BeforeAfterShare.create({ contractId, ...datos } as any)).id;
    } catch (e: any) {
      if (e?.name === 'SequelizeUniqueConstraintError') return falla(409, 'Ya hay un antes y después de este trabajo.');
      throw e;
    }
  }
  if (directo) {
    // La fila nueva (única por contrato) es la que evita publicar dos veces: dos toques a la vez crean una sola.
    await BeforeAfterShare.update({ status: 'published', answeredAt: new Date() } as any, { where: { id, status: 'pending' } });
    const pedido = (await BeforeAfterShare.findByPk(id))!;
    const publicacionId = await publicar(pedido, c.trabajo);
    if (!publicacionId) {
      await pedido.destroy();
      return falla(500, NO_SE_PUDO_PUBLICAR);
    }
    await avisar(c.otra, 'Se publicó el antes y después', `Las fotos de «${c.trabajo?.title || 'el trabajo'}» ya están en el muro, como se autorizó al contratar. Podés retirarlo desde el contrato.`, contractId);
    return { ok: true, dato: { id, publicacionId } };
  }
  await avisar(c.otra, 'Te piden permiso para publicar un antes y después', `Quieren mostrar cómo quedó «${c.trabajo?.title || 'el trabajo'}». Se publica solo si lo aceptás.`, contractId);
  return { ok: true, dato: { id, publicacionId: null } };
}

const NO_SE_PUDO_PUBLICAR = 'No pudimos publicar las fotos. Probá de nuevo en un rato.';

/** Copia las fotos elegidas a la carpeta pública y crea la publicación. Si algo falla no quedan copias sueltas y devuelve null. */
async function publicar(pedido: BeforeAfterShare, trabajo: any): Promise<string | null> {
  const copias: string[] = [];
  try {
    const galeria: Array<{ url: string; type: string; caption: string }> = [];
    for (const [lado, carpeta, rotulo] of [['antes', 'job-images', 'Antes'], ['despues', 'delivery', 'Después']] as const) {
      for (const origen of pedido.photos[lado] || []) {
        const ruta = rutaPropia(origen, carpeta);
        if (!ruta) throw new Error('FOTO_INVALIDA');
        const nombre = `antes-despues-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(ruta).toLowerCase()}`;
        const destino = path.join(carpetaDeSubidas(), 'post-media', nombre);
        await fs.mkdir(path.dirname(destino), { recursive: true });
        await fs.copyFile(enDisco(ruta), destino);
        copias.push(destino);
        galeria.push({ url: `/uploads/post-media/${nombre}`, type: 'image', caption: rotulo });
      }
    }
    const post = await Post.create({
      author: String(pedido.proposedBy), title: sanitizePlainText(`Antes y después: ${trabajo?.title || 'trabajo terminado'}`).slice(0, 100),
      description: pedido.caption || '', gallery: galeria, type: 'post', currency: 'ARS', tags: [], linkedContract: pedido.contractId, taggedUsers: [],
    } as any);
    await BeforeAfterShare.update({ postId: post.id } as any, { where: { id: pedido.id } });
    return post.id;
  } catch (e: any) {
    await Promise.all(copias.map((f) => fs.unlink(f).catch(() => undefined)));
    console.error('Antes y después, publicar:', e?.message);
    return null;
  }
}

/** Quien NO propuso responde. Al aceptar se copian las fotos a la carpeta pública y se crea la publicación. */
export async function responder(id: string, userId: string, acepta: boolean): Promise<Resultado<{ publicacionId: string | null }>> {
  const pedido = await BeforeAfterShare.findByPk(id);
  const c = pedido ? await contratoDeUnaParte(pedido.contractId, userId) : null;
  if (!pedido || !c) return falla(404, 'No encontramos ese pedido.');
  if (String(pedido.proposedBy) === userId) return falla(403, 'Lo tiene que responder la otra persona.');

  // Se toma el pedido de una sola vez: dos respuestas a la vez no publican dos veces.
  const [tomados] = await BeforeAfterShare.update(
    { status: acepta ? 'published' : 'rejected', answeredBy: userId, answeredAt: new Date() } as any,
    { where: { id, status: 'pending' } },
  );
  if (tomados === 0) return falla(409, 'Ese pedido ya fue respondido o retirado.');
  if (!acepta) {
    await avisar(String(pedido.proposedBy), 'El antes y después queda sin publicar', `La otra persona prefirió que «${c.trabajo?.title || 'el trabajo'}» quede entre ustedes.`, pedido.contractId);
    return { ok: true, dato: { publicacionId: null } };
  }

  const publicacionId = await publicar(pedido, c.trabajo);
  if (!publicacionId) {
    // Si algo falla se deshace todo: el pedido vuelve a esperar respuesta.
    await BeforeAfterShare.update({ status: 'pending', answeredBy: null, answeredAt: null } as any, { where: { id } });
    return falla(500, NO_SE_PUDO_PUBLICAR);
  }
  await avisar(String(pedido.proposedBy), 'Se publicó el antes y después', `La otra persona aceptó: «${c.trabajo?.title || 'el trabajo'}» ya está en el muro.`, pedido.contractId);
  return { ok: true, dato: { publicacionId } };
}

/** Cualquiera de las dos partes retira el pedido o la publicación, en cualquier momento. */
export async function retirar(id: string, userId: string): Promise<Resultado> {
  const pedido = await BeforeAfterShare.findByPk(id);
  const c = pedido ? await contratoDeUnaParte(pedido.contractId, userId) : null;
  if (!pedido || !c) return falla(404, 'No encontramos ese pedido.');
  if (pedido.status !== 'pending' && pedido.status !== 'published') return falla(409, 'No hay nada para retirar.');
  const [tomados] = await BeforeAfterShare.update({ status: 'withdrawn', answeredBy: userId, answeredAt: new Date() } as any, { where: { id, status: pedido.status } });
  if (tomados === 0) return falla(409, 'No hay nada para retirar.');
  if (pedido.postId) {
    const post: any = await Post.findByPk(pedido.postId);
    if (post) {
      for (const f of (post.gallery || []) as Array<{ url?: string }>) {
        const ruta = rutaPropia(f?.url, 'post-media');
        if (ruta && path.basename(ruta).startsWith('antes-despues-')) await fs.unlink(enDisco(ruta)).catch(() => undefined);
      }
      await post.destroy();
    }
    await BeforeAfterShare.update({ postId: null } as any, { where: { id } });
  }
  await avisar(c.otra, 'Se retiró el antes y después', `Las fotos de «${c.trabajo?.title || 'el trabajo'}» ya no se publican.`, pedido.contractId);
  return { ok: true, dato: undefined };
}
