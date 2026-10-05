import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import sharp from 'sharp';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import imageService from '../server/services/imageOptimization.js';

/**
 * El procesamiento de imágenes que suben los usuarios.
 *
 * Por qué existe: este servicio no tenía una sola prueba, y es el que pasa por
 * sharp —y por libvips y libheif debajo— todo lo que sube un usuario. Esas son
 * justo las librerías con vulnerabilidades publicadas, y arreglarlas implica
 * subir de versión. Subir de versión una librería nativa sin una prueba que
 * diga "sigue procesando una foto" es confiar en que compile.
 *
 * Las imágenes se generan con la propia librería, así que no hay binarios en
 * el repositorio.
 */

let dir: string;
const ruta = (nombre: string) => join(dir, nombre);

async function crearImagen(
  nombre: string,
  ancho: number,
  alto: number,
  formato: 'jpeg' | 'png' | 'webp' | 'gif',
): Promise<string> {
  const destino = ruta(nombre);
  await sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .toFormat(formato)
    .toFile(destino);
  return destino;
}

beforeAll(() => {
  // libvips cachea los archivos que abre y en Windows eso los deja bloqueados:
  // sin esto el borrado de la carpeta temporal falla con EBUSY aunque todas las
  // pruebas hayan pasado.
  sharp.cache(false);
  dir = mkdtempSync(join(tmpdir(), 'doapp-img-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('optimizeImage', () => {
  it('achica una foto grande dentro del máximo y la deja como JPEG', async () => {
    const origen = await crearImagen('grande.jpg', 3000, 2000, 'jpeg');
    const destino = ruta('grande-opt.jpg');

    const r = await imageService.optimizeImage(origen, destino);
    const meta = await sharp(destino).metadata();

    expect(r.width).toBeLessThanOrEqual(1920);
    expect(r.height).toBeLessThanOrEqual(1080);
    expect(r.size).toBeGreaterThan(0);
    // Esta rama es la que se tocó al subir de versión (la comparación con
    // "jpg" nunca se cumplía: libvips informa "jpeg").
    expect(meta.format).toBe('jpeg');
  });

  it('no agranda una imagen que ya es chica', async () => {
    const origen = await crearImagen('chica.jpg', 400, 300, 'jpeg');
    const r = await imageService.optimizeImage(origen, ruta('chica-opt.jpg'));
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
  });

  it('conserva PNG y WebP en su formato', async () => {
    const png = await crearImagen('a.png', 800, 600, 'png');
    const webp = await crearImagen('a.webp', 800, 600, 'webp');

    await imageService.optimizeImage(png, ruta('a-opt.png'));
    await imageService.optimizeImage(webp, ruta('a-opt.webp'));

    expect((await sharp(ruta('a-opt.png')).metadata()).format).toBe('png');
    expect((await sharp(ruta('a-opt.webp')).metadata()).format).toBe('webp');
  });

  it('rechaza bytes que no son una imagen, sin tirar el proceso', async () => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
    const basura = ruta('basura.jpg');
    writeFileSync(basura, Buffer.from('esto no es una imagen, es texto con extensión de foto'));

    await expect(imageService.optimizeImage(basura, ruta('basura-opt.jpg'))).rejects.toThrow(
      'Failed to optimize image',
    );
    espia.mockRestore();
  });
});

describe('createThumbnail, convertToWebP y processAvatar', () => {
  it('createThumbnail devuelve un cuadrado del tamaño configurado', async () => {
    const origen = await crearImagen('t.jpg', 1200, 800, 'jpeg');
    await imageService.createThumbnail(origen, ruta('t-thumb.jpg'));
    const meta = await sharp(ruta('t-thumb.jpg')).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(300);
  });

  it('convertToWebP produce un WebP', async () => {
    const origen = await crearImagen('w.png', 600, 400, 'png');
    const r = await imageService.convertToWebP(origen, ruta('w-out.webp'));
    expect(r.size).toBeGreaterThan(0);
    expect((await sharp(ruta('w-out.webp')).metadata()).format).toBe('webp');
  });

  it('processAvatar recorta a 400x400', async () => {
    const origen = await crearImagen('av.jpg', 1000, 600, 'jpeg');
    await imageService.processAvatar(origen, ruta('av-out.jpg'));
    const meta = await sharp(ruta('av-out.jpg')).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });
});

describe('validateImage: la puerta de los uploads', () => {
  it('acepta una imagen común', async () => {
    expect(await imageService.validateImage(await crearImagen('ok.jpg', 500, 500, 'jpeg'))).toBe(
      true,
    );
    expect(await imageService.validateImage(await crearImagen('ok.png', 500, 500, 'png'))).toBe(
      true,
    );
  });

  it('rechaza una imagen demasiado chica', async () => {
    expect(await imageService.validateImage(await crearImagen('mini.jpg', 50, 50, 'jpeg'))).toBe(
      false,
    );
  });

  it('rechaza un SVG', async () => {
    /**
     * Un SVG puede llevar <script>. Que no figure entre los formatos válidos es
     * lo que lo frena antes de que se sirva desde el mismo origen que la app.
     */
    const svg = ruta('malo.svg');
    writeFileSync(
      svg,
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><script>alert(1)</script></svg>',
    );
    expect(await imageService.validateImage(svg)).toBe(false);
  });

  it('rechaza bytes basura y una imagen cortada, sin lanzar', async () => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});

    const basura = ruta('basura2.png');
    writeFileSync(basura, Buffer.from('no soy un png'));
    expect(await imageService.validateImage(basura)).toBe(false);

    // Una imagen real a la que le falta la mitad: lo que sube alguien con la
    // conexión cortada, o a propósito.
    const completa = await crearImagen('entera.jpg', 800, 800, 'jpeg');
    const cortada = ruta('cortada.jpg');
    const bytes = await sharp(completa).toBuffer();
    writeFileSync(cortada, bytes.subarray(0, Math.floor(bytes.length / 2)));
    // Puede aceptarla o rechazarla según cuánto del encabezado sobreviva; lo
    // que no puede es tirar una excepción sin atrapar.
    await expect(imageService.validateImage(cortada)).resolves.toEqual(expect.any(Boolean));

    espia.mockRestore();
  });
});
