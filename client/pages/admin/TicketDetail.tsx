import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import type { Ticket } from "@/types/admin";
import { ArrowLeft, Send } from "lucide-react";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id) loadTicket();
  }, [id]);

  const loadTicket = async () => {
    try {
      const res = await adminApi.tickets.get(id!);
      if (res.success && res.data) {
        setTicket(res.data);
      }
    } catch (error) {
      console.error("Error loading ticket:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !id) return;

    setSending(true);
    try {
      await adminApi.tickets.addMessage(id, message, false);
      setMessage("");
      await loadTicket();
    } catch (error) {
      alert("Error al enviar mensaje");
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!id) return;
    const resolution = prompt("Resolución del ticket:");
    if (!resolution) return;

    try {
      await adminApi.tickets.close(id, resolution);
      alert("Ticket cerrado correctamente");
      await loadTicket();
    } catch (error) {
      alert("Error al cerrar ticket");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!ticket) {
    return <div>Ticket no encontrado</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/admin/tickets")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5" />
          Volver a tickets
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Ticket {ticket.ticketNumber}
            </h1>
            <p className="text-gray-600 mt-2">{ticket.subject}</p>
          </div>
          {ticket.status !== "closed" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Cerrar Ticket
            </button>
          )}
        </div>
      </div>

      {/* Ticket Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Estado</h3>
          <p className="text-lg font-semibold text-gray-900">{ticket.status}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Prioridad</h3>
          <p className="text-lg font-semibold text-gray-900">{ticket.priority}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Categoría</h3>
          <p className="text-lg font-semibold text-gray-900">{ticket.category}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Conversación</h2>
        <div className="space-y-6">
          {ticket.messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.author.adminRole ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-2xl ${
                  msg.author.adminRole
                    ? "bg-sky-100 text-sky-900"
                    : "bg-gray-100 text-gray-900"
                } rounded-lg p-4`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold">{msg.author.name}</span>
                  {msg.author.adminRole && (
                    <span className="text-xs px-2 py-1 bg-sky-200 rounded">
                      {msg.author.adminRole}
                    </span>
                  )}
                  {msg.isInternal && (
                    <span className="text-xs px-2 py-1 bg-red-200 rounded">
                      INTERNO
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(msg.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reply Form */}
      {ticket.status !== "closed" && (
        <form onSubmit={handleSendMessage} className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Responder</h3>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe tu respuesta..."
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
