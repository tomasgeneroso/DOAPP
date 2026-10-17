import { Sequelize } from 'sequelize';
import { sequelize } from '../../server/config/database.js';

/**
 * Una conexión aparte, con el usuario de la base y SIN el rol restringido de la app, para los tests que tocan la estructura (ALTER TABLE,
 * migraciones).
 *
 * Con Row Level Security encendida la app actúa como `doapp_app`, que solo lee y escribe filas: no puede cambiar tablas, igual que en
 * producción. Un test que reproduce una migración o un esquema viejo tiene que hacerlo como lo hace el deploy: con el dueño de la base.
 */
let dueno: Sequelize | null = null;

export function duenoDelEsquema(): Sequelize {
  if (!dueno) {
    const c = sequelize.config as any;
    dueno = new Sequelize(c.database, c.username, c.password, { host: c.host, port: c.port, dialect: 'postgres', logging: false, pool: { max: 2 } });
  }
  return dueno;
}
