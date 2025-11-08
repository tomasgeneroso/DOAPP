import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import { ArrowLeft, Send, Search } from "lucide-react";

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface Contract {
  _id: string;
  job?: {
    _id: string;
    title: string;
  };
  client?: {
    _id: string;
    name: string;
  };
  doer?: {
    _id: string;
    name: string;
  };
  price: number;
  status: string;
}

export default function AdminCreateTicket() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [formData, setFormData] = useState({
    subject: "",
    category: "technical",
    priority: "medium",
    message: "",
    contractId: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchUsers();
    }
  }, [searchQuery]);

  useEffect(() => {
    if (selectedUser) {
      loadUserContracts();
    }
  }, [selectedUser]);

  const searchUsers = async () => {
    try {
      const response = await adminApi.users.list({ search: searchQuery, limit: "10" });
      if (response.success && response.data) {
        setUsers(response.data as any || []);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    }
  };

  const loadUserContracts = async () => {
    if (!selectedUser) return;

    try {
      const response = await adminApi.contracts.list({ userId: selectedUser._id });
      if (response.success && response.data) {
        setContracts(response.data as any || []);
      }
    } catch (error) {
      console.error("Error loading contracts:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) {
      alert("Debes seleccionar un usuario");
      return;
    }

    try {
      setSubmitting(true);

      const ticketData: any = {
        userId: selectedUser._id,
        ...formData,
      };

      // Add contractId if selected
      if (selectedContract) {
        ticketData.contractId = selectedContract._id;
      }

      const response = await fetch("/api/admin/tickets/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(ticketData),
      });

      const data = await response.json();

      if (data.success) {
        alert("Ticket creado exitosamente");
        navigate("/admin/tickets");
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error: any) {
      console.error("Error creating ticket:", error);
      alert(error.message || "Error al crear el ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/admin")}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Crear Ticket (Admin)
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Crear un ticket de soporte en nombre de un usuario
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* User Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Seleccionar Usuario
          </h3>

          {!selectedUser ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowUserSelector(true);
                  }}
                  placeholder="Buscar usuario por nombre o email..."
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>

              {showUserSelector && users.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                  {users.map((user) => (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setShowUserSelector(false);
                        setSearchQuery("");
                      }}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-sky-600 dark:text-sky-400">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-500 rounded-lg">
              <div className="flex items-center gap-3">
                {selectedUser.avatar ? (
                  <img
                    src={selectedUser.avatar}
                    alt={selectedUser.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/50 rounded-full flex items-center justify-center">
                    <span className="text-lg font-bold text-sky-600 dark:text-sky-400">
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {selectedUser.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setSelectedContract(null);
                  setContracts([]);
                }}
                className="px-4 py-2 text-sm text-sky-600 dark:text-sky-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition"
              >
                Cambiar
              </button>
            </div>
          )}
        </div>

        {/* Contract Selector (Optional) */}
        {selectedUser && contracts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Contrato Relacionado (Opcional)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Si el ticket está relacionado con un contrato específico, selecciónalo aquí
            </p>

            {selectedContract ? (
              <div className="p-4 bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-500 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {selectedContract.job?.title || 'Contrato sin título'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <span>Cliente: {selectedContract.client?.name || 'N/A'}</span>
                      <span>•</span>
                      <span>Proveedor: {selectedContract.doer?.name || 'N/A'}</span>
                      <span>•</span>
                      <span className="font-semibold">${selectedContract.price}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedContract(null)}
                    className="ml-4 px-4 py-2 text-sm text-sky-600 dark:text-sky-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {contracts.map((contract) => (
                  <button
                    key={contract._id}
                    type="button"
                    onClick={() => setSelectedContract(contract)}
                    className="w-full p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-sky-500 dark:hover:border-sky-500 transition text-left"
                  >
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {contract.job?.title || 'Contrato sin título'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <span>Cliente: {contract.client?.name || 'N/A'}</span>
                      <span>•</span>
                      <span>Proveedor: {contract.doer?.name || 'N/A'}</span>
                      <span>•</span>
                      <span className="font-semibold">${contract.price}</span>
                    </div>
                    <div className="mt-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {contract.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ticket Form */}
        {selectedUser && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Detalles del Ticket
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Asunto *
              </label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="Ej: Problema con el pago"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categoría *
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                >
                  <option value="technical">Técnico</option>
                  <option value="billing">Facturación</option>
                  <option value="account">Cuenta</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Prioridad *
                </label>
                <select
                  required
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Mensaje *
              </label>
              <textarea
                required
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={6}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="Describe el problema o consulta del usuario..."
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
                {submitting ? "Creando..." : "Crear Ticket"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
