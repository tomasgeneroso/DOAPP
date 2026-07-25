import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { adminApi } from "@/lib/adminApi";
import { Search, ShieldOff, Pencil, Trash2, Plus, X, Loader2, CheckCircle, Ban } from "lucide-react";

interface BannedIdentity {
  id: string;
  email: string;
  dni?: string | null;
  name?: string | null;
  reason: string;
  userId?: string | null;
  isActive: boolean;
  createdAt: string;
}

type StatusFilter = "active" | "inactive" | "all";

export default function BannedIdentities() {
  const [items, setItems] = useState<BannedIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [editItem, setEditItem] = useState<BannedIdentity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ email: "", dni: "", name: "", reason: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteItem, setDeleteItem] = useState<BannedIdentity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.bannedIdentities.list({
        page: String(page),
        limit: "20",
        search,
        status,
      });
      if (res.success && res.data) {
        setItems(res.data as BannedIdentity[]);
        setTotalPages((res as any).pagination?.totalPages || 1);
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openNew = () => {
    setIsNew(true);
    setEditItem(null);
    setForm({ email: "", dni: "", name: "", reason: "", isActive: true });
    setFormError(null);
  };

  const openEdit = (it: BannedIdentity) => {
    setIsNew(false);
    setEditItem(it);
    setForm({
      email: it.email,
      dni: it.dni || "",
      name: it.name || "",
      reason: it.reason || "",
      isActive: it.isActive,
    });
    setFormError(null);
  };

  const closeForm = () => {
    setEditItem(null);
    setIsNew(false);
    setFormError(null);
  };

  const save = async () => {
    if (!form.email.trim()) {
      setFormError("El email es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = isNew
        ? await adminApi.bannedIdentities.create({
            email: form.email.trim(),
            dni: form.dni.trim() || undefined,
            name: form.name.trim() || undefined,
            reason: form.reason.trim() || undefined,
          })
        : await adminApi.bannedIdentities.update(editItem!.id, {
            email: form.email.trim(),
            dni: form.dni.trim(),
            name: form.name.trim(),
            reason: form.reason.trim(),
            isActive: form.isActive,
          });
      if (res.success) {
        closeForm();
        load();
      } else {
        setFormError(res.message || "No se pudo guardar.");
      }
    } catch (e: any) {
      setFormError(e?.message || "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      const res = await adminApi.bannedIdentities.remove(deleteItem.id);
      if (res.success) {
        setDeleteItem(null);
        load();
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet><title>Identidades baneadas · Admin DoApp</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-6 w-6 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Identidades baneadas</h1>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-semibold"
        >
          <Plus className="h-4 w-4" /> Agregar identidad
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-3xl">
        Registro permanente de emails y DNI de cuentas baneadas o eliminadas. Sobrevive a la eliminación de la
        cuenta y bloquea el re-registro con esa identidad. Marcá una entrada como inactiva (o eliminala) para
        permitir que la persona vuelva a registrarse.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por email, DNI o nombre"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex gap-1">
          {(["active", "inactive", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                status === s
                  ? "bg-sky-500 text-white"
                  : "bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              {s === "active" ? "Activas" : s === "inactive" ? "Inactivas" : "Todas"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-900/50 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-sky-500" />
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                No hay identidades registradas para este filtro.
              </td></tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="text-gray-800 dark:text-gray-200">
                  <td className="px-4 py-3 font-medium">{it.email}</td>
                  <td className="px-4 py-3">{it.dni || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">{it.name || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 max-w-[260px] truncate" title={it.reason}>{it.reason}</td>
                  <td className="px-4 py-3">
                    {it.isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <Ban className="h-3 w-3" /> Bloqueada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <CheckCircle className="h-3 w-3" /> Inactiva
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(it.createdAt).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(it)} title="Editar" className="text-sky-600 hover:text-sky-800 dark:text-sky-400">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteItem(it)} title="Eliminar del registro" className="text-red-600 hover:text-red-800 dark:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-40"
          >Anterior</button>
          <span className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-40"
          >Siguiente</button>
        </div>
      )}

      {/* Edit / New modal */}
      {(editItem || isNew) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {isNew ? "Agregar identidad" : "Editar identidad"}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">DNI</label>
            <input
              value={form.dni}
              onChange={(e) => setForm({ ...form, dni: e.target.value })}
              className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Motivo</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              rows={2}
              className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />

            {!isNew && (
              <label className="flex items-center gap-2 mb-4 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4"
                />
                Bloqueo activo (impide re-registro)
              </label>
            )}

            {formError && <div className="mb-3 text-xs text-red-600 dark:text-red-400">{formError}</div>}

            <div className="flex gap-2">
              <button
                onClick={closeForm}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >Cancelar</button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isNew ? "Agregar" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-red-700 dark:text-red-400 flex items-center gap-2 mb-3">
              <Trash2 className="h-5 w-5" /> Eliminar del registro
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Vas a quitar <strong>{deleteItem.email}</strong> del registro de baneados. Esa identidad podrá
              volver a registrarse. ¿Continuar?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteItem(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >Cancelar</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
