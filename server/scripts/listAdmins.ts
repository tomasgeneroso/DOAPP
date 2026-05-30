/**
 * Script para listar todos los usuarios con roles de admin
 *
 * Uso:
 * npx tsx server/scripts/listAdmins.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { User } from "../models/sql/User.model.js";
import { Op } from "sequelize";
import { sequelize } from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function listAdmins() {
  try {
    await sequelize.authenticate();
    console.log("✅ Conectado a PostgreSQL\n");

    const admins = await User.findAll({
      where: {
        adminRole: { [Op.ne]: null },
      },
      attributes: ["name", "email", "adminRole", "permissions", "createdAt", "lastLogin"],
    });

    if (admins.length === 0) {
      console.log("❌ No hay usuarios con roles de admin\n");
      console.log("💡 Para asignar un rol de admin:");
      console.log("   npx tsx server/scripts/assignAdminRoleSQL.ts <email> <role>\n");
      process.exit(0);
    }

    console.log(`📋 Usuarios con roles de admin (${admins.length} encontrados):\n`);

    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name}`);
      console.log(`   📧 Email: ${admin.email}`);
      console.log(`   🛡️  Rol: ${admin.adminRole}`);
      console.log(`   🔑 Permisos: ${(admin.permissions as any)?.length || 0}`);
      console.log(`   📅 Creado: ${admin.createdAt.toLocaleDateString()}`);
      console.log(`   🕐 Último login: ${(admin as any).lastLogin ? (admin as any).lastLogin.toLocaleDateString() : "Nunca"}`);
      console.log("");
    });

    console.log("✅ Listado completo\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log("👋 Desconectado de PostgreSQL");
    process.exit(0);
  }
}

listAdmins();
