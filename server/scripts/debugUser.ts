/**
 * Script de diagnóstico para verificar un usuario
 *
 * Uso:
 * npx tsx server/scripts/debugUser.ts <email>
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

async function debugUser(email: string) {
  try {
    if (!process.env.MONGODB_URI) {
      console.error("❌ Error: MONGODB_URI no está definido en .env");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB\n");

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ Usuario no encontrado: ${email}\n`);
      process.exit(1);
    }

    console.log("═══════════════════════════════════════════════");
    console.log("📋 INFORMACIÓN DEL USUARIO");
    console.log("═══════════════════════════════════════════════\n");

    console.log("👤 Datos Básicos:");
    console.log(`   ID: ${user._id}`);
    console.log(`   Nombre: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log("");

    console.log("🛡️  Información de Admin:");
    console.log(`   adminRole: ${user.adminRole || "❌ NO ASIGNADO"}`);
    console.log(`   permissions: ${user.permissions?.length || 0} permisos`);
    if (user.permissions && user.permissions.length > 0) {
      console.log(`   Permisos: ${user.permissions.slice(0, 5).join(", ")}${user.permissions.length > 5 ? "..." : ""}`);
    }
    console.log("");

    console.log("✅ Estado:");
    console.log(`   Verificado: ${user.isVerified ? "Sí" : "No"}`);
    console.log(`   Baneado: ${user.isBanned ? "Sí" : "No"}`);
    console.log("");

    console.log("📅 Fechas:");
    console.log(`   Creado: ${user.createdAt?.toLocaleString()}`);
    console.log(`   Último login: ${user.lastLogin?.toLocaleString() || "Nunca"}`);
    console.log("");

    console.log("═══════════════════════════════════════════════");
    console.log("🔍 DIAGNÓSTICO");
    console.log("═══════════════════════════════════════════════\n");

    let hasIssues = false;

    if (!user.adminRole) {
      console.log("❌ PROBLEMA: adminRole no está asignado");
      console.log("   Solución: npx tsx server/scripts/assignAdminRole.ts " + user.email + " owner");
      hasIssues = true;
    } else {
      console.log("✅ adminRole está asignado: " + user.adminRole);
    }

    if (!user.permissions || user.permissions.length === 0) {
      console.log("⚠️  ADVERTENCIA: No tiene permisos asignados");
      console.log("   Esto puede limitar el acceso al panel admin");
      hasIssues = true;
    } else {
      console.log("✅ Tiene " + user.permissions.length + " permisos asignados");
    }

    if (!hasIssues) {
      console.log("\n🎉 El usuario está configurado correctamente!");
      console.log("\n📝 Si el botón no aparece:");
      console.log("   1. Cierra sesión completamente");
      console.log("   2. Limpia localStorage: localStorage.clear() en consola");
      console.log("   3. Vuelve a iniciar sesión");
      console.log("   4. Verifica la consola del navegador (F12) por errores");
    }

    console.log("");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Desconectado de MongoDB");
    process.exit(0);
  }
}

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log(`
📝 Uso: npx tsx server/scripts/debugUser.ts <email>

Ejemplo:
  npx tsx server/scripts/debugUser.ts admin@doapp.com
  `);
  process.exit(1);
}

const [email] = args;
debugUser(email);
