import { Op } from 'sequelize';
import { FamilyCode } from '../models/sql/FamilyCode.model.js';
import { claveDeNombre, separarNombres, type NombreInvalido } from '../../shared/familia/nombresEnMasa.js';

/**
 * Códigos de familia en masa (regla del dueño, 2026-11-11): se pegan los nombres separados por comas y se emite un código por persona.
 *
 * Reglas:
 *  - Una persona con un código ACTIVO (usado o sin usar) no recibe otro: se devuelve el que ya tiene (`yaExistian`). Así correr la misma lista dos veces no duplica nada.
 *    Un código revocado o desactivado no cuenta: esa persona puede recibir uno nuevo.
 *  - Los nombres se comparan sin mayúsculas ni tildes («JOSÉ pérez» = «Jose Perez»).
 *  - Todo o nada: los códigos nuevos se crean en una sola transacción; si algo falla no queda la mitad.
 *  - Cada código es único (se comprueba contra la base y entre sí).
 */

export interface CodigoEmitido {
  id: string;
  nombre: string;
  code: string;
}

export interface ResultadoDeLaTanda {
  creados: CodigoEmitido[];
  yaExistian: Array<{ nombre: string; code: string }>;
  invalidos: NombreInvalido[];
  repetidos: string[];
  excedentes: number;
}

export async function crearCodigosDeFamiliaEnMasa(a: {
  texto: string;
  createdById: string;
  notes?: string | null;
  expiresAt?: Date | null;
}): Promise<ResultadoDeLaTanda> {
  const separados = separarNombres(a.texto);
  const resultado: ResultadoDeLaTanda = { creados: [], yaExistian: [], invalidos: separados.invalidos, repetidos: separados.repetidos, excedentes: separados.excedentes };
  if (separados.validos.length === 0) return resultado;

  const { sequelize } = await import('../config/database.js');
  await sequelize.transaction(async (t) => {
    // Los códigos activos que ya hay, por nombre.
    const activos: any[] = await FamilyCode.findAll({ where: { isActive: true }, attributes: ['id', 'firstName', 'lastName', 'code'], transaction: t });
    const porNombre = new Map<string, string>(activos.map((c) => [claveDeNombre(`${c.firstName} ${c.lastName}`), String(c.code)]));

    const nuevos = separados.validos.filter((n) => {
      const existente = porNombre.get(n.clave);
      if (existente) resultado.yaExistian.push({ nombre: n.completo, code: existente });
      return !existente;
    });
    if (nuevos.length === 0) return;

    // Códigos nuevos y únicos: contra la base y entre sí.
    const elegidos = new Set<string>();
    for (let intento = 0; intento < 20 && elegidos.size < nuevos.length; intento++) {
      const candidatos = new Set<string>();
      while (elegidos.size + candidatos.size < nuevos.length) candidatos.add(FamilyCode.generateCode());
      const ocupados: any[] = await FamilyCode.findAll({ where: { code: { [Op.in]: [...candidatos] } }, attributes: ['code'], transaction: t });
      const ocupadosSet = new Set(ocupados.map((c) => String(c.code)));
      for (const c of candidatos) if (!ocupadosSet.has(c) && !elegidos.has(c)) elegidos.add(c);
    }
    if (elegidos.size < nuevos.length) throw new Error('No se pudieron generar códigos únicos. Probá de nuevo.');

    const codigos = [...elegidos];
    const filas = await FamilyCode.bulkCreate(
      nuevos.map((n, i) => ({
        firstName: n.nombre,
        lastName: n.apellido,
        code: codigos[i],
        notes: a.notes?.trim() || null,
        expiresAt: a.expiresAt ?? null,
        createdById: a.createdById,
        isActive: true,
      })) as any,
      { transaction: t },
    );
    filas.forEach((f: any, i) => resultado.creados.push({ id: String(f.id), nombre: nuevos[i].completo, code: String(f.code) }));
  });
  return resultado;
}
