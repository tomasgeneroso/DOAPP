import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import type { BlogPost } from "../types";
import { getImageUrl } from "../utils/imageUrl";
import { BookOpen, Calendar, User, Search, Filter, Clock, Star, Crown, Users, PenSquare } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function BlogsScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>(""); // 'official', 'user', or '' for all
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchBlogs();
  }, [selectedCategory, selectedTag, selectedType, searchQuery, currentPage]);

  useEffect(() => {
    fetchCategories();
    fetchTags();
  }, []);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "9",
      });

      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedTag) params.append("tag", selectedTag);
      if (selectedType) params.append("type", selectedType);
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/blogs?${params}`);
      const data = await response.json();

      if (data.success) {
        setPosts(data.posts);
        setTotalPages(data.pagination.pages);
      } else {
        setError(data.message || "Error al cargar artículos");
      }
    } catch (error) {
      console.error("Error fetching blogs:", error);
      setError("Error al cargar artículos");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`/api/blogs/categories`);
      const data = await response.json();
      if (data.success) {
        setCategories(data.categories);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch(`/api/blogs/tags`);
      const data = await response.json();
      if (data.success) {
        setTags(data.tags);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedTag("");
    setSelectedType("");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <>
      <Helmet>
        <title>Blog - Doers</title>
        <meta
          name="description"
          content="Aprende tips, trucos y guías prácticas para el hogar, reparaciones, limpieza y más"
        />
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-sky-600 to-blue-600 text-white py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">Blog de Doers</h1>
              <p className="text-xl text-sky-100 mb-6">
                Tips, guías y consejos para tu hogar
              </p>

              {/* Create Post Button */}
              {user && (
                <Link
                  to="/blog/create"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-sky-600 font-semibold rounded-xl hover:bg-sky-50 transition-colors mb-6"
                >
                  <PenSquare className="h-5 w-5" />
                  Escribir un artículo
                </Link>
              )}

              {/* Search */}
              <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar artículos..."
                  className="w-full px-6 py-4 pr-12 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-white"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                >
                  <Search className="h-5 w-5" />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar */}
            <aside className="lg:w-80 flex-shrink-0">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-md sticky top-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filtros
                  </h3>
                  {(selectedCategory || selectedTag || selectedType) && (
                    <button
                      onClick={clearFilters}
                      className="text-sm text-sky-600 hover:text-sky-700"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {/* Post Type Filter */}
                <div className="mb-8">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-3">
                    Tipo de contenido
                  </h4>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setSelectedType("");
                        setCurrentPage(1);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        selectedType === ""
                          ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <BookOpen className="h-4 w-4" />
                      Todos los artículos
                    </button>
                    <button
                      onClick={() => {
                        setSelectedType("official");
                        setCurrentPage(1);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        selectedType === "official"
                          ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <Crown className="h-4 w-4" />
                      Oficiales (DOAPP)
                    </button>
                    <button
                      onClick={() => {
                        setSelectedType("user");
                        setCurrentPage(1);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        selectedType === "user"
                          ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <Users className="h-4 w-4" />
                      Comunidad
                    </button>
                  </div>
                </div>

                {/* Categories */}
                <div className="mb-8">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-3">
                    Categorías
                  </h4>
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <button
                        key={category.name}
                        onClick={() => {
                          setSelectedCategory(
                            selectedCategory === category.name ? "" : category.name
                          );
                          setCurrentPage(1);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          selectedCategory === category.name
                            ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 font-medium"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{category.name}</span>
                          <span className="text-sm">{category.count}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-3">
                    Etiquetas Populares
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {tags.slice(0, 10).map((tag) => (
                      <button
                        key={tag.name}
                        onClick={() => {
                          setSelectedTag(selectedTag === tag.name ? "" : tag.name);
                          setCurrentPage(1);
                        }}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          selectedTag === tag.name
                            ? "bg-sky-600 text-white"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        #{tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Posts Grid */}
            <main className="flex-1">
              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-20">
                  <BookOpen className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                    No se encontraron artículos
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    Intenta ajustar los filtros de búsqueda
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                    {posts.map((post) => (
                      <Link
                        key={post._id}
                        to={`/blog/${post.slug}`}
                        className={`bg-white dark:bg-slate-800 rounded-2xl shadow-md hover:shadow-xl transition-shadow overflow-hidden group relative ${
                          post.featured ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''
                        }`}
                      >
                        {/* Featured Badge */}
                        {post.featured && (
                          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2 py-1 bg-amber-500 text-white text-xs font-bold rounded-full">
                            <Star className="h-3 w-3 fill-current" />
                            Destacado
                          </div>
                        )}

                        {/* Post Type Badge */}
                        <div className="absolute top-3 right-3 z-10">
                          {post.postType === 'official' ? (
                            <span className="flex items-center gap-1 px-2 py-1 bg-sky-600 text-white text-xs font-medium rounded-full">
                              <Crown className="h-3 w-3" />
                              Oficial
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-1 bg-purple-600 text-white text-xs font-medium rounded-full">
                              <Users className="h-3 w-3" />
                              Comunidad
                            </span>
                          )}
                        </div>

                        {post.coverImage ? (
                          <div className="aspect-video bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <img
                              src={getImageUrl(post.coverImage)}
                              alt={post.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 flex items-center justify-center">
                            <BookOpen className="h-12 w-12 text-sky-400 dark:text-sky-500" />
                          </div>
                        )}

                        <div className="p-6">
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <span className="px-3 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-xs font-medium rounded-full">
                              {post.category}
                            </span>
                            {post.readingTime && (
                              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <Clock className="h-3 w-3" />
                                {post.readingTime} min
                              </span>
                            )}
                          </div>

                          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                            {post.title}
                          </h2>

                          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4 line-clamp-2">
                            {post.subtitle}
                          </p>

                          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                            {/* Author with avatar */}
                            <div className="flex items-center gap-2">
                              {post.creator?.avatar ? (
                                <img
                                  src={getImageUrl(post.creator.avatar)}
                                  alt={post.creator.name}
                                  className="h-5 w-5 rounded-full object-cover"
                                />
                              ) : (
                                <User className="h-3 w-3" />
                              )}
                              <span>{post.creator?.name || post.author}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {formatDate(post.publishedAt || post.createdAt)}
                              </span>
                            </div>
                          </div>

                          {post.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-4">
                              {post.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>

                      <div className="flex items-center gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(
                            (page) =>
                              page === 1 ||
                              page === totalPages ||
                              Math.abs(page - currentPage) <= 1
                          )
                          .map((page, index, array) => (
                            <>
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span className="text-slate-400">...</span>
                              )}
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-10 h-10 rounded-lg ${
                                  currentPage === page
                                    ? "bg-sky-600 text-white"
                                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                                }`}
                              >
                                {page}
                              </button>
                            </>
                          ))}
                      </div>

                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
