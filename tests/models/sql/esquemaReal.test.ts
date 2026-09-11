import { sequelize } from '../../../server/config/database.js';

/**
 * El esquema real tiene que coincidir con lo que los modelos esperan.
 *
 * Este archivo existe por un error concreto que estuvo roto en produccion sin
 * que nadie lo notara. AuditLog es de las pocas tablas SIN `underscored: true`,
 * asi que sus columnas son camelCase; una migracion escrita asumiendo
 * snake_case hizo `ALTER TABLE ... performed_by`, que en Postgres no encuentra
 * nada y falla en silencio. Resultado: la columna siguio siendo NOT NULL y
 * todos los eventos automaticos de dinero se perdieron durante dias.
 *
 * Nada lo detectaba. Los tests pasaban, el chequeo de tipos pasaba, la
 * aplicacion funcionaba. Sequelize no valida el esquema al arrancar y el
 * try/catch del registro se tragaba el error, que es lo correcto -- un fallo al
 * registrar no puede tumbar el movimiento que estaba registrando -- pero
 * tambien es lo que lo volvio invisible.
 *
 * La unica defensa posible es preguntarle a la base que columnas tiene y
 * compararlas contra lo que los modelos declaran. Eso es lo que hace esto.
 */

describe('el esquema real coincide con los modelos', () => {
  let columnasPorTabla: Map<string, Set<string>>;

  beforeAll(async () => {
    const [filas]: any = await sequelize.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);

    columnasPorTabla = new Map();
    for (const f of filas) {
      if (!columnasPorTabla.has(f.table_name)) columnasPorTabla.set(f.table_name, new Set());
      columnasPorTabla.get(f.table_name)!.add(f.column_name);
    }
  });

  it('cada columna que un modelo espera existe en su tabla', () => {
    const faltantes: string[] = [];

    for (const modelo of Object.values(sequelize.models)) {
      const tabla = String(modelo.getTableName());
      const columnas = columnasPorTabla.get(tabla);

      // Un modelo sin tabla es otro problema y lo cubre el test de abajo.
      if (!columnas) continue;

      for (const [atributo, def] of Object.entries((modelo as any).rawAttributes)) {
        const campo = (def as any).field || atributo;
        if (!columnas.has(campo)) {
          faltantes.push(`${modelo.name}.${atributo} espera la columna "${tabla}"."${campo}"`);
        }
      }
    }

    // El mensaje lista todo de una vez: arreglar de a uno y volver a correr es
    // como se pierde una tarde en algo que se resuelve de una sentada.
    expect(faltantes).toEqual([]);
  });

  it('cada modelo tiene su tabla creada', () => {
    const sinTabla = Object.values(sequelize.models)
      .map((m) => ({ nombre: m.name, tabla: String(m.getTableName()) }))
      .filter((m) => !columnasPorTabla.has(m.tabla))
      .map((m) => `${m.nombre} -> ${m.tabla}`);

    expect(sinTabla).toEqual([]);
  });

  /**
   * Todo atributo con mayusculas consecutivas tiene que fijar su `field`.
   *
   * Es la causa raiz de la familia entera de errores. Con `underscored: true`,
   * Sequelize convierte CADA mayuscula en su propio tramo: priceEUR se vuelve
   * "price_e_u_r", no "price_eur". Nadie escribe eso en una migracion, asi que
   * el modelo termina apuntando a una columna que nadie mas conoce.
   *
   * Y no falla: Sequelize crea esa columna al sincronizar, la aplicacion
   * funciona, y el dato simplemente no esta donde el resto del sistema lo
   * busca. Eso paso con memberships.price_e_u_r, que convivio con price_eur
   * sin que nada lo delatara.
   *
   * La regla es mecanica y por eso se puede verificar: si el nombre tiene dos
   * mayusculas seguidas, el `field` va escrito a mano.
   */
  it('los atributos con mayusculas consecutivas fijan su columna', () => {
    const sinFijar: string[] = [];

    for (const modelo of Object.values(sequelize.models)) {
      if (!(modelo as any).options?.underscored) continue;

      for (const [atributo, def] of Object.entries((modelo as any).rawAttributes)) {
        if (!/[A-Z]{2}/.test(atributo)) continue;
        if (!(def as any).field) {
          sinFijar.push(
            `${modelo.name}.${atributo} — sin \`field\` quedaría como ` +
              `"${atributo.replace(/([A-Z])/g, '_$1').toLowerCase()}"`,
          );
        }
      }
    }

    expect(sinFijar).toEqual([]);
  });

  /**
   * Las tablas camelCase son las que se prestan al error: en Postgres hay que
   * escribirlas entre comillas dobles, y sin ellas el identificador se lee en
   * minusculas y no encuentra nada.
   *
   * Este test no falla si hay tablas asi -- son legitimas -- sino que deja la
   * lista escrita para que quien toque una migracion sepa cuales son. Si alguna
   * se convierte a underscored, este test avisa y hay que actualizar la lista,
   * que es exactamente el momento en que conviene mirarlo.
   */
  /**
   * Cada ALTER de ensureSchema nombra una columna que el modelo espera.
   *
   * Este es el test que habria atrapado el error. Las sentencias de
   * ensureSchema corren envueltas en try/catch para que una sola no pueda
   * frenar el arranque -- lo cual es correcto -- pero eso significa que una
   * que nombra mal una columna imprime un aviso y sigue de largo. El aviso se
   * pierde entre cien lineas de log y la columna nunca se crea.
   *
   * Comparar el texto de las sentencias contra lo que declaran los modelos no
   * necesita base de datos y corre en milisegundos.
   */
  it('cada columna de ensureSchema coincide con la que el modelo espera', async () => {
    const { STATEMENTS } = await import('../../../server/config/ensureSchema.js');

    // Qué columnas declara cada tabla, según los modelos.
    const esperadasPorTabla = new Map<string, Set<string>>();
    for (const modelo of Object.values(sequelize.models)) {
      const tabla = String(modelo.getTableName());
      const cols = new Set<string>();
      for (const [atributo, def] of Object.entries((modelo as any).rawAttributes)) {
        cols.add((def as any).field || atributo);
      }
      esperadasPorTabla.set(tabla, cols);
    }

    const sospechosas: string[] = [];

    for (const { label, sql } of STATEMENTS) {
      // Sólo las sentencias que tocan una columna concreta. CREATE TABLE e
      // índices tienen su propia forma y no aplican a esta comprobación.
      const m = sql.match(
        /ALTER TABLE\s+"?(\w+)"?\s+(?:ADD COLUMN IF NOT EXISTS|ALTER COLUMN)\s+"?(\w+)"?/i,
      );
      if (!m) continue;

      const [, tabla, columna] = m;
      const esperadas = esperadasPorTabla.get(tabla);

      // Una tabla que ningún modelo declara no se puede verificar acá.
      if (!esperadas) continue;

      if (!esperadas.has(columna)) {
        // El mensaje dice cuál era la correcta: sin eso, el que lo lea tiene
        // que ir a buscar el modelo para entender qué cambiar.
        const parecida = [...esperadas].find(
          (c) => c.toLowerCase().replace(/_/g, '') === columna.toLowerCase().replace(/_/g, ''),
        );
        sospechosas.push(
          `"${label}": la tabla ${tabla} no tiene la columna "${columna}"` +
            (parecida ? `. ¿Querías decir "${parecida}"?` : '.'),
        );
      }
    }

    expect(sospechosas).toEqual([]);
  });

  it('las tablas con columnas camelCase siguen siendo las conocidas', () => {
    const conCamel = [...columnasPorTabla.entries()]
      .filter(([, cols]) => [...cols].some((c) => /[A-Z]/.test(c)))
      .map(([t]) => t)
      .sort();

    expect(conCamel).toEqual([
      'audit_logs',
      'consent_logs',
      'contact_messages',
      'contract_negotiations',
      'data_access_logs',
      'login_devices',
      'matching_codes',
    ]);
  });
});
