import { useEffect, useState, useCallback } from "react";
import { getImageUrl } from "@/utils/imageUrl";
import ConfirmModal from "@/components/ui/ConfirmModal";
import {
  Plus, Search, Edit2, Trash2, Pause, Play, Eye, X, Loader2, FileText, Globe, Users, Star,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const CATEGORIES = ["Limpieza", "Reparaciones", "Mantenimiento", "Productos Ecológicos", "Hogar", "Jardín", "Tips", "Otros"];

interface BlogPost {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  content: string;
  excerpt: string;
  author: string;
  coverImage?: string;
  tags: string[];
  category: string;
  status: "draft" | "published" | "archived";
  postType: "official" | "user";
  views: number;
  featured: boolean;
  publishedAt?: string;
  createdAt: string;
  creator?: { name: string; email: string };
}

const emptyForm = {
  title: "", subtitle: "", content: "", excerpt: "", author: "DOAPP",
  coverImage: "", tags: "", category: "Tips", status: "draft" as BlogPost["status"], postType: "official" as BlogPost["postType"],
};

export default function BlogManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "official" | "user">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState<{ text: string; tone: "danger" | "success" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Editor modal
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (typeFilter) params.set("postType", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${API_URL}/admin/blogs?${params}`, { headers: authHeaders(), credentials: "include" });
      const data = await res.json();
      if (data.success) setPosts(data.posts || []);
      else setNotice({ text: data.message || "No se pudieron cargar los artículos", tone: "danger" });
    } catch {
      setNotice({ text: "Error al cargar los artículos", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(emptyForm); setEditing(null); setCreating(true); };
  const openEdit = (p: BlogPost) => {
    setForm({
      title: p.title, subtitle: p.subtitle, content: p.content, excerpt: p.excerpt, author: p.author,
      coverImage: p.coverImage || "", tags: (p.tags || []).join(", "), category: p.category,
      status: p.status, postType: p.postType,
    });
    setEditing(p); setCreating(false);
  };
  const closeEditor = () => { setEditing(null); setCreating(false); };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setNotice({ text: "Título y contenido son obligatorios", tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const url = editing ? `${API_URL}/admin/blogs/${editing.id}` : `${API_URL}/admin/blogs`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setNotice({ text: editing ? "Artículo actualizado" : "Artículo creado", tone: "success" });
        closeEditor();
        load();
      } else {
        setNotice({ text: data.message || data.errors?.[0]?.msg || "No se pudo guardar", tone: "danger" });
      }
    } catch {
      setNotice({ text: "Error al guardar el artículo", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (p: BlogPost, status: BlogPost["status"]) => {
    try {
      const res = await fetch(`${API_URL}/admin/blogs/${p.id}`, {
        method: "PUT", headers: authHeaders(), credentials: "include",
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)));
      else setNotice({ text: data.message || "No se pudo cambiar el estado", tone: "danger" });
    } catch {
      setNotice({ text: "Error al cambiar el estado", tone: "danger" });
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/admin/blogs/${confirmDelete.id}`, {
        method: "DELETE", headers: authHeaders(), credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPosts((prev) => prev.filter((x) => x.id !== confirmDelete.id));
        setNotice({ text: "Artículo eliminado", tone: "success" });
      } else setNotice({ text: data.message || "No se pudo eliminar", tone: "danger" });
    } catch {
      setNotice({ text: "Error al eliminar el artículo", tone: "danger" });
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const statusBadge = (s: BlogPost["status"]) => {
    const map: Record<string, string> = {
      published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      archived: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
    };
    const label: Record<string, string> = { published: "Publicado", draft: "Borrador", archived: "Pausado" };
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${map[s]}`}>{label[s]}</span>;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-sky-600" /> Blog
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Administrá los artículos de la plataforma y de la comunidad
          </p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Nuevo artículo
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, autor o slug…"
            className="w-full pl-10 pr-3 py-2 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-sm text-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-700 p-1">
          {([["", "Todos"], ["official", "Plataforma"], ["user", "Usuarios"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val as any)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                typeFilter === val ? "bg-white dark:bg-slate-800 text-sky-600 shadow-sm" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-sm text-slate-700 dark:text-slate-200"
        >
          <option value="">Todos los estados</option>
          <option value="published">Publicados</option>
          <option value="draft">Borradores</option>
          <option value="archived">Pausados</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-slate-500 dark:text-slate-400">No hay artículos que coincidan con el filtro</div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {posts.map((p) => (
              <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <div className="h-14 w-20 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                  {p.coverImage && <img src={getImageUrl(p.coverImage)} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium text-slate-900 dark:text-white truncate">{p.title}</h3>
                    {p.featured && <Star className="h-3.5 w-3.5 text-amber-400 fill-current" />}
                    {statusBadge(p.status)}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                      p.postType === "official"
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    }`}>
                      {p.postType === "official" ? <><Globe className="h-3 w-3" /> Plataforma</> : <><Users className="h-3 w-3" /> Usuario</>}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                    {p.category} · {p.author} · {p.views} vistas
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" title="Ver" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-sky-600"><Eye className="h-4 w-4" /></a>
                  {p.status === "published" ? (
                    <button onClick={() => setStatus(p, "archived")} title="Pausar" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-amber-600"><Pause className="h-4 w-4" /></button>
                  ) : (
                    <button onClick={() => setStatus(p, "published")} title="Publicar" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-green-600"><Play className="h-4 w-4" /></button>
                  )}
                  <button onClick={() => openEdit(p)} title="Editar" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-sky-600"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => setConfirmDelete(p)} title="Eliminar" className="p-2 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeEditor}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editing ? "Editar artículo" : "Nuevo artículo"}</h2>
              <button onClick={closeEditor} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Título *"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} /></Field>
              <Field label="Subtítulo"><input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Autor"><input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className={inputCls} /></Field>
                <Field label="Categoría">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tipo">
                  <select value={form.postType} onChange={(e) => setForm({ ...form, postType: e.target.value as any })} className={inputCls}>
                    <option value="official">Plataforma (oficial)</option>
                    <option value="user">Comunidad (usuario)</option>
                  </select>
                </Field>
                <Field label="Estado">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className={inputCls}>
                    <option value="draft">Borrador</option>
                    <option value="published">Publicado</option>
                    <option value="archived">Pausado</option>
                  </select>
                </Field>
              </div>
              <Field label="Imagen de portada (URL)"><input value={form.coverImage} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} className={inputCls} placeholder="/uploads/... o https://…" /></Field>
              <Field label="Etiquetas (separadas por coma)"><input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={inputCls} /></Field>
              <Field label="Extracto"><textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} className={inputCls} /></Field>
              <Field label="Contenido *"><textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={10} className={inputCls} /></Field>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-200 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-800">
              <button onClick={closeEditor} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Guardar cambios" : "Crear artículo"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        tone="danger"
        loading={deleting}
        title="Eliminar artículo"
        message={`¿Seguro que querés eliminar "${confirmDelete?.title}"? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        open={!!notice}
        tone={notice?.tone || "danger"}
        title={notice?.tone === "success" ? "Listo" : "Atención"}
        message={notice?.text || ""}
        confirmLabel="Aceptar"
        hideCancel
        onConfirm={() => setNotice(null)}
        onClose={() => setNotice(null)}
      />
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
