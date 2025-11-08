/**
 * Script para listar todos los usuarios con roles de admin
 *
 * Uso:
 * npx tsx server/scripts/listAdmins.ts
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function listAdmins() {
  try {
    // Verificar que MONGODB_URI existe
    if (!process.env.MONGODB_URI) {
      console.error("❌ Error: MONGODB_URI no está definido en .env");
      process.exit(1);
    }

    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB\n");

    // Buscar usuarios con adminRole
    const admins = await User.find({
      adminRole: { $exists: true, [Op.ne]: null }
    }).select("name email adminRole permissions createdAt lastLogin");

    if (admins.length === 0) {
      console.log("❌ No hay usuarios con roles de admin\n");
      console.log("💡 Para asignar un rol de admin:");
      console.log("   npx tsx server/scripts/assignAdminRole.ts <email> <role>\n");
      process.exit(0);
    }

    console.log(`📋 Usuarios con roles de admin (${admins.length} encontrados):\n`);

    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name}`);
      console.log(`   📧 Email: ${admin.email}`);
      console.log(`   🛡️  Rol: ${admin.adminRole}`);
      console.log(`   🔑 Permisos: ${admin.permissions?.length || 0}`);
      console.log(`   📅 Creado: ${admin.createdAt.toLocaleDateString()}`);
      console.log(`   🕐 Último login: ${admin.lastLogin ? admin.lastLogin.toLocaleDateString() : "Nunca"}`);
      console.log("");
    });

    console.log("✅ Listado completo\n");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Desconectado de MongoDB");
    process.exit(0);
  }
}

listAdmins();
