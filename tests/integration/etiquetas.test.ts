import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { Op } from 'sequelize';
import { algunaEtiquetaContiene } from '../../server/services/etiquetas.js';

import express, { Express } from 'express';
// Las rutas importan el servidor entero (por los avisos en vivo): acá no hace falta.
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { BlogPost } from '../../server/models/sql/BlogPost.model.js';
import { Post } from '../../server/models/sql/Post.model.js';
import { claveDeEtiqueta, etiquetaBuscada, limpiarEtiquetas, rutaDeEtiqueta } from '../../shared/etiquetas.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

/**
 * Etiquetas (pedido del dueño, 2026-11-27): «sirven para poder buscarlas y encontrar intereses relacionados». Contra la base real.
 */
describe('buscar por etiqueta', () => {
  let app: Express;
  // Una palabra única por corrida, con tilde y «ñ», para no mezclarse con datos de otras pruebas.
  const marca = Array.from({ length: 6 }, () => 'bcdfghjklm'[Math.floor(Math.random() * 10)]).join('');
  const principal = `Plomería${marca}`;
  const buscar = async (e: string) => (await request(app).get(`/api/search/etiqueta/${encodeURIComponent(e)}`)).body.data;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/search', (await import('../../server/routes/search.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    const autor: any = await crearUsuario();
    await crearTrabajo(autor.id, { status: 'open', title: `Abierto ${marca}`, tags: [principal, `Baño${marca}`] });
    await crearTrabajo(autor.id, { status: 'draft', title: `Borrador ${marca}`, tags: [principal] });
    const post = (over: Record<string, unknown>) => Post.create({ author: autor.id, title: `Post ${marca}`, description: 'x', gallery: [], type: 'post', currency: 'ARS', tags: [`#plomeria${marca}`, `baño${marca}`, `Urgente${marca}`], taggedUsers: [], ...over } as any);
    await post({});
    await post({ title: `Oculto ${marca}`, isPublished: false });
    await BlogPost.create({ title: `Nota ${marca}`, subtitle: 's', slug: `nota-${marca}`, content: 'contenido de la nota', excerpt: 'e', category: 'Tips', tags: [`PLOMERIA${marca.toUpperCase()}`], status: 'published', createdBy: autor.id, author: 'DOAPP' } as any);
  });

  it('«#Plomería», «plomeria» y «PLOMERIA» son la misma etiqueta', () => {
    expect(new Set(['#Plomería', ' plomeria ', 'PLOMERIA', '##plomería'].map(claveDeEtiqueta))).toEqual(new Set(['plomeria']));
    expect(etiquetaBuscada('#Plomería')).toBe('plomeria');
    for (const no of ['plomería', '#', '#a', '', 'caño #roto']) expect(etiquetaBuscada(no)).toBeNull();
    expect(rutaDeEtiqueta('#Obra nueva')).toBe('/etiquetas/obra%20nueva');
    expect(limpiarEtiquetas(['#Pintura', 'pintura', '  ', '##Obra', 5, null])).toEqual(['Pintura', 'Obra', '5']);
    expect(limpiarEtiquetas('no es una lista')).toEqual([]);
  });

  it('junta trabajos abiertos, publicaciones y artículos del blog, sin borradores ni publicaciones ocultas', async () => {
    const r = await buscar(`#plomería${marca}`);
    expect(r.trabajos.map((t: any) => t.titulo)).toEqual([`Abierto ${marca}`]);
    expect(r.publicaciones.map((p: any) => p.titulo)).toEqual([`Post ${marca}`]);
    expect(r.articulos.map((a: any) => a.titulo)).toEqual([`Nota ${marca}`]);
  });

  it('las relacionadas son las que aparecen junto a ella, de la más a la menos frecuente y sin repetirse por tildes o mayúsculas', async () => {
    const r = await buscar(`plomeria${marca}`);
    expect(r.relacionadas.map((x: any) => [claveDeEtiqueta(x.etiqueta), x.cantidad])).toEqual([[`bano${marca}`, 2], [`urgente${marca}`, 1]]);
  });

  it('un texto raro no rompe la consulta ni trae todo', async () => {
    for (const raro of ["a' OR '1'='1", '%', '__', "x'); DROP TABLE posts; --", 'a']) {
      const r = await buscar(raro);
      expect([r.trabajos.length, r.publicaciones.length, r.articulos.length]).toEqual([0, 0, 0]);
    }
  });

  it('la búsqueda normal de trabajos y del blog también encuentra por etiqueta', async () => {
    const trabajos = await request(app).get(`/api/jobs?status=open&search=${encodeURIComponent(`#bano${marca}`)}`);
    expect(trabajos.body.jobs.map((j: any) => j.title)).toEqual([`Abierto ${marca}`]);
    // La ruta del blog no se carga en este modo de Jest: se prueba la misma condición que usa.
    const notas: any[] = await BlogPost.findAll({ where: { [Op.or]: [algunaEtiquetaContiene('BlogPost', `plomeria${marca}`)] } as any });
    expect(notas.map((n) => n.title)).toEqual([`Nota ${marca}`]);
    expect(readFileSync('server/routes/blogs.ts', 'utf8').split('algunaEtiquetaContiene(').length - 1).toBe(2);
  });
});
