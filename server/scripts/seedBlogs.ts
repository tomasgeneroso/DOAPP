import { initDatabase } from '../config/database.js';
import { BlogPost } from '../models/sql/BlogPost.model.js';
import { User } from '../models/sql/User.model.js';
import { Op } from 'sequelize';

const blogPosts = [
  {
    title: "Cómo Reparar una Canilla que Gotea: Guía Paso a Paso",
    subtitle: "Ahorra agua y dinero aprendiendo a reparar una canilla que gotea en solo 30 minutos",
    content: `<h2>Introducción</h2><p>Una canilla que gotea puede desperdiciar hasta 15 litros de agua al día. Con las herramientas correctas, puedes repararla en menos de una hora.</p>`,
    excerpt: "Aprende a reparar una canilla que gotea con esta guía paso a paso.",
    author: "Carlos Méndez",
    tags: ["reparaciones", "plomería", "ahorro", "mantenimiento"],
    category: "Reparaciones",
    status: "published",
    postType: "official",
    indexable: true,
  },
  {
    title: "Guía Completa: Cómo Limpiar Correctamente el Baño",
    subtitle: "Técnicas profesionales para mantener tu baño impecable y libre de gérmenes",
    content: `<h2>Introducción</h2><p>El baño requiere una limpieza regular y profunda. Aquí te explicamos las técnicas profesionales.</p>`,
    excerpt: "Aprende las técnicas profesionales para limpiar tu baño de arriba a abajo.",
    author: "María González",
    tags: ["limpieza", "baño", "desinfección", "mantenimiento"],
    category: "Limpieza",
    status: "published",
    postType: "official",
    indexable: true,
  },
  {
    title: "Productos de Limpieza Ecológicos Caseros",
    subtitle: "Crea tus propios productos de limpieza naturales, seguros para tu familia y el planeta",
    content: `<h2>Introducción</h2><p>Con ingredientes simples como vinagre, bicarbonato y aceites esenciales puedes crear productos de limpieza efectivos y ecológicos.</p>`,
    excerpt: "Descubre cómo crear productos de limpieza ecológicos en casa con ingredientes naturales.",
    author: "Ana Rodríguez",
    tags: ["ecológico", "limpieza", "natural", "DIY", "sustentable"],
    category: "Productos Ecológicos",
    status: "published",
    postType: "official",
    indexable: true,
  },
];

async function seedBlogs() {
  try {
    await initDatabase();
    console.log('📦 Connected to database');

    const adminUser = await User.findOne({
      where: { adminRole: { [Op.in]: ['owner', 'super_admin', 'admin'] } },
    });

    if (!adminUser) {
      console.error('❌ No admin user found. Create an admin user first.');
      process.exit(1);
    }

    console.log(`👤 Using admin: ${adminUser.name}`);

    await BlogPost.destroy({ where: {}, truncate: true });
    console.log('🗑️  Cleared existing blog posts');

    for (const post of blogPosts) {
      await BlogPost.create({
        ...post,
        createdBy: adminUser.id,
        publishedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      } as any);
      console.log(`   ✅ ${post.title}`);
    }

    console.log('\n🎉 Blog seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding blogs:', error);
    process.exit(1);
  }
}

seedBlogs();
