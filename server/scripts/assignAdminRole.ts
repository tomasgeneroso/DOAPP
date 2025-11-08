/**
 * Script para asignar rol de admin a un usuario
 *
 * Uso:
 * npx tsx server/scripts/assignAdminRole.ts <email> <role>
 *
 * Ejemplo:
 * npx tsx server/scripts/assignAdminRole.ts admin@doapp.com owner
 * npx tsx server/scripts/assignAdminRole.ts support@doapp.com support
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, "../../.env") });

const VALID_ROLES = ["owner", "super_admin", "admin", "support", "marketing", "dpo"];

async function assignAdminRole(email: string, role: string) {
  try {
    // Verificar que MONGODB_URI existe
    if (!process.env.MONGODB_URI) {
      console.error("❌ Error: MONGODB_URI no está definido en .env");
      process.exit(1);
    }

    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB");

    // Validar rol
    if (!VALID_ROLES.includes(role)) {
      console.error(`❌ Rol inválido: ${role}`);
      console.log(`Roles válidos: ${VALID_ROLES.join(", ")}`);
      process.exit(1);
    }

    // Buscar usuario
    const user = await User.findOne({ email: email.toLowerCase() });
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
        "users:read"
      ],
      dpo: [
        "gdpr:export", "gdpr:delete", "gdpr:anonymize",
        "users:read",
        "audit:read"
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
    await mongoose.disconnect();
    console.log("\n👋 Desconectado de MongoDB");
    process.exit(0);
  }
}

// Obtener argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
📝 Uso: npx tsx server/scripts/assignAdminRole.ts <email> <role>

Roles disponibles:
  - owner        : Acceso total al sistema
  - super_admin  : Acceso administrativo completo
  - admin        : Administrador general
  - support      : Soporte y tickets
  - marketing    : Contenido y marketing
  - dpo          : Oficial de protección de datos

Ejemplos:
  npx tsx server/scripts/assignAdminRole.ts admin@doapp.com owner
  npx tsx server/scripts/assignAdminRole.ts support@doapp.com support
  `);
  process.exit(1);
}

const [email, role] = args;
assignAdminRole(email, role);
