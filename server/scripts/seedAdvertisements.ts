import mongoose from 'mongoose';
import Advertisement from '../models/Advertisement.js';
import User from '../models/User.js';
import { config } from '../config/env.js';

const seedAdvertisements = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    console.log('Connected to MongoDB');

    // Find an admin user to be the advertiser
    let advertiser = await User.findOne({ email: 'admin@doapp.com' });

    if (!advertiser) {
      console.log('Admin user not found, creating one...');
      advertiser = await User.create({
        name: 'Admin Advertiser',
        email: 'admin@doapp.com',
        password: 'password123',
        role: 'admin',
        rating: 5,
        reviewsCount: 0,
        completedJobs: 0,
        isVerified: true,
      });
    }

    // Clear existing advertisements
    await Advertisement.deleteMany({});
    console.log('Cleared existing advertisements');

    // Create sample advertisements
    const advertisements = [
      {
        title: 'Promoción Especial - Servicios de Marketing Digital',
        description: '¡Obtén 30% de descuento en tu primera campaña de marketing digital! Aumenta tu visibilidad online con nuestros servicios profesionales.',
        imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop',
        targetUrl: 'https://ejemplo.com/marketing',
        advertiser: advertiser._id,
        adType: 'model1',
        status: 'active',
        pricePerDay: 50,
        totalPrice: 1500,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        placement: 'jobs_list',
        priority: 5,
      },
      {
        title: 'Curso Online de Programación',
        description: 'Aprende desarrollo web desde cero. Certificación incluida.',
        imageUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=800&fit=crop',
        targetUrl: 'https://ejemplo.com/curso',
        advertiser: advertiser._id,
        adType: 'model2',
        status: 'active',
        pricePerDay: 35,
        totalPrice: 700,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days
        placement: 'jobs_list',
        priority: 3,
      },
      {
        title: 'Herramientas de Diseño',
        description: 'Software profesional para diseñadores',
        imageUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=400&fit=crop',
        targetUrl: 'https://ejemplo.com/diseno',
        advertiser: advertiser._id,
        adType: 'model3',
        status: 'active',
        pricePerDay: 20,
        totalPrice: 400,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days
        placement: 'jobs_list',
        priority: 2,
      },
      {
        title: 'Plataforma de Freelancing',
        description: 'Encuentra los mejores profesionales',
        imageUrl: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400&h=400&fit=crop',
        targetUrl: 'https://ejemplo.com/freelance',
        advertiser: advertiser._id,
        adType: 'model3',
        status: 'active',
        pricePerDay: 20,
        totalPrice: 600,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        placement: 'all',
        priority: 4,
      },
    ];

    const created = await Advertisement.insertMany(advertisements);
    console.log(`✅ Created ${created.length} advertisements`);

    // Show summary
    console.log('\n📊 Summary:');
    console.log(`- Model 1 (3x1 Banner): 1 ad`);
    console.log(`- Model 2 (1x2 Sidebar): 1 ad`);
    console.log(`- Model 3 (1x1 Card): 2 ads`);
    console.log('\n✨ All advertisements are active and approved!');

    mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  } catch (error) {
    console.error('Error seeding advertisements:', error);
    process.exit(1);
  }
};

seedAdvertisements();
