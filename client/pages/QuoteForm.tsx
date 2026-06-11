import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, FileText, Send, ArrowLeft, Briefcase, X, Search, Layers } from 'lucide-react';
import type { Quote, QuoteItem } from '../types/index';

// ─── Quote templates by trade ────────────────────────────────────────────────
interface QuoteTemplate {
  label: string;
  emoji: string;
  title: string;
  items: Array<{ qty: number; description: string; unitPrice: number }>;
}

const QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
  const { t } = useTranslation();
    label: 'Plomería', emoji: '🔧',
    title: 'Servicio de plomería',
    items: [
      { qty: 1, description: 'Mano de obra (por hora)', unitPrice: 0 },
      { qty: 1, description: 'Materiales (caños, teflon, sellador)', unitPrice: 0 },
      { qty: 1, description: 'Traslado y viáticos', unitPrice: 0 },
    ],
  },
  {
    label: 'Electricidad', emoji: '⚡',
    title: 'Servicio eléctrico',
    items: [
      { qty: 1, description: 'Mano de obra electricista (horas)', unitPrice: 0 },
      { qty: 1, description: 'Materiales (cables, llaves, toma)', unitPrice: 0 },
      { qty: 1, description: 'Insumos varios', unitPrice: 0 },
    ],
  },
  {
    label: 'Pintura', emoji: '🎨',
    title: 'Servicio de pintura',
    items: [
      { qty: 1, description: 'Mano de obra pintura interior (m²)', unitPrice: 0 },
      { qty: 1, description: 'Pintura látex (litros)', unitPrice: 0 },
      { qty: 1, description: 'Sellador / enduido', unitPrice: 0 },
      { qty: 1, description: 'Rodillos, pinceles y plástico protector', unitPrice: 0 },
    ],
  },
  {
    label: 'Construcción', emoji: '🏗️',
    title: 'Trabajo de construcción',
    items: [
      { qty: 1, description: 'Mano de obra albañilería', unitPrice: 0 },
      { qty: 1, description: 'Cemento Portland (bolsas)', unitPrice: 0 },
      { qty: 1, description: 'Arena fina (m³)', unitPrice: 0 },
      { qty: 1, description: 'Materiales varios (ladrillos, varillas)', unitPrice: 0 },
    ],
  },
  {
    label: 'Carpintería', emoji: '🪵',
    title: 'Servicio de carpintería',
    items: [
      { qty: 1, description: 'Mano de obra carpintería', unitPrice: 0 },
      { qty: 1, description: 'Madera / MDF (m²)', unitPrice: 0 },
      { qty: 1, description: 'Herrajes y accesorios', unitPrice: 0 },
      { qty: 1, description: 'Barniz / laca / terminación', unitPrice: 0 },
    ],
  },
  {
    label: 'Limpieza', emoji: '🧹',
    title: 'Servicio de limpieza',
    items: [
      { qty: 1, description: 'Limpieza profunda (horas)', unitPrice: 0 },
      { qty: 1, description: 'Productos de limpieza', unitPrice: 0 },
      { qty: 1, description: 'Limpieza de vidrios', unitPrice: 0 },
    ],
  },
  {
    label: 'Mudanza', emoji: '📦',
    title: 'Servicio de mudanza',
    items: [
      { qty: 1, description: 'Flete / camión', unitPrice: 0 },
      { qty: 1, description: 'Mano de obra carga y descarga', unitPrice: 0 },
      { qty: 1, description: 'Materiales de embalaje (cajas, film)', unitPrice: 0 },
      { qty: 1, description: 'Seguro de traslado', unitPrice: 0 },
    ],
  },
  {
    label: 'Jardinería', emoji: '🌿',
    title: 'Servicio de jardinería',
    items: [
      { qty: 1, description: 'Mano de obra (horas)', unitPrice: 0 },
      { qty: 1, description: 'Corte de césped', unitPrice: 0 },
      { qty: 1, description: 'Plantas / semillas / sustrato', unitPrice: 0 },
      { qty: 1, description: 'Fertilizante y herbicida', unitPrice: 0 },
    ],
  },
  {
    label: 'Diseño web', emoji: '💻',
    title: 'Desarrollo / diseño web',
    items: [
      { qty: 1, description: 'Diseño UI/UX', unitPrice: 0 },
      { qty: 1, description: 'Desarrollo frontend', unitPrice: 0 },
      { qty: 1, description: 'Desarrollo backend / base de datos', unitPrice: 0 },
      { qty: 1, description: 'Testing y correcciones', unitPrice: 0 },
    ],
  },
  {
    label: 'Fotografía', emoji: '📷',
    title: 'Servicio fotográfico',
    items: [
      { qty: 1, description: 'Sesión fotográfica (horas)', unitPrice: 0 },
      { qty: 1, description: 'Edición y retoque', unitPrice: 0 },
      { qty: 1, description: 'Entrega de archivos digitales', unitPrice: 0 },
    ],
  },
];

const API_URL = import.meta.env.VITE_API_URL || '/api';

const CONCEPT_EXAMPLES = [
  'Plomería', 'Armado de muebles', 'Envío de mercadería', 'Pintura interior',
  'Electricidad', 'Limpieza profunda', 'Reparación de electrodomésticos',
  'Diseño gráfico', 'Desarrollo web', 'Fotografía', 'Jardinería',
  'Mudanza', 'Carpintería', 'Instalación de aires acondicionados', 'Mantenimiento general',
];

const emptyItem = (): QuoteItem => ({ qty: 1, description: '', unitPrice: 0, amount: 0 });

export default function QuoteForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const recipientIdParam = searchParams.get('recipientId') || '';
  const conversationIdParam = searchParams.get('conversationId') || '';
  const jobIdParam = searchParams.get('jobId') || '';
  const applyMode = searchParams.get('apply') === 'true';

  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [taxRate, setTaxRate] = useState(21);
  const [otherTaxes, setOtherTaxes] = useState<Array<{ name: string; rate: number; amount: number }>>([]);
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [recipientId, setRecipientId] = useState(recipientIdParam);
  const [recipientName, setRecipientName] = useState('');
  const [jobId, setJobId] = useState(jobIdParam);
  const [conversationId, setConversationId] = useState(conversationIdParam);
  const [senderInfo, setSenderInfo] = useState({ name: user?.name || '', address: '', city: '', cuit: '', email: user?.email || '' });
  const [recipientInfo, setRecipientInfo] = useState({ name: '', address: '', city: '', cuit: '' });
  const [jobTitle, setJobTitle] = useState('');
  const [error, setError] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [jobResults, setJobResults] = useState<any[]>([]);
  const [showJobSearch, setShowJobSearch] = useState(false);
  const jobSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isEdit && id) loadQuote(id);
  }, [id]);

  useEffect(() => {
    if (recipientIdParam) fetchRecipient(recipientIdParam);
  }, [recipientIdParam]);

  useEffect(() => {
    if (jobIdParam) {
      fetch(`${API_URL}/jobs/${jobIdParam}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (d.success && d.job) {
            setJobTitle(d.job.title);
            if (applyMode && !isEdit) setTitle(`Cotización para: ${d.job.title}`);
          }
        })
        .catch(() => {});
    }
  }, [jobIdParam]);

  const searchJobs = async (query: string) => {
    if (!query.trim()) { setJobResults([]); return; }
    try {
      const res = await fetch(`${API_URL}/jobs?status=open&query=${encodeURIComponent(query)}&limit=8`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setJobResults(data.jobs || []);
    } catch {}
  };

  const handleJobSearchChange = (q: string) => {
    setJobSearch(q);
    if (jobSearchRef.current) clearTimeout(jobSearchRef.current);
    jobSearchRef.current = setTimeout(() => searchJobs(q), 350);
  };

  const selectJob = (job: any) => {
    setJobId(job.id);
    setJobTitle(job.title);
    setTitle(`Cotización para: ${job.title}`);
    setJobSearch('');
    setJobResults([]);
    setShowJobSearch(false);
    // If recipient not set, set to job client
    if (!recipientId && job.clientId) {
      setRecipientId(job.clientId);
      if (job.client?.name) setRecipientName(job.client.name);
    }
  };

  const fetchRecipient = async (rid: string) => {
    try {
      const res = await fetch(`${API_URL}/users/${rid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.user) {
        setRecipientName(data.user.name);
        setRecipientInfo(prev => ({ ...prev, name: data.user.name, email: data.user.email || '' }));
      }
    } catch {}
  };

  const loadQuote = async (quoteId: string) => {
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        const q: Quote = data.data;
        setTitle(q.title);
        setItems(q.items);
        setTaxRate(q.taxRate);
        setOtherTaxes(q.otherTaxes || []);
        setNotes(q.notes || '');
        setPaymentTerms(q.paymentTerms || '');
        setValidUntil(q.validUntil ? q.validUntil.substring(0, 10) : '');
        setRecipientId(q.recipientId);
        setJobId(q.jobId || '');
        setConversationId(q.conversationId || '');
        if (q.senderInfo) setSenderInfo({ name: q.senderInfo.name || '', address: q.senderInfo.address || '', city: q.senderInfo.city || '', cuit: q.senderInfo.cuit || '', email: q.senderInfo.email || '' });
        if (q.recipientInfo) setRecipientInfo({ name: q.recipientInfo.name || '', address: q.recipientInfo.address || '', city: q.recipientInfo.city || '', cuit: q.recipientInfo.cuit || '' });
        if (q.recipient) setRecipientName(q.recipient.name);
      }
    } catch {}
    setLoading(false);
  };

  // Recalculate item amounts when qty or unitPrice change
  const updateItem = (index: number, field: keyof QuoteItem, value: string | number) => {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === 'description') {
        item.description = value as string;
      } else {
        const num = value === '' || value === undefined ? 0 : Number(value);
        (item as any)[field] = isNaN(num) ? 0 : num;
        item.amount = item.qty * item.unitPrice;
      }
      next[index] = item;
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const otherTaxesTotal = otherTaxes.reduce((s, t) => s + subtotal * (t.rate / 100), 0);
  const total = subtotal + taxAmount + otherTaxesTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || items.length === 0) {
      setError('Título e ítems son requeridos');
      return;
    }
    if (!recipientId) {
      setError('Falta el destinatario');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        recipientId,
        jobId: jobId || undefined,
        conversationId: conversationId || undefined,
        title,
        items,
        taxRate,
        otherTaxes,
        notes,
        paymentTerms,
        validUntil: validUntil || undefined,
        status: 'sent',
        senderInfo,
        recipientInfo,
        applyMode,
      };

      const url = isEdit ? `${API_URL}/quotes/${id}` : `${API_URL}/quotes`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        const redirectConvId = data.conversationId || conversationId;
        if (redirectConvId) {
          navigate(`/chat/${redirectConvId}`);
        } else {
          navigate(`/quotes/${data.data.id}`);
        }
      } else {
        setError(data.message || 'Error al guardar la cotización');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{isEdit ? 'Editar cotización' : 'Nueva cotización'} - DOAPP</title>
      </Helmet>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-sky-100 dark:bg-sky-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {applyMode ? 'Postularse con cotización' : isEdit ? 'Editar cotización' : 'Nueva cotización'}
            </h1>
            {recipientName && (
              <p className="text-slate-500 dark:text-slate-400 text-sm">Para: {recipientName}</p>
            )}
          </div>
        </div>

        {/* Job attached banner */}
        {jobId && jobTitle && (
          <div className="mb-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 flex items-center gap-3">
            <Briefcase className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sky-800 dark:text-sky-300 truncate">
                {applyMode ? 'Postulación para:' : 'Trabajo adjunto:'} {jobTitle}
              </p>
              {applyMode && (
                <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">
                  Si el cliente acepta la cotización, el contrato se crea automáticamente.
                </p>
              )}
            </div>
            {!applyMode && (
              <button type="button" onClick={() => { setJobId(''); setJobTitle(''); }}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Job search — visible cuando no hay trabajo vinculado y no es edit */}
        {!isEdit && !jobId && (
          <div className="mb-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowJobSearch(p => !p)}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors w-full"
              >
                <Briefcase className="h-4 w-4" />
                Adjuntar trabajo a esta cotización (opcional)
              </button>

              {showJobSearch && (
                <div className="mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar trabajo por nombre..."
                      value={jobSearch}
                      onChange={e => handleJobSearchChange(e.target.value)}
                      autoFocus
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  {jobResults.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {jobResults.map(j => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => selectJob(j)}
                          className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors group"
                        >
                          <span className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate group-hover:text-sky-700 dark:group-hover:text-sky-300">{j.title}</span>
                          <span className="text-xs text-slate-500 shrink-0">${Number(j.price).toLocaleString('es-AR')}</span>
                        </button>
                      ))}
                    </div>
                  ) : jobSearch ? (
                    <p className="text-xs text-slate-400 text-center py-2">Sin resultados</p>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-2">Escribí para buscar</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sender / Recipient info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Datos del remitente</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nombre / Empresa"
                  value={senderInfo.name}
                  onChange={e => setSenderInfo(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
                <input
                  type="text"
                  placeholder="Dirección"
                  value={senderInfo.address}
                  onChange={e => setSenderInfo(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Ciudad"
                    value={senderInfo.city}
                    onChange={e => setSenderInfo(p => ({ ...p, city: e.target.value }))}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  />
                  <input
                    type="text"
                    placeholder="CUIT / DNI"
                    value={senderInfo.cuit}
                    onChange={e => setSenderInfo(p => ({ ...p, cuit: e.target.value }))}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Datos del cliente</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nombre / Empresa"
                  value={recipientInfo.name}
                  onChange={e => setRecipientInfo(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
                <input
                  type="text"
                  placeholder="Dirección"
                  value={recipientInfo.address}
                  onChange={e => setRecipientInfo(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Ciudad"
                    value={recipientInfo.city}
                    onChange={e => setRecipientInfo(p => ({ ...p, city: e.target.value }))}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  />
                  <input
                    type="text"
                    placeholder="CUIT / DNI"
                    value={recipientInfo.cuit}
                    onChange={e => setRecipientInfo(p => ({ ...p, cuit: e.target.value }))}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Template selector */}
          {!isEdit && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-sky-500" />
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Plantilla por rubro</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">— Seleccioná uno para pre-rellenar los ítems</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUOTE_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => {
                      setTitle(prev => prev || tpl.title);
                      setItems(tpl.items.map(i => ({ ...i, amount: i.qty * i.unitPrice })));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-700 dark:hover:text-sky-300 transition-all"
                  >
                    <span>{tpl.emoji}</span>
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quote metadata */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Título de la cotización *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={applyMode && jobTitle ? `Cotización para: ${jobTitle}` : 'Ej: Servicio de plomería, Armado de muebles, Envío...'}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Válida hasta</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Ítems</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 px-2 text-slate-600 dark:text-slate-400 font-medium w-20">Cant.</th>
                    <th className="text-left py-2 px-2 text-slate-600 dark:text-slate-400 font-medium">Descripción</th>
                    <th className="text-right py-2 px-2 text-slate-600 dark:text-slate-400 font-medium w-32">Precio unit.</th>
                    <th className="text-right py-2 px-2 text-slate-600 dark:text-slate-400 font-medium w-32">Importe</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="1"
                          value={item.qty === 0 ? '' : item.qty}
                          onChange={e => updateItem(i, 'qty', e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-center"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateItem(i, 'description', e.target.value)}
                          placeholder={`Ej: ${CONCEPT_EXAMPLES[i % CONCEPT_EXAMPLES.length]}`}
                          className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-right"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-slate-900 dark:text-white">
                        ${item.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-2">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} className="p-1 text-red-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-2 text-sky-600 dark:text-sky-400 hover:text-sky-700 text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Agregar ítem
              </button>
              <span className="text-slate-400 text-xs">Sugerencias:</span>
              {CONCEPT_EXAMPLES.slice(0, 6).map(concept => (
                <button
                  key={concept}
                  type="button"
                  onClick={() => {
                    const emptyIdx = items.findIndex(it => !it.description);
                    if (emptyIdx >= 0) {
                      updateItem(emptyIdx, 'description', concept);
                    } else {
                      setItems(prev => [...prev, { qty: 1, description: concept, unitPrice: 0, amount: 0 }]);
                    }
                  }}
                  className="px-2 py-0.5 text-xs rounded-full border border-sky-300 dark:border-sky-600 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors"
                >
                  {concept}
                </button>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="flex flex-col items-end gap-1 text-sm">
                <div className="flex justify-between w-64">
                  <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                  <span className="font-medium text-slate-900 dark:text-white">${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="flex items-center justify-between w-64 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 dark:text-slate-400">IVA</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={taxRate === 0 ? '' : taxRate}
                      onChange={e => { const v = e.target.value; setTaxRate(v === '' ? 0 : Number(v)); }}
                      className="w-16 px-2 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-center text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                    <span className="text-slate-500 text-xs">%</span>
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">${taxAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>

                {otherTaxes.map((ot, i) => (
                  <div key={i} className="flex items-center justify-between w-64 gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={ot.name}
                        onChange={e => setOtherTaxes(p => p.map((t, idx) => idx === i ? { ...t, name: e.target.value } : t))}
                        placeholder="Nombre"
                        className="w-24 px-2 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={ot.rate === 0 ? '' : ot.rate}
                        onChange={e => {
                          const raw = e.target.value;
                          const num = raw === '' ? 0 : Number(raw);
                          setOtherTaxes(p => p.map((t, idx) => idx === i ? { ...t, rate: isNaN(num) ? t.rate : num, amount: subtotal * (isNaN(num) ? t.rate : num) / 100 } : t));
                        }}
                        className="w-14 px-2 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-center text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <span className="text-slate-500 text-xs">%</span>
                      <button type="button" onClick={() => setOtherTaxes(p => p.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="font-medium text-slate-900 dark:text-white text-xs">${(subtotal * ot.rate / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setOtherTaxes(p => [...p, { name: '', rate: 0, amount: 0 }])}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline self-start"
                >
                  + Agregar otro impuesto
                </button>

                <div className="flex justify-between w-64 border-t border-slate-300 dark:border-slate-600 pt-2 mt-1">
                  <span className="font-bold text-slate-900 dark:text-white text-base">TOTAL</span>
                  <span className="font-bold text-sky-700 dark:text-sky-400 text-base">${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Condiciones de pago</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                placeholder="Ej: El pago se realizará en un plazo de 15 días"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
              />
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Observaciones</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Notas adicionales..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg font-semibold"
            >
              <Send className="h-4 w-4" />
              {saving ? 'Enviando...' : isEdit ? 'Actualizar y enviar' : applyMode ? 'Postularme con esta cotización' : 'Enviar cotización'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
