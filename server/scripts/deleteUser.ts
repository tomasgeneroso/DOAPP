/**
 * Script para eliminar un usuario de la base de datos.
 * Elimina también sus datos relacionados (contratos, propuestas, etc.)
 *
 * Uso:
 *   npx tsx server/scripts/deleteUser.ts <email>
 *   npx tsx server/scripts/deleteUser.ts <email> --force   (sin confirmación)
 *
 * Ejemplo:
 *   npx tsx server/scripts/deleteUser.ts usuario@ejemplo.com
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import { initDatabase, sequelize } from "../config/database.js";
import { User } from "../models/sql/User.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

async function deleteUser(email: string, force = false) {
  await initDatabase();
  console.log("✅ Conectado a PostgreSQL\n");

  const user = await User.findOne({ where: { email: email.toLowerCase() } });

  if (!user) {
    console.error(`❌ No se encontró ningún usuario con email: ${email}`);
    process.exit(1);
  }

  // Mostrar información del usuario antes de borrar
  console.log("👤 Usuario encontrado:");
  console.log(`   ID:         ${user.id}`);
  console.log(`   Nombre:     ${user.name}`);
  console.log(`   Email:      ${user.email}`);
  console.log(`   Username:   ${user.username || '-'}`);
  console.log(`   Rol:        ${user.adminRole || user.role || 'user'}`);
  console.log(`   Verificado: ${user.isVerified ? 'Sí' : 'No'}`);
  console.log(`   Balance:    $${(user as any).balance || 0} ARS`);
  console.log(`   Creado:     ${new Date(user.createdAt).toLocaleString('es-AR')}`);

  // Contar datos relacionados
  const [counts] = await sequelize.query(`
    SELECT
      (SELECT COUNT(*) FROM jobs        WHERE client_id    = '${user.id}') AS jobs,
      (SELECT COUNT(*) FROM contracts   WHERE client_id    = '${user.id}' OR doer_id          = '${user.id}') AS contracts,
      (SELECT COUNT(*) FROM proposals   WHERE freelancer_id = '${user.id}') AS proposals,
      (SELECT COUNT(*) FROM reviews     WHERE reviewer_id   = '${user.id}' OR reviewed_id     = '${user.id}') AS reviews,
      (SELECT COUNT(*) FROM tickets     WHERE created_by    = '${user.id}') AS tickets,
      (SELECT COUNT(*) FROM payments    WHERE payer_id      = '${user.id}' OR recipient_id    = '${user.id}') AS payments
  `);
  const c = counts as any;
  console.log("\n📊 Datos relacionados:");
  console.log(`   Publicaciones: ${c.jobs}`);
  console.log(`   Contratos:     ${c.contracts}`);
  console.log(`   Propuestas:    ${c.proposals}`);
  console.log(`   Reseñas:       ${c.reviews}`);
  console.log(`   Tickets:       ${c.tickets}`);
  console.log(`   Pagos:         ${c.payments}`);

  // Bloquear eliminación de owners
  if (user.adminRole === 'owner') {
    console.error("\n🚫 No se puede eliminar un usuario con rol 'owner' por seguridad.");
    console.error("   Reasigná el rol primero: npx tsx server/scripts/assignAdminRoleSQL.ts <email> none");
    process.exit(1);
  }

  if (!force) {
    console.log("\n⚠️  Esta acción es IRREVERSIBLE.");
    const answer = await prompt(`\n¿Confirmar eliminación de ${user.name} (${user.email})? [escribí "eliminar" para confirmar]: `);
    if (answer.trim().toLowerCase() !== 'eliminar') {
      console.log("❌ Operación cancelada.");
      process.exit(0);
    }
  }

  console.log("\n🗑️  Eliminando usuario...");
  await user.destroy();
  console.log(`✅ Usuario ${user.name} (${user.email}) eliminado correctamente.`);

  process.exit(0);
}

const email = process.argv[2];
const force = process.argv.includes('--force');

if (!email) {
  console.error("❌ Uso: npx tsx server/scripts/deleteUser.ts <email> [--force]");
  process.exit(1);
}

deleteUser(email, force).catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
