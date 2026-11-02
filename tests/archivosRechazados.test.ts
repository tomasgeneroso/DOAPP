import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { uploadAvatar, uploadDocument, uploadTicketAttachments, uploadDniPhotos } from '../server/middleware/upload.js';
import { errorHandler } from '../server/middleware/errorHandler.js';

/**
 * Subir un archivo de un tipo que no corresponde es un error de quien lo sube, no del servidor: tiene que contestarse 400 con el motivo.
 *
 * Lo encontró la prueba real con navegador (parte B, caso B3): los filtros de archivos rechazaban con un `Error` cualquiera, el manejador de
 * errores no sabía qué estado ponerle y lo contestaba 500 («error del servidor»), además de ensuciar el registro de errores graves.
 */
const appCon = (subida: express.RequestHandler) => {
  const app = express();
  app.post('/subir', subida, (_req, res) => void res.json({ success: true }));
  app.use(errorHandler as any);
  return app;
};

describe('un archivo de un tipo no permitido se rechaza con 400 y el motivo', () => {
  const casos: Array<[string, express.RequestHandler, string]> = [
    ['avatar', uploadAvatar as any, 'avatar'],
    ['documento', uploadDocument as any, 'document'],
    ['adjunto de ticket', uploadTicketAttachments as any, 'attachments'],
    ['fotos del DNI', uploadDniPhotos as any, 'dniFront'],
  ];

  it.each(casos)('%s: un .exe da 400, no 500', async (_nombre, subida, campo) => {
    const r = await request(appCon(subida)).post('/subir').attach(campo, Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });

    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(String(r.body.message)).toMatch(/permit|acept|imágenes|documentos|PDF/i);
  });
});
