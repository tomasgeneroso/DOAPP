import { initDatabase } from '../config/database.js';
import { Op } from 'sequelize';
import { BlogPost } from '../models/sql/BlogPost.model.js';
import { User } from '../models/sql/User.model.js';
import { betaPost } from '../../shared/content/betaPost.js';

/**
 * Publishes (or refreshes) the article the beta banner links to.
 *
 *   npx tsx server/scripts/seedBetaPost.ts
 *
 * Idempotent: run it again after editing shared/content/betaPost.ts and the
 * published post is updated in place, keeping its slug and its views. The
 * banner links to that slug, so the copy and the article it points at cannot
 * drift — which matters here, because the banner is where the commercial claim
 * is made and the article is where its limits are.
 */
(async () => {
  await initDatabase();

  // The post needs an author on record. Use an owner/admin rather than
  // inventing one, so the byline points at a real account.
  const author = await User.findOne({
    where: { adminRole: { [Op.in]: ['owner', 'super_admin', 'admin'] } },
    order: [['createdAt', 'ASC']],
  });
  if (!author) {
    console.error('❌ No hay ningun usuario admin/owner al que atribuir la nota.');
    console.error('   Asigna uno primero: npx tsx server/scripts/assignAdminRoleSQL.ts <email> owner');
    process.exit(1);
  }

  const existing = await BlogPost.findOne({ where: { slug: betaPost.slug } });

  const fields = {
    title: betaPost.title,
    subtitle: betaPost.subtitle,
    excerpt: betaPost.excerpt,
    content: betaPost.content,
    slug: betaPost.slug,
    author: 'DoApp',
    category: betaPost.category,
    tags: betaPost.tags,
    metaTitle: betaPost.metaTitle.slice(0, 70),
    metaDescription: betaPost.metaDescription.slice(0, 160),
    keyTakeaways: betaPost.keyTakeaways,
    faq: betaPost.faq,
    status: 'published' as const,
    postType: 'official' as const,
    // Written by a person, not the content agent: it must not show up in the
    // approval queue or be counted as agent output.
    generatedBy: 'human' as const,
    publishedAt: existing?.publishedAt ?? new Date(),
    createdBy: existing?.createdBy ?? author.id,
  };

  if (existing) {
    await existing.update(fields as any);
    console.log(`✅ Actualizado: /blog/${betaPost.slug}`);
  } else {
    await BlogPost.create(fields as any);
    console.log(`✅ Publicado: /blog/${betaPost.slug}`);
  }

  console.log(`   ${betaPost.keyTakeaways.length} respuestas directas · ${betaPost.faq.length} preguntas frecuentes`);
  process.exit(0);
})().catch((e) => {
  console.error('❌ No se pudo publicar la nota:', e.message);
  process.exit(1);
});
