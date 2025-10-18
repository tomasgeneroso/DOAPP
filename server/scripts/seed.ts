import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { config } from "../config/env.js";
import User from "../models/User.js";
import Job from "../models/Job.js";
import Contract from "../models/Contract.js";

// Conectar a la base de datos
const connectDB = async () => {
  try {
    console.log("📡 Conectando a MongoDB...");
    await mongoose.connect(config.mongodbUri);
    console.log("✅ Conectado a MongoDB exitosamente");
  } catch (error) {
    console.error("❌ Error conectando a MongoDB:", error);
    process.exit(1);
  }
};

// Limpiar base de datos
const clearDatabase = async () => {
  console.log("🗑️  Limpiando base de datos...");
  await User.deleteMany({});
  await Job.deleteMany({});
  await Contract.deleteMany({});
  console.log("✅ Base de datos limpiada");
};

// Crear usuarios de prueba
const createUsers = async () => {
  console.log("👥 Creando usuarios de prueba...");

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("password123", salt);

  const users = await User.create([
    // Admin users
    {
      name: "Admin Principal",
      email: "admin@doapp.com",
      password: hashedPassword,
      phone: "+54 11 0000-0001",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
      bio: "Administrador principal de la plataforma.",
      rating: 5.0,
      reviewsCount: 0,
      completedJobs: 0,
      role: "both",
      adminRole: "owner",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
      trustScore: 100,
      verificationLevel: "full",
    },
    {
      name: "Super Admin",
      email: "superadmin@doapp.com",
      password: hashedPassword,
      phone: "+54 11 0000-0002",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=SuperAdmin",
      bio: "Super administrador con permisos extendidos.",
      rating: 5.0,
      reviewsCount: 0,
      completedJobs: 0,
      role: "both",
      adminRole: "super_admin",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
      trustScore: 100,
      verificationLevel: "full",
    },
    {
      name: "Moderador",
      email: "moderator@doapp.com",
      password: hashedPassword,
      phone: "+54 11 0000-0003",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Moderator",
      bio: "Moderador de contenido y usuarios.",
      rating: 5.0,
      reviewsCount: 0,
      completedJobs: 0,
      role: "both",
      adminRole: "admin",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
      trustScore: 100,
      verificationLevel: "full",
    },
    {
      name: "Soporte Técnico",
      email: "support@doapp.com",
      password: hashedPassword,
      phone: "+54 11 0000-0004",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Support",
      bio: "Equipo de soporte al usuario.",
      rating: 5.0,
      reviewsCount: 0,
      completedJobs: 0,
      role: "both",
      adminRole: "support",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
      trustScore: 100,
      verificationLevel: "full",
    },
    // Regular users
    {
      name: "María González",
      email: "maria@example.com",
      password: hashedPassword,
      phone: "+54 11 1234-5678",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Maria",
      bio: "Dueña de casa con experiencia en gestión de proyectos pequeños.",
      rating: 4.8,
      reviewsCount: 23,
      completedJobs: 15,
      role: "client",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
    },
    {
      name: "Carlos Rodríguez",
      email: "carlos@example.com",
      password: hashedPassword,
      phone: "+54 11 2345-6789",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos",
      bio: "Carpintero profesional con 10 años de experiencia.",
      rating: 4.9,
      reviewsCount: 45,
      completedJobs: 38,
      role: "doer",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
    },
    {
      name: "Ana Martínez",
      email: "ana@example.com",
      password: hashedPassword,
      phone: "+54 11 3456-7890",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ana",
      bio: "Propietaria de varias propiedades, siempre buscando profesionales confiables.",
      rating: 4.7,
      reviewsCount: 18,
      completedJobs: 12,
      role: "client",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
    },
    {
      name: "Juan Pérez",
      email: "juan@example.com",
      password: hashedPassword,
      phone: "+54 11 4567-8901",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Juan",
      bio: "Plomero certificado, especializado en reparaciones de emergencia.",
      rating: 4.6,
      reviewsCount: 32,
      completedJobs: 28,
      role: "doer",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
    },
    {
      name: "Laura Sánchez",
      email: "laura@example.com",
      password: hashedPassword,
      phone: "+54 11 5678-9012",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Laura",
      bio: "Cliente y doer, me gusta ayudar y recibir ayuda de la comunidad.",
      rating: 4.5,
      reviewsCount: 15,
      completedJobs: 10,
      role: "both",
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      isVerified: true,
    },
  ]);

  console.log(`✅ ${users.length} usuarios creados`);
  return users;
};

// Crear trabajos de prueba
const createJobs = async (users: any[]) => {
  console.log("💼 Creando trabajos de prueba...");

  const clients = users.filter((u) => u.role === "client" || u.role === "both");

  const jobs = await Job.create([
    {
      title: "Armar mueble de cocina",
      summary: "Necesito ayuda para armar un mueble de cocina de IKEA.",
      description:
        "Compré un mueble de cocina modular que necesita ser armado. Incluye todos los herrajes y tornillos. Se requiere destornillador, taladro y nivel. El trabajo debería tomar aproximadamente 3-4 horas.",
      price: 8000,
      category: "Carpintería",
      location: "Palermo, CABA",
      latitude: -34.5875,
      longitude: -58.4227,
      startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // En 2 días
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000), // 4 horas después
      status: "open",
      client: clients[0]._id,
      toolsRequired: ["Destornillador", "Taladro", "Nivel"],
      materialsProvided: true,
    },
    {
      title: "Reparar canilla de baño",
      summary: "Canilla que gotea y necesita reparación urgente.",
      description:
        "La canilla del baño principal tiene una pérdida constante. Necesito que un plomero la revise y repare. Puede ser necesario cambiar el empaque o el cartucho completo.",
      price: 5000,
      category: "Plomería",
      location: "Belgrano, CABA",
      latitude: -34.5631,
      longitude: -58.4556,
      startDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Mañana
      endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 horas después
      status: "open",
      client: clients[1]._id,
      toolsRequired: ["Llave inglesa", "Destornillador"],
      materialsProvided: false,
    },
    {
      title: "Pintar habitación pequeña",
      summary: "Necesito pintar una habitación de 3x3 metros.",
      description:
        "Habitación que necesita una mano de pintura. Las paredes ya están preparadas y limpias. Tengo la pintura lista. Solo necesito a alguien con experiencia para aplicarla de manera prolija.",
      price: 12000,
      category: "Pintura",
      location: "Recoleta, CABA",
      latitude: -34.5884,
      longitude: -58.3960,
      startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // En 3 días
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000), // 8 horas después
      status: "open",
      client: clients[0]._id,
      toolsRequired: ["Rodillo", "Pincel", "Bandeja"],
      materialsProvided: true,
    },
    {
      title: "Instalar estantes en pared",
      summary: "Necesito instalar 4 estantes flotantes en el living.",
      description:
        "Tengo 4 estantes flotantes que necesitan ser instalados en una pared de durlock. Es importante que queden bien nivelados y seguros. Los estantes y los tarugos especiales para durlock ya están disponibles.",
      price: 6000,
      category: "Carpintería",
      location: "Villa Crespo, CABA",
      latitude: -34.5997,
      longitude: -58.4391,
      startDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // En 4 días
      endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 3 horas después
      status: "open",
      client: clients[1]._id,
      toolsRequired: ["Taladro", "Nivel", "Destornillador"],
      materialsProvided: true,
    },
    {
      title: "Cambiar lámpara de techo",
      summary: "Necesito reemplazar una lámpara vieja por una nueva.",
      description:
        "Tengo una lámpara nueva que necesita ser instalada en el comedor. La lámpara vieja debe ser removida primero. Requiere conocimientos básicos de electricidad y precaución con la corriente.",
      price: 4000,
      category: "Electricidad",
      location: "Caballito, CABA",
      latitude: -34.6158,
      longitude: -58.4394,
      startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // En 5 días
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 1.5 * 60 * 60 * 1000), // 1.5 horas después
      status: "open",
      client: clients[2]._id,
      toolsRequired: ["Escalera", "Destornillador", "Buscapolos"],
      materialsProvided: true,
    },
    {
      title: "Reparar persiana que no sube",
      summary: "La persiana del dormitorio está trabada y no sube.",
      description:
        "La persiana está atascada y no se puede subir ni bajar correctamente. Posiblemente sea un problema con el mecanismo interno o la cinta. Necesito que alguien con experiencia la revise y repare.",
      price: 7000,
      category: "Reparaciones",
      location: "San Telmo, CABA",
      latitude: -34.6212,
      longitude: -58.3731,
      startDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // En 6 días
      endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 horas después
      status: "open",
      client: clients[0]._id,
      toolsRequired: ["Destornillador", "Escalera"],
      materialsProvided: false,
    },
    {
      title: "Arreglar puerta que no cierra bien",
      summary: "La puerta del baño no cierra correctamente.",
      description:
        "La puerta está desalineada y roza con el marco. Necesita ajuste de bisagras o posiblemente cepillar un poco la madera. El trabajo es sencillo pero requiere herramientas específicas.",
      price: 3500,
      category: "Carpintería",
      location: "Almagro, CABA",
      latitude: -34.6097,
      longitude: -58.4161,
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // En 7 días
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000), // 1 hora después
      status: "open",
      client: clients[1]._id,
      toolsRequired: ["Destornillador", "Cepillo de madera", "Nivel"],
      materialsProvided: true,
    },
    {
      title: "Limpiar y desatascar canaleta",
      summary: "Las canaletas del techo están obstruidas.",
      description:
        "Necesito que alguien limpie y desobstruya las canaletas del techo. Hay hojas y residuos acumulados que impiden el correcto drenaje del agua de lluvia. Se requiere escalera larga y herramientas de limpieza.",
      price: 9000,
      category: "Mantenimiento",
      location: "Núñez, CABA",
      latitude: -34.5446,
      longitude: -58.4596,
      startDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // En 8 días
      endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 3 horas después
      status: "open",
      client: clients[2]._id,
      toolsRequired: ["Escalera extensible", "Guantes", "Bolsas de residuos"],
      materialsProvided: false,
    },
  ]);

  console.log(`✅ ${jobs.length} trabajos creados`);
  return jobs;
};

// Ejecutar seed
const seed = async () => {
  try {
    console.log("🌱 Iniciando seed de base de datos...\n");

    await connectDB();
    await clearDatabase();

    const users = await createUsers();
    await createJobs(users);

    console.log("\n🎉 Seed completado exitosamente!");
    console.log("\n📧 Credenciales de prueba:");
    console.log("\n👑 Admin:");
    console.log("   Owner: admin@doapp.com / password123");
    console.log("   Super Admin: superadmin@doapp.com / password123");
    console.log("   Moderator: moderator@doapp.com / password123");
    console.log("   Support: support@doapp.com / password123");
    console.log("\n👥 Usuarios regulares:");
    console.log("   Client 1: maria@example.com / password123");
    console.log("   Client 2: ana@example.com / password123");
    console.log("   Doer 1: carlos@example.com / password123");
    console.log("   Doer 2: juan@example.com / password123");
    console.log("   Both: laura@example.com / password123\n");

    await mongoose.connection.close();
    console.log("🔌 Conexión a MongoDB cerrada");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error ejecutando seed:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Ejecutar si se llama directamente
seed();

export default seed;
