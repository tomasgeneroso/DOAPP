import { describe, it, expect } from '@jest/globals';
import { sequelize } from '../../server/config/database.js';

/** La migración de la matrícula corre sin errores, dos veces seguidas (idempotente), y deja las columnas esperadas. */
describe('migración 20261012100000-matricula-cifrada', () => {
  it('up() es idempotente y deja license_number como TEXT y license_document_back_url', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const migracion = require('../../migrations/20261012100000-matricula-cifrada.cjs');
    const qi = sequelize.getQueryInterface();
    await migracion.up(qi);
    await migracion.up(qi);
    const [cols]: any = await sequelize.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('license_number','license_document_back_url') ORDER BY column_name",
    );
    expect(cols).toEqual([
      { column_name: 'license_document_back_url', data_type: 'text' },
      { column_name: 'license_number', data_type: 'text' },
    ]);
  });
});
