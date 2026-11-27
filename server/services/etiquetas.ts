import { Op, literal } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Job } from '../models/sql/Job.model.js';
import { Post } from '../models/sql/Post.model.js';
import { BlogPost } from '../models/sql/BlogPost.model.js';
import { claveDeEtiqueta } from '../../shared/etiquetas.js';

/** La misma comparación que `claveDeEtiqueta`, en la base: sin «#», sin tildes y sin mayúsculas. */
const CLAVE_EN_SQL = `lower(translate(btrim(x, '# '), 'ÁÉÍÓÚÜÑÀÈÌÒÙáéíóúüñàèìòù', 'AEIOUUNAEIOUaeiouunaeiou'))`;

/** Condición «tiene esta etiqueta». `alias` es el nombre del modelo en la consulta (siempre uno de los tres de abajo, nunca texto de afuera). */
const tieneLaEtiqueta = (alias: 'Job' | 'Post' | 'BlogPost', clave: string) =>
  literal(`EXISTS (SELECT 1 FROM unnest("${alias}"."tags") AS x WHERE ${CLAVE_EN_SQL} = ${sequelize.escape(clave)})`);

/** Para la búsqueda por texto: alguna etiqueta contiene lo escrito. */
export function algunaEtiquetaContiene(alias: 'Job' | 'Post' | 'BlogPost', texto: string) {
  const clave = claveDeEtiqueta(texto).replace(/[\\%_]/g, (c) => `\\${c}`);
  return literal(`EXISTS (SELECT 1 FROM unnest("${alias}"."tags") AS x WHERE ${CLAVE_EN_SQL} LIKE ${sequelize.escape(`%${clave}%`)})`);
}

const POR_SECCION = 20;
const RELACIONADAS = 12;

export interface ResultadoDeEtiqueta {
  etiqueta: string;
  trabajos: Array<{ id: string; titulo: string; precio: number; ubicacion: string | null; etiquetas: string[] }>;
  publicaciones: Array<{ id: string; titulo: string; tipo: string; imagen: string | null; autor: { id: string; name: string } | null; etiquetas: string[] }>;
  articulos: Array<{ id: string; titulo: string; slug: string; imagen: string | null; etiquetas: string[] }>;
  /** Otras etiquetas que aparecen junto a esta, de la más a la menos frecuente. */
  relacionadas: Array<{ etiqueta: string; cantidad: number }>;
}

/** Todo lo PÚBLICO que lleva una etiqueta: trabajos abiertos, publicaciones publicadas y artículos del blog publicados. */
export async function buscarPorEtiqueta(etiqueta: string): Promise<ResultadoDeEtiqueta> {
  const clave = claveDeEtiqueta(etiqueta);
  const vacio: ResultadoDeEtiqueta = { etiqueta: clave, trabajos: [], publicaciones: [], articulos: [], relacionadas: [] };
  if (clave.length < 2) return vacio;

  const [trabajos, publicaciones, articulos] = await Promise.all([
    Job.findAll({ where: { [Op.and]: [{ status: 'open' }, tieneLaEtiqueta('Job', clave)] } as any, attributes: ['id', 'title', 'price', 'location', 'tags'], order: [['createdAt', 'DESC']], limit: POR_SECCION }),
    Post.findAll({
      where: { [Op.and]: [{ isPublished: true }, tieneLaEtiqueta('Post', clave)] } as any,
      attributes: ['id', 'title', 'type', 'gallery', 'tags', 'createdAt'], include: [{ association: 'authorUser', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']], limit: POR_SECCION,
    }),
    BlogPost.findAll({ where: { [Op.and]: [{ status: 'published' }, tieneLaEtiqueta('BlogPost', clave)] } as any, attributes: ['id', 'title', 'slug', 'coverImage', 'tags', 'createdAt'], order: [['createdAt', 'DESC']], limit: POR_SECCION }),
  ]);

  const cuenta = new Map<string, { etiqueta: string; cantidad: number }>();
  for (const fila of [...trabajos, ...publicaciones, ...articulos] as Array<{ tags?: string[] }>) {
    for (const [k, texto] of new Map((fila.tags || []).map((t) => [claveDeEtiqueta(t), t]))) {
      if (!k || k === clave) continue;
      const previa = cuenta.get(k);
      cuenta.set(k, { etiqueta: previa?.etiqueta || String(texto).replace(/^#+/, ''), cantidad: (previa?.cantidad || 0) + 1 });
    }
  }

  return {
    etiqueta: clave,
    trabajos: trabajos.map((t: any) => ({ id: t.id, titulo: t.title, precio: Number(t.price) || 0, ubicacion: t.location || null, etiquetas: t.tags || [] })),
    publicaciones: publicaciones.map((p: any) => ({ id: p.id, titulo: p.title, tipo: p.type, imagen: p.gallery?.find((g: any) => g.type !== 'video')?.url || null, autor: p.authorUser ? { id: p.authorUser.id, name: p.authorUser.name } : null, etiquetas: p.tags || [] })),
    articulos: articulos.map((a: any) => ({ id: a.id, titulo: a.title, slug: a.slug, imagen: a.coverImage || null, etiquetas: a.tags || [] })),
    relacionadas: [...cuenta.values()].sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta)).slice(0, RELACIONADAS),
  };
}
