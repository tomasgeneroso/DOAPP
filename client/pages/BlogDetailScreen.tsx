import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import type { BlogPost } from "../types";
import { getImageUrl } from "../utils/imageUrl";
import {
  ArrowLeft,
  Calendar,
  User,
  Tag,
  Eye,
  Share2,
  Facebook,
  Twitter,
  Linkedin,
  Clock,
  Crown,
  Users,
  Star,
} from "lucide-react";

export default function BlogDetailScreen() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);

  useEffect(() => {
    if (slug) {
      fetchPost();
      fetchRelatedPosts();
    }
  }, [slug]);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/blogs/${slug}`);
      const data = await response.json();

      if (data.success) {
        setPost(data.post);
      } else {
        setError(data.message || "Artículo no encontrado");
      }
    } catch (error) {
      console.error("Error fetching post:", error);
      setError("Error al cargar el artículo");
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedPosts = async () => {
    try {
      const response = await fetch(`/api/blogs/${slug}/related`);
      const data = await response.json();
      if (data.success) {
        setRelatedPosts(data.posts);
      }
    } catch (error) {
      console.error("Error fetching related posts:", error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const shareOnSocial = (platform: string) => {
    const url = window.location.href;
    const title = post?.title || "";
    let shareUrl = "";

    switch (platform) {
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
        break;
      case "linkedin":
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, "_blank", "width=600,height=400");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Enlace copiado al portapapeles");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            {error || "Artículo no encontrado"}
          </h1>
          <Link
            to="/blog"
            className="text-sky-600 hover:text-sky-700 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al blog
          </Link>
        </div>
      </div>
    );
  }

  // Build canonical URL
  const canonicalUrl = post.canonicalUrl || `${window.location.origin}/blog/${post.slug}`;
  const ogImage = post.ogImage || post.coverImage ? getImageUrl(post.ogImage || post.coverImage) : undefined;

  return (
    <>
      <Helmet>
        {/* Basic SEO */}
        <title>{post.metaTitle || post.title} - Blog Doers</title>
        <meta name="description" content={post.metaDescription || post.excerpt} />
        {post.metaKeywords && post.metaKeywords.length > 0 && (
          <meta name="keywords" content={post.metaKeywords.join(', ')} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.metaTitle || post.title} />
        <meta property="og:description" content={post.metaDescription || post.excerpt} />
        <meta property="og:url" content={canonicalUrl} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="article:published_time" content={post.publishedAt || post.createdAt} />
        <meta property="article:author" content={post.author} />
        {post.tags.map(tag => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.metaTitle || post.title} />
        <meta name="twitter:description" content={post.metaDescription || post.excerpt} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}

        {/* Indexability */}
        {post.indexable === false && <meta name="robots" content="noindex, nofollow" />}

        {/* JSON-LD Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.metaDescription || post.excerpt,
            "image": ogImage,
            "datePublished": post.publishedAt || post.createdAt,
            "dateModified": post.updatedAt,
            "author": {
              "@type": post.postType === 'official' ? "Organization" : "Person",
              "name": post.postType === 'official' ? "DOAPP" : post.author,
            },
            "publisher": {
              "@type": "Organization",
              "name": "DOAPP",
              "logo": {
                "@type": "ImageObject",
                "url": `${window.location.origin}/logo.png`
              }
            },
            "mainEntityOfPage": {
              "@type": "WebPage",
              "@id": canonicalUrl
            },
            "wordCount": post.content?.split(/\s+/).length || 0,
            "keywords": post.tags.join(', ')
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {/* Header - Back button only visible on mobile */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 md:hidden">
          <div className="container mx-auto px-4 py-4">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al blog
            </Link>
          </div>
        </div>

        {/* Article */}
        <article className="container mx-auto px-4 py-12 max-w-4xl">
          {/* Cover Image */}
          {post.coverImage && (
            <div className="aspect-video bg-slate-200 dark:bg-slate-700 rounded-2xl overflow-hidden mb-8">
              <img
                src={getImageUrl(post.coverImage)}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Badges Row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Post Type Badge */}
            {post.postType === 'official' ? (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-600 text-white text-sm font-medium rounded-full">
                <Crown className="h-4 w-4" />
                Artículo Oficial
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-full">
                <Users className="h-4 w-4" />
                Comunidad
              </span>
            )}

            {/* Featured Badge */}
            {post.featured && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-sm font-bold rounded-full">
                <Star className="h-4 w-4 fill-current" />
                Destacado
              </span>
            )}

            {/* Category Badge */}
            <span className="inline-block px-4 py-1.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-sm font-medium rounded-full">
              {post.category}
            </span>

            {/* Reading Time */}
            {post.readingTime && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-full">
                <Clock className="h-4 w-4" />
                {post.readingTime} min de lectura
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            {post.title}
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">
            {post.subtitle}
          </p>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-6 pb-8 mb-8 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <User className="h-5 w-5" />
              <span className="font-medium">{post.author}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Calendar className="h-5 w-5" />
              <span>{formatDate(post.publishedAt || post.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Eye className="h-5 w-5" />
              <span>{post.views} vistas</span>
            </div>
            <div className="ml-auto">
              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <Share2 className="h-5 w-5" />
                  Compartir
                </button>

                {showShareMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-10">
                    <button
                      onClick={() => shareOnSocial("facebook")}
                      className="w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Facebook className="h-4 w-4" />
                      Facebook
                    </button>
                    <button
                      onClick={() => shareOnSocial("twitter")}
                      className="w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Twitter className="h-4 w-4" />
                      Twitter
                    </button>
                    <button
                      onClick={() => shareOnSocial("linkedin")}
                      className="w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Linkedin className="h-4 w-4" />
                      LinkedIn
                    </button>
                    <button
                      onClick={copyToClipboard}
                      className="w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Copiar enlace
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div
            className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-slate-900 dark:prose-headings:text-white prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-a:text-sky-600 dark:prose-a:text-sky-400 prose-strong:text-slate-900 dark:prose-strong:text-white prose-code:text-sky-600 dark:prose-code:text-sky-400 prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="h-5 w-5 text-slate-400" />
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/blog?tag=${encodeURIComponent(tag)}`}
                    className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="bg-white dark:bg-slate-800 py-16 border-t border-slate-200 dark:border-slate-700">
            <div className="container mx-auto px-4">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8">
                Artículos Relacionados
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost._id}
                    to={`/blog/${relatedPost.slug}`}
                    className="bg-slate-50 dark:bg-slate-700 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
                  >
                    {relatedPost.coverImage && (
                      <div className="aspect-video bg-slate-200 dark:bg-slate-600 overflow-hidden">
                        <img
                          src={getImageUrl(relatedPost.coverImage)}
                          alt={relatedPost.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <div className="p-6">
                      <span className="inline-block px-3 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-xs font-medium rounded-full mb-3">
                        {relatedPost.category}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                        {relatedPost.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-2">
                        {relatedPost.subtitle}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
