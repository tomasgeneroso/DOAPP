import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { User } from "../models/sql/User.model.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Proposal } from "../models/sql/Proposal.model.js";
import { Conversation        } from "../models/sql/Conversation.model.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { Review } from "../models/sql/Review.model.js";
import { Payment } from "../models/sql/Payment.model.js";
import { initDatabase, sequelize } from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });

// Datos de usuarios de prueba
const mockUsers = [
  {
    name: "Juan        Pérez",
    email: "juan@test.com",
    password: "123456",
    phone: "+54 9 11 1234-5678",
    bio: "Plomero con        10 años de experiencia. Especializado en        reparaciones e instalaciones.",
    rating: 4.8,
    reviewsCount: 45,
    completedJobs: 52,
    role: "both",
    isVerified: true,
    onboardingCompleted: true,
    interests: ["Plomería", "Instalaciones", "Reparaciones"],
  },
  {
    name: "María González",
    email: "maria@test.com",
    password: "123456",
    phone: "+54 9 11 2345-6789",
    bio: "Electricista certificada. Instalaciones eléctricas residenciales y comerciales.",
    rating: 4.9,
    reviewsCount: 67,
    completedJobs: 73,
    role: "both",
    isVerified: true,
    onboardingCompleted: true,
    interests: ["Electricidad", "Instalaciones", "Mantenimiento"],
  },
  {
    name: "Carlos Rodríguez",
    email: "carlos@test.com",
    password: "123456",
    phone: "+54 9 11 3456-7890",
    bio: "Pintor profesional. Interiores y exteriores con        acabados de alta calidad.",
    rating: 4.7,
    reviewsCount: 38,
    completedJobs: 41,
    role: "both",
    isVerified: true,
    onboardingCompleted: true,
    interests: ["Pintura", "Decoración", "Renovación"],
  },
  {
    name: "Ana Martínez",
    email: "ana@test.com",
    password: "123456",
    phone: "+54 9 11 4567-8901",
    bio: "Limpieza profesional de hogares y oficinas. Servicio de calidad garantizado.",
    rating: 5.0,
    reviewsCount: 89,
    completedJobs: 95,
    role: "both",
    isVerified: true,
    onboardingCompleted: true,
    interests: ["Limpieza", "Organización", "Mantenimiento"],
  },
  {
    name: "Luis Torres",
    email: "luis@test.com",
    password: "123456",
    phone: "+54 9 11 5678-9012",
    bio: "Carpintero con        experiencia en        muebles a medida y reparaciones.",
    rating: 4.6,
    reviewsCount: 32,
    completedJobs: 35,
    role: "both",
    isVerified: true,
    onboardingCompleted: true,
    interests: ["Carpintería", "Muebles", "Reparaciones"],
  },
  {
    name: "Cliente Demo",
    email: "cliente@test.com",
    password: "123456",
    phone: "+54 9 11 6789-0123",
    bio: "Usuario de prueba que contrata servicios regularmente.",
    rating: 4.5,
    reviewsCount: 12,
    completedJobs: 15,
    role: "both",
    isVerified: true,
    onboardingCompleted: true,
    interests: ["Hogar", "Mantenimiento", "Reparaciones"],
  },
  {
    name: "Admin        Demo",
    email: "admin@test.com",
    password: "123456",
    phone: "+54 9 11 7890-1234",
    bio: "Administrador de la plataforma",
    rating: 5.0,
    reviewsCount: 0,
    completedJobs: 0,
    role: "both",
    adminRole: "owner",
    isVerified: true,
    onboardingCompleted: true,
    interests: [],
  },
];

// Categorías de trabajos
const categories = [
  "Plomería",
  "Electricidad",
  "Pintura",
  "Limpieza",
  "Carpintería",
  "Jardinería",
  "Aire Acondicionado",
  "Mudanza",
  "Cerrajería",
  "Reparación        de Electrodomésticos",
];

// Ubicaciones
const locations = [
  "Palermo, CABA",
  "Recoleta, CABA",
  "Belgrano, CABA",
  "Caballito, CABA",
  "Villa Crespo, CABA",
  "Nuñez, CABA",
  "San        Telmo, CABA",
  "Puerto Madero, CABA",
  "Flores, CABA",
  "Almagro, CABA",
];

// Trabajos de muestra
const jobTemplates = [
  {
    title: "Reparación        de canilla que gotea",
    description: "Necesito que reparen        una canilla de la cocina que está goteando constantemente. Es urgente ya que está desperdiciando mucha agua.",
    category: "Plomería",
    budget: 3500,
  },
  {
    title: "Instalación        de lámpara en        techo alto",
    description: "Requiero instalación        de una lámpara colgante en        un        techo de 4 metros de altura. Tengo la lámpara, solo necesito la mano de obra.",
    category: "Electricidad",
    budget: 5000,
  },
  {
    title: "Pintura de habitación        (15m²)",
    description: "Necesito pintar una habitación        de aproximadamente 15m². Las paredes ya están        preparadas. Preferentemente pintura blanca mate.",
    category: "Pintura",
    budget: 12000,
  },
  {
    title: "Limpieza profunda de departamento",
    description: "Limpieza completa de departamento de 2 ambientes después de mudanza. Incluye cocina, baño, pisos y ventanas.",
    category: "Limpieza",
    budget: 8000,
  },
  {
    title: "Reparación        de puerta de placard",
    description: "Una de las puertas del placard se salió de la guía y necesita reparación. También        ajustar bisagras.",
    category: "Carpintería",
    budget: 4500,
  },
  {
    title: "Instalación        de aire acondicionado",
    description: "Instalación        de split de 3500 frigorías en        dormitorio. Tengo el equipo, necesito instalación        profesional con        garantía.",
    category: "Aire Acondicionado",
    budget: 15000,
  },
  {
    title: "Cambio de cerradura principal",
    description: "Necesito cambiar la cerradura de la puerta principal. Preferentemente cerradura de seguridad de buena calidad.",
    category: "Cerrajería",
    budget: 8500,
  },
  {
    title: "Reparación        de heladera que no enfría",
    description: "La heladera dejó de enfriar correctamente. Marca Whirlpool, modelo 2018. Necesito diagnóstico y reparación.",
    category: "Reparación        de Electrodomésticos",
    budget: 6000,
  },
  {
    title: "Poda de árbol en        jardín",
    description: "Tengo un        árbol que necesita poda urgente ya que las ramas están        tocando cables. Jardín        de fácil acceso.",
    category: "Jardinería",
    budget: 7000,
  },
  {
    title: "Mudanza local - 2 ambientes",
    description: "Mudanza de departamento de 2 ambientes dentro de CABA. Aproximadamente 30 cajas y muebles básicos. Distancia: 5km.",
    category: "Mudanza",
    budget: 20000,
  },
];

async function        seedDatabase() {
  try {
    console.log("🚀 Conectando a PostgreSQL...");
    await initDatabase();
    console.log("✅ Conectado a PostgreSQL y modelos registrados\n");

    // Limpiar colecciones
    console.log("🧹 Limpiando base de datos...");
    await User.destroy({ where: {}, truncate: true, cascade: true });
    await Job.destroy({ where: {}, truncate: true, cascade: true });
    await Contract.destroy({ where: {}, truncate: true, cascade: true });
    await Proposal.destroy({ where: {}, truncate: true, cascade: true });
    await Conversation.destroy({ where: {}, truncate: true, cascade: true });
    await ChatMessage.destroy({ where: {}, truncate: true, cascade: true });
    await Review.destroy({ where: {}, truncate: true, cascade: true });
    await Payment.destroy({ where: {}, truncate: true, cascade: true });
    console.log("✅ Base de datos limpiada\n");

    // Crear usuarios
    console.log("👥 Creando usuarios de prueba...");
    // Use Promise.all with individual User.create to ensure hooks fire
    const users = await Promise.all(
      mockUsers.map(userData => User.create(userData))
    );
    console.log(`✅ ${users.length} usuarios creados\n`);

    const [juan, maria, carlos, ana, luis, cliente, admin] = users;
    const freelancers = [juan, maria, carlos, ana, luis];

    // Crear trabajos abiertos
    console.log("💼 Creando trabajos de prueba...");
    const openJobs = [];

    for (let i = 0; i < 15; i++) {
      const template = jobTemplates[i % jobTemplates.length];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 14) + 1);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 5) + 1);

      const job = await Job.create({
        title: template.title,
        description: template.description,
        summary: template.description.substring(0, 100) + "...",
        category: template.category,
        budget: template.budget,
        price: template.budget,
        location: locations[Math.floor(Math.random() * locations.length)],
        startDate,
        endDate,
        status: "open",
        clientId: cliente.id,
      });
      openJobs.push(job);
    }
    console.log(`✅ ${openJobs.length} trabajos abiertos creados\n`);

    // Crear propuestas
    console.log("📝 Creando propuestas de prueba...");
    const proposals = [];

    for (let i = 0; i < openJobs.length && i < 10; i++) {
      const job = openJobs[i];
      const freelancer = freelancers[i % freelancers.length];

      const statuses = ["pending", "pending", "approved", "rejected"];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const proposedPrice = Number(job.price) + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2000);

      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: cliente.id,
        proposedPrice,
        estimatedDuration: Math.floor(Math.random() * 5) + 1,
        coverLetter: `Hola, soy ${freelancer.name} y tengo experiencia en        ${job.category}. Me gustaría trabajar en        este proyecto. Propongo un        precio de $${proposedPrice} y puedo completarlo en        tiempo estimado.`,
        status,
        rejectionReason: status === "rejected" ? "Se eligió otra propuesta con        mejor precio" : undefined,
      });
      proposals.push(proposal);

      // Si está aprobada, actualizar el trabajo
      if (status === "approved") {
        job.status = "in_progress";
        job.doerId = freelancer.id;
        await job.save();
      }
    }
    console.log(`✅ ${proposals.length} propuestas creadas\n`);

    // Crear contratos completados (para ingresos/gastos)
    console.log("📄 Creando contratos completados...");
    const completedContracts = [];

    for (let i = 0; i < 8; i++) {
      const freelancer = freelancers[i % freelancers.length];
      const template = jobTemplates[i % jobTemplates.length];

      const createdDate = new Date();
      createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 60) - 30);

      const startDate = new Date(createdDate);
      startDate.setDate(startDate.getDate() + 1);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 5) + 1);

      const completedAt = new Date(endDate);
      completedAt.setDate(completedAt.getDate() + 1);

      // Crear job completado
      const job = await Job.create({
        title: template.title + " (Completado)",
        description: template.description,
        summary: template.description.substring(0, 100) + "...",
        category: template.category,
        budget: template.budget,
        price: template.budget,
        location: locations[Math.floor(Math.random() * locations.length)],
        startDate,
        endDate,
        status: "completed",
        clientId: cliente.id,
        doer: freelancer.id,
      });

      const price = template.budget;
      const commission        = Math.floor(price * 0.1);
      const totalPrice = price + commission;

      const contract = await Contract.create({
        jobId: job.id,
        clientId: cliente.id,
        doerId: freelancer.id,
        type: "trabajo",
        price,
        commission,
        totalPrice,
        startDate,
        endDate,
        status: "completed",
        completedAt,
        termsAccepted: true,
        termsAcceptedByClient: true,
        termsAcceptedByDoer: true,
        createdAt: createdDate,
      });
      completedContracts.push(contract);

      // Crear review
      await Review.create({
        contractId: contract.id,
        reviewerId: cliente.id,
        reviewedId: freelancer.id,
        rating: Math.floor(Math.random() * 2) + 4, // 4 o 5 estrellas
        comment: "Excelente trabajo, muy profesional y cumplió con        los tiempos.",
        createdAt: completedAt,
      });
    }
    console.log(`✅ ${completedContracts.length} contratos completados creados\n`);

    // Crear contratos activos
    console.log("⏳ Creando contratos activos...");
    const activeContracts = [];

    for (let i = 0; i < 5; i++) {
      const freelancer = freelancers[i % freelancers.length];
      const template = jobTemplates[(i + 5) % jobTemplates.length];

      const createdDate = new Date();
      createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 7));

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 3));

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 5) + 2);

      const statuses = ["pending", "accepted", "in_progress"];
      const status = statuses[i % statuses.length];

      // Crear job activo
      const job = await Job.create({
        title: template.title + " (En        Curso)",
        description: template.description,
        summary: template.description.substring(0, 100) + "...",
        category: template.category,
        budget: template.budget,
        price: template.budget,
        location: locations[Math.floor(Math.random() * locations.length)],
        startDate,
        endDate,
        status: status === "pending" ? "open" : "in_progress",
        clientId: cliente.id,
        doer: freelancer.id,
      });

      const price = template.budget;
      const commission        = Math.floor(price * 0.1);
      const totalPrice = price + commission;

      const contract = await Contract.create({
        jobId: job.id,
        clientId: cliente.id,
        doerId: freelancer.id,
        type: "trabajo",
        price,
        commission,
        totalPrice,
        startDate,
        endDate,
        status,
        termsAccepted: status !== "pending",
        termsAcceptedByClient: status !== "pending",
        termsAcceptedByDoer: status !== "pending",
        createdAt: createdDate,
      });
      activeContracts.push(contract);
    }
    console.log(`✅ ${activeContracts.length} contratos activos creados\n`);

    // Crear conversaciones y mensajes
    console.log("💬 Creando conversaciones de prueba...");
    const conversations = [];

    for (let i = 0; i < 6; i++) {
      const freelancer = freelancers[i % freelancers.length];

      const conversation        = await Conversation.create({
        participants: [cliente.id, freelancer.id],
        type: "direct",
        lastMessage: `Último mensaje con        ${freelancer.name}`,
        lastMessageAt: new Date(),
      });
      conversations.push(conversation);

      // Crear algunos mensajes
      const messages = [
        {
          conversationId: conversation.id,
          senderId: cliente.id,
          message: `Hola ${freelancer.name}, me interesa tu servicio.`,
          type: "text",
          read: true,
          createdAt: new Date(Date.now() - 3600000 * 2),
        },
        {
          conversationId: conversation.id,
          senderId: freelancer.id,
          message: "¡Hola! Con gusto te ayudo. ¿Cuándo necesitas el servicio?",
          type: "text",
          read: true,
          createdAt: new Date(Date.now() - 3600000),
        },
        {
          conversationId: conversation.id,
          senderId: cliente.id,
          message: "Lo necesito para la próxima semana. ¿Tienes disponibilidad?",
          type: "text",
          read: false,
          createdAt: new Date(Date.now() - 1800000),
        },
      ];

      await ChatMessage.bulkCreate(messages);
    }
    console.log(`✅ ${conversations.length} conversaciones creadas\n`);

    // Resumen        console.log("\n📊 RESUMEn        DE DATOS CREADOS:");
    console.log("================================");
    console.log(`👥 Usuarios: ${users.length}`);
    console.log(`   - Freelancers: ${freelancers.length}`);
    console.log(`   - Clientes: 1`);
    console.log(`   - Admins: 1`);
    console.log(`\n💼 Trabajos: ${openJobs.length + completedContracts.length + activeContracts.length}`);
    console.log(`   - Abiertos: ${openJobs.length}`);
    console.log(`   - Completados: ${completedContracts.length}`);
    console.log(`   - En        Curso: ${activeContracts.length}`);
    console.log(`\n📝 Propuestas: ${proposals.length}`);
    console.log(`   - Pendientes: ${proposals.filter(p => p.status === "pending").length}`);
    console.log(`   - Aprobadas: ${proposals.filter(p => p.status === "approved").length}`);
    console.log(`   - Rechazadas: ${proposals.filter(p => p.status === "rejected").length}`);
    console.log(`\n📄 Contratos: ${completedContracts.length + activeContracts.length}`);
    console.log(`   - Completados: ${completedContracts.length}`);
    console.log(`   - Activos: ${activeContracts.length}`);
    console.log(`\n💬 Conversaciones: ${conversations.length}`);
    console.log("\n🔐 CREDENCIALES DE PRUEBA:");
    console.log("================================");
    console.log("Cliente:");
    console.log("  Email: cliente@test.com");
    console.log("  Password: 123456");
    console.log("\nFreelancer (Juan):");
    console.log("  Email: juan@test.com");
    console.log("  Password: 123456");
    console.log("\nAdmin:");
    console.log("  Email: admin@test.com");
    console.log("  Password: 123456");
    console.log("\n✅ Mockup completado exitosamente!\n");

  } catch (error) {
    console.error("❌ Error al crear mockup:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log("🔌 Conexión        cerrada");
    process.exit(0);
  }
}

seedDatabase();


