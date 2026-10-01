/**
 * Script para asignar rol de admin a un usuario (PostgreSQL/Sequelize)
 *
 * Uso:
 * npx tsx server/scripts/assignAdminRoleSQL.ts <email> <role>
 *
 * Ejemplo:
 * npx tsx server/scripts/assignAdminRoleSQL.ts admin@doapp.com owner
 * npx tsx server/scripts/assignAdminRoleSQL.ts support@doapp.com support
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "../config/database.js";
import { User } from "../models/sql/User.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, "../../.env") });

const VALID_ROLES = ["owner", "super_admin", "admin", "support", "marketing", "dpo", "moderator", "analista"];

async function assignAdminRole(email: string, role: string) {
  try {
    // Conectar a PostgreSQL
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL");

    // Validar rol
    if (!VALID_ROLES.includes(role)) {
      console.error(`❌ Rol inválido: ${role}`);
      console.log(`Roles válidos: ${VALID_ROLES.join(", ")}`);
      process.exit(1);
    }

    // Buscar usuario
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      console.error(`❌ Usuario no encontrado: ${email}`);
      process.exit(1);
    }

    console.log(`\n📧 Usuario encontrado: ${user.name} (${user.email})`);
    console.log(`   Rol actual: ${user.adminRole || "ninguno"}`);

    // Asignar rol
    user.adminRole = role as any;

    // Asignar permisos por defecto según el rol
    const rolePermissions: Record<string, string[]> = {
      owner: ["*"],
      /**
       * El analista no lleva NINGUN permiso de panel.
       *
       * Su acceso es una sola pantalla -/analisis- y lo decide el rol, no un
       * permiso. Es a proposito: un permiso suelto como "analytics:read" se
       * usa en varios lados y abre mas de lo que uno cree; un rol que no
       * concede nada no puede filtrarse por ningun lado.
       */
      analista: [],
      super_admin: [
        "users:read", "users:write", "users:delete", "users:ban",
        "contracts:read", "contracts:write", "contracts:delete",
        "jobs:read", "jobs:write", "jobs:delete",
        "disputes:read", "disputes:write", "disputes:resolve",
        "tickets:read", "tickets:write", "tickets:assign",
        "analytics:read", "analytics:export",
        "settings:read", "settings:write",
        "roles:read", "roles:assign",
        "audit:read"
      ],
      admin: [
        "users:read", "users:write",
        "contracts:read", "contracts:write",
        "jobs:read", "jobs:write",
        "disputes:read", "disputes:write",
        "tickets:read", "tickets:write",
        "analytics:read",
        "roles:read"
      ],
      support: [
        "tickets:read", "tickets:write", "tickets:assign",
        "disputes:read", "disputes:write",
        "users:read"
      ],
      marketing: [
        "content:read", "content:write", "content:publish",
        "analytics:read",
        "users:read",
        "admin:analytics"
      ],
      dpo: [
        "gdpr:export", "gdpr:delete", "gdpr:anonymize",
        "users:read",
        "audit:read"
      ],
      moderator: [
        "content:read", "content:write", "content:publish",
        "users:read"
      ]
    };

    user.permissions = rolePermissions[role] || [];

    await user.save();

    console.log(`\n✅ Rol asignado exitosamente!`);
    console.log(`   Nuevo rol: ${user.adminRole}`);
    console.log(`   Permisos: ${user.permissions.length} permisos asignados`);
    console.log(`\n🎉 El usuario ahora puede acceder al panel de admin en /admin`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    console.log("\n👋 Proceso finalizado");
    process.exit(0);
  }
}

// Obtener argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
📝 Uso: npx tsx server/scripts/assignAdminRoleSQL.ts <email> <role>

Roles disponibles:
  - owner        : Acceso total al sistema (incluye balance de compañía)
  - super_admin  : Acceso administrativo completo
  - admin        : Administrador general
  - support      : Soporte y tickets
  - marketing    : Contenido, marketing y analytics
  - dpo          : Oficial de protección de datos
  - moderator    : Moderación de contenido
  - analista     : SOLO /analisis (presupuesto y economía unitaria). Sin panel de admin.

Ejemplos:
  npx tsx server/scripts/assignAdminRoleSQL.ts admin@doapp.com owner
  npx tsx server/scripts/assignAdminRoleSQL.ts support@doapp.com support
  npx tsx server/scripts/assignAdminRoleSQL.ts marketing@doapp.com marketing
  npx tsx server/scripts/assignAdminRoleSQL.ts contador@estudio.com analista
  `);
  process.exit(1);
}

const [email, role] = args;
assignAdminRole(email, role);
