import { initDatabase } from '../config/database.js';
import { Advertisement } from '../models/sql/Advertisement.model.js';
import { User } from '../models/sql/User.model.js';

const seedAdvertisements = async () => {
  try {
    await initDatabase();
    console.log('📦 Connected to database');

    let advertiser = await User.findOne({ where: { email: 'admin@doapp.com' } });

    if (!advertiser) {
      console.log('Admin user not found, creating one...');
      advertiser = await User.create({
        name: 'Admin Advertiser',
        email: 'admin@doapp.com',
        password: 'password123',
        role: 'client',
        rating: 5,
        reviewsCount: 0,
        completedJobs: 0,
        isVerified: true,
      } as any);
    }

    await Advertisement.destroy({ where: {}, truncate: true });
    console.log('🗑️  Cleared existing advertisements');

    const ads = [
      {
        title: 'Promoción Especial - Marketing Digital',
        description: '¡Obtén 30% de descuento en tu primera campaña de marketing digital!',
        imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop',
        targetUrl: 'https://ejemplo.com/marketing',
        advertiserId: advertiser.id,
        adType: 'model1',
        status: 'active',
        pricePerDay: 50,
        totalPrice: 1500,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        placement: 'jobs_list',
        priority: 5,
      },
      {
        title: 'Curso Online de Programación',
        description: 'Aprende desarrollo web desde cero. Certificación incluida.',
        imageUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=800&fit=crop',
        targetUrl: 'https://ejemplo.com/curso',
        advertiserId: advertiser.id,
        adType: 'model2',
        status: 'active',
        pricePerDay: 35,
        totalPrice: 700,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        placement: 'jobs_list',
        priority: 3,
      },
      {
        title: 'Herramientas de Diseño',
        description: 'Software profesional para diseñadores freelance.',
        imageUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=400&fit=crop',
        targetUrl: 'https://ejemplo.com/diseno',
        advertiserId: advertiser.id,
        adType: 'model3',
        status: 'active',
        pricePerDay: 20,
        totalPrice: 400,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        placement: 'jobs_list',
        priority: 2,
      },
      {
        title: 'Plataforma de Freelancing',
        description: 'Encuentra los mejores profesionales para tu proyecto.',
        imageUrl: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400&h=400&fit=crop',
        targetUrl: 'https://ejemplo.com/freelance',
        advertiserId: advertiser.id,
        adType: 'model3',
        status: 'active',
        pricePerDay: 20,
        totalPrice: 600,
        paymentStatus: 'paid',
        isApproved: true,
        approvedAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        placement: 'all',
        priority: 4,
      },
    ];

    for (const ad of ads) {
      await Advertisement.create(ad as any);
      console.log(`   ✅ ${ad.title}`);
    }

    console.log('\n📊 Summary:');
    console.log('- Model 1 (3x1 Banner): 1 ad');
    console.log('- Model 2 (1x2 Sidebar): 1 ad');
    console.log('- Model 3 (1x1 Card): 2 ads');
    console.log('\n✨ All advertisements are active and approved!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding advertisements:', error);
    process.exit(1);
  }
};

seedAdvertisements();
