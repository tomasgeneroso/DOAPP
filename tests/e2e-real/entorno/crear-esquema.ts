/**
 * Crea las tablas en la base de las pruebas «reales» (`doapp_e2e`) igual que lo hace el arranque en desarrollo: sync de los modelos y
 * `ensureCriticalSchema`. Se corre como proceso aparte (`npx tsx`) porque carga el servidor con su propia conexión.
 * Solo toca bases cuyo nombre termina en `_e2e`.
 */
export {};

const nombre = process.env.DB_NAME || '';
if (!/_e2e$/.test(nombre)) throw new Error(`crear-esquema: la base tiene que terminar en _e2e (es «${nombre}»)`);
process.env.NODE_ENV = 'development';

const { initDatabase, sequelize } = await import('../../../server/config/database.js');
await initDatabase();

// En producción la tabla de módulos se carga la primera vez que el dueño abre «Módulos» (hasta entonces la pantalla de pago ofrece solo Mercado Pago). Las pruebas
// parten de ese estado normal, no de una base sin configurar: si no, ninguna ve la transferencia, Binance ni los demás medios.
const { DEFAULT_MODULES } = await import('../../../server/routes/admin/modules.js');
const { ModuleConfig } = await import('../../../server/models/sql/ModuleConfig.model.js');
await ModuleConfig.bulkCreate(DEFAULT_MODULES as any[]);
const [filas] = (await sequelize.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'")) as any[];
console.log(`[e2e] esquema listo en ${nombre}: ${filas[0].n} tablas`);
await sequelize.close();
process.exit(0);
