import { Portfolio } from '../models/sql/Portfolio.model.js';
import { Post } from '../models/sql/Post.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { conSistema } from '../db/contextoRls.js';
import { trabajosYaCompartidos } from './etiquetasDePublicaciones.js';

export interface PasoDelPortfolio {
  portfolioId: string;
  userId: string;
  titulo: string;
  resultado: 'se_publica' | 'publicado' | 'ya_estaba';
}

/**
 * La pestaña Portfolio se sacó: cada elemento que había pasa a ser una publicación del perfil de su dueño, con su fecha. No se borra nada (el portafolio queda en
 * la base). Si esa persona ya compartió ese trabajo (o ya tiene una publicación con el mismo título), no se duplica. Se puede correr las veces que haga falta.
 */
export async function moverPortfolioAlPerfil(aplicar: boolean): Promise<PasoDelPortfolio[]> {
  return conSistema(async () => {
    const elementos: any[] = await Portfolio.findAll({ order: [['createdAt', 'ASC']] });
    const salida: PasoDelPortfolio[] = [];
    for (const e of elementos) {
      const userId = String(e.userId);
      const titulo = String(e.title || 'Trabajo').slice(0, 100);
      const porTrabajo = e.linkedJob ? (await trabajosYaCompartidos(userId, [String(e.linkedJob)]))[String(e.linkedJob)] : undefined;
      const porTitulo = porTrabajo ? undefined : await Post.findOne({ where: { author: userId, title: titulo } as any, attributes: ['id'] });
      const paso = { portfolioId: String(e.id), userId, titulo };
      if (porTrabajo || porTitulo) {
        salida.push({ ...paso, resultado: 'ya_estaba' });
        continue;
      }
      if (aplicar) {
        const contrato = e.linkedJob
          ? await Contract.findOne({ where: { jobId: e.linkedJob, doerId: userId } }) || await Contract.findOne({ where: { jobId: e.linkedJob, clientId: userId } })
          : null;
        const galeria = [
          ...((e.images || []) as string[]).map((url) => ({ url, type: 'image' })),
          ...((e.videos || []) as string[]).map((url) => ({ url, type: 'video' })),
        ];
        const nueva: any = await Post.create({
          author: userId, title: titulo, description: String(e.description || ''), gallery: galeria, type: 'post', currency: 'ARS',
          tags: Array.isArray(e.tags) ? e.tags : [], linkedContract: contrato?.id, taggedUsers: [], contractRatings: Array.isArray(e.contractRatings) ? e.contractRatings : [],
        } as any);
        // Conserva la fecha en que se había cargado.
        await Post.sequelize!.query('UPDATE posts SET created_at = :cuando WHERE id = :id', { replacements: { cuando: e.createdAt, id: nueva.id } });
      }
      salida.push({ ...paso, resultado: aplicar ? 'publicado' : 'se_publica' });
    }
    return salida;
  });
}
