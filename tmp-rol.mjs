import { readFileSync, writeFileSync } from 'fs';

const COMENTARIO = `  /**
   * 'analista': colabora en el presupuesto y el análisis del negocio, y NO ve
   * el panel de administración.
   *
   * Existe porque hay gente que ayuda a proyectar los números y no tiene por
   * qué poder ver usuarios, pagos, disputas ni documentación de identidad.
   * Darle 'admin' para que entre a dos pantallas sería darle acceso a treinta,
   * y el principio acá es el mismo que en el resto de la app: el acceso se
   * concede por lo que la persona necesita hacer, no por comodidad de quien lo
   * concede.
   */`;

// --- 1. El modelo --------------------------------------------------------
{
  const p = 'server/models/sql/User.model.ts';
  let t = readFileSync(p, 'utf8');
  const de = "  adminRole?: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo';";
  const a = COMENTARIO + "\n  adminRole?: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo' | 'analista';";
  if (!t.includes(de)) { console.error('modelo: no encontrado'); process.exit(1); }
  writeFileSync(p, t.replace(de, a), 'utf8');
  console.log('ok modelo');
}

// --- 2. Los tipos del cliente -------------------------------------------
{
  const p = 'client/types/index.ts';
  const crudo = readFileSync(p, 'utf8');
  const crlf = crudo.includes('\r\n');
  let t = crudo.replace(/\r\n/g, '\n');
  const de = "  adminRole?: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo';";
  const a = "  /** 'analista' colabora en los números y NO ve el panel de administración. */\n  adminRole?: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo' | 'analista';";
  if (!t.includes(de)) { console.error('tipos: no encontrado'); process.exit(1); }
  t = t.replace(de, a);
  writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('ok tipos');
}

// --- 3. La lista de roles válidos del middleware -------------------------
{
  const p = 'server/middleware/auth.ts';
  let t = readFileSync(p, 'utf8');
  const de = "const adminRoles = ['owner', 'super_admin', 'admin', 'support', 'marketing', 'dpo', 'moderator'];";
  const a = "const adminRoles = ['owner', 'super_admin', 'admin', 'support', 'marketing', 'dpo', 'moderator', 'analista'];";
  if (!t.includes(de)) { console.error('middleware: no encontrado'); process.exit(1); }
  writeFileSync(p, t.replace(de, a), 'utf8');
  console.log('ok middleware');
}

// --- 4. Los endpoints del plan: owner + analista -------------------------
{
  const p = 'server/routes/admin/businessPlan.ts';
  let t = readFileSync(p, 'utf8');
  const de = `/** Sólo el owner ve y edita la proyección de gastos */
const ownerOnly = requireAdminRole('owner');`;
  const a = `/**
 * Quién ve y edita los números del negocio.
 *
 * El owner, y el rol 'analista' —gente que colabora en proyectar el
 * presupuesto y no tiene por qué ver usuarios, pagos ni documentación de
 * identidad—. Darles 'admin' para que entren a dos pantallas sería darles
 * acceso a treinta.
 *
 * Sigue llamándose ownerOnly en las rutas que no cambian de alcance; para las
 * del análisis se usa \`analisisOnly\`.
 */
const ownerOnly = requireAdminRole('owner');
const analisisOnly = requireAdminRole('owner', 'analista');`;
  if (!t.includes(de)) { console.error('plan: no encontrado'); process.exit(1); }
  t = t.replace(de, a);

  // Las tres rutas de lectura/escritura del plan y las metricas.
  t = t.replace("router.get('/', protect, ownerOnly,", "router.get('/', protect, analisisOnly,");
  t = t.replace("router.get('/live', protect, ownerOnly,", "router.get('/live', protect, analisisOnly,");
  t = t.replace("router.get('/unit-economics', protect, ownerOnly,", "router.get('/unit-economics', protect, analisisOnly,");
  t = t.replace("router.put('/', protect, ownerOnly,", "router.put('/', protect, analisisOnly,");
  t = t.replace("router.get('/rates', protect, ownerOnly,", "router.get('/rates', protect, analisisOnly,");

  writeFileSync(p, t, 'utf8');
  console.log('ok rutas del plan');
}
