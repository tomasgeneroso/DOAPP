import { describe, it, expect } from '@jest/globals';

/**
 * La migración 20261126100000 (registro de uso) corre de verdad contra la base, deja las mismas columnas que los modelos, se puede repetir
 * (staging y producción pueden tener ya las tablas por `ensureSchema`) y se puede deshacer. Las demás pruebas arman la base desde los modelos y no la ejecutan.
 */
import { sequelize } from '../../server/config/database.js';
import { ActivityDay } from '../../server/models/sql/ActivityDay.model.js';
import { UsageCounter } from '../../server/models/sql/UsageCounter.model.js';
import { anotarLatido, sumarAlContador } from '../../server/services/registroDeUso.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { duenoDelEsquema } from '../helpers/ddl.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracion = require('../../migrations/20261126100000-registro-de-uso.cjs');
// La migración la corre el dueño de la base (como el deploy); el latido y las lecturas de después van con el rol de la app: así se comprueba que la tabla nueva le llega con permisos.

const columnas = async (tabla: string): Promise<string[]> => {
  const [filas]: any = await sequelize.query('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = :tabla ORDER BY column_name', { replacements: { tabla } });
  return filas.map((f: any) => f.column_name);
};
const delModelo = (m: any): string[] => Object.values(m.rawAttributes).map((a: any) => a.field).sort();

describe('migración del registro de uso', () => {
  it('down y up corren; las columnas coinciden con los modelos; repetir up no falla; el latido y el contador andan sobre esas tablas', async () => {
    const interfaz = { sequelize: duenoDelEsquema() };
    await migracion.down(interfaz);
    expect(await columnas('activity_days')).toEqual([]);

    await migracion.up(interfaz);
    await migracion.up(interfaz);
    expect(await columnas('activity_days')).toEqual(delModelo(ActivityDay));
    expect(await columnas('usage_counters')).toEqual(delModelo(UsageCounter));

    const u: any = await crearUsuario();
    await anotarLatido(u.id, 'web');
    await sumarAlContador('apk_download');
    await sumarAlContador('apk_download');
    expect(await ActivityDay.count({ where: { userId: u.id } })).toBe(1);
    expect((await UsageCounter.findOne({ where: { name: 'apk_download' } }))?.total).toBe(2);

    // Borrar la cuenta se lleva su registro de uso (la tabla de la migración lo declara en cascada).
    await sequelize.query('DELETE FROM users WHERE id = :id', { replacements: { id: u.id } });
    expect(await ActivityDay.count({ where: { userId: u.id } })).toBe(0);
  });
});
