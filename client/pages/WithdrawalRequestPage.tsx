import React, { useState, useEffect, useRef } from 'react';
import useDialog from '@/hooks/useDialog';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth';
import { useEventoEnVivo, useRecargaJuntada } from '../hooks/useSocket';
import { WithdrawalRequest } from '../types';
import {
  ArrowDownCircle,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  CreditCard,
  Building2,
  User as UserIcon,
  Hash
} from 'lucide-react';
import Button from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import Transicion from "../components/ui/Transicion";
import SelectorDeBanco from "../components/ui/SelectorDeBanco";
import { etiquetaDelAFavor, fechaDeLiquidacion, type AFavorPendienteItem, type CobroPendiente } from "../../shared/pagos/aFavorPendiente";
import CobrosPendientes from "../components/CobrosPendientes";
import { useToast } from "../components/ui/Toast";
import { esLemon } from "../../shared/pagos/destinoDeRetiro";

export default function WithdrawalRequestPage() {
  const { t } = useTranslation();
  const { confirm: confirmDialog, dialog } = useDialog();
  const { user } = useAuth();
  const navigate = useNavigate();
  // Los avisos de éxito salen abajo a la derecha, a la vista y con la X para cerrarlos (antes era un cuadro arriba de la página que a veces no se veía).
  const toast = useToast();
  // `balance` es lo que se puede RETIRAR ahora. Lo que ya está en la cuenta pero Mercado Pago todavía no liberó se muestra aparte.
  const [balance, setBalance] = useState(0);
  const [enLiberacion, setEnLiberacion] = useState(0);
  const [proximaLiberacion, setProximaLiberacion] = useState<string | null>(null);
  // A favor PENDIENTE de liquidar: todavía no está en el saldo (Mercado Pago no liberó el pago original).
  const [aFavorPendiente, setAFavorPendiente] = useState(0);
  const [proximaLiquidacion, setProximaLiquidacion] = useState<string | null>(null);
  const [aFavorDetalle, setAFavorDetalle] = useState<AFavorPendienteItem[]>([]);
  // Una tarjeta por cada cobro pendiente, con su contrato y su trabajo.
  const [cobros, setCobros] = useState<CobroPendiente[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A dónde cobrar: la cuenta guardada en el perfil (la que viene del servidor, sin el número entero) o una cuenta nueva que se carga acá.
  const [cuentaDelPerfil, setCuentaDelPerfil] = useState<{ etiqueta: string; accountHolder: string; bankName: string } | null>(null);
  const [enfriamientoDelPerfil, setEnfriamientoDelPerfil] = useState<{ motivo?: string; horasFaltantes?: number } | null>(null);
  const [horasDeEnfriamiento, setHorasDeEnfriamiento] = useState(24);
  const [modoDeCuenta, setModoDeCuenta] = useState<'perfil' | 'otra'>('otra');
  const [lemonTag, setLemonTag] = useState('');
  const [guardarEnPerfil, setGuardarEnPerfil] = useState(true);
  const primeraCarga = useRef(true);

  // Form state
  const [amount, setAmount] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<'savings' | 'checking'>('savings');
  const [cbu, setCbu] = useState('');
  const [alias, setAlias] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // El saldo disponible, lo que está por liberarse y el estado de mis retiros se actualizan solos (un administrador lo aprueba, lo transfiere o lo rechaza).
  const recargarRetiros = useRecargaJuntada(() => loadData());
  useEventoEnVivo(['balance:updated', 'withdrawal:updated', 'payment:updated', 'socket:reconectado'], recargarRetiros);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');

      // Load balance
      const balanceRes = await fetch('/api/balance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const balanceData = await balanceRes.json();
      if (balanceData.success) {
        setBalance(balanceData.disponibleParaRetirar ?? balanceData.balance);
        setEnLiberacion(Number(balanceData.enLiberacion) || 0);
        setProximaLiberacion(balanceData.proximaLiberacion || null);
        setAFavorPendiente(Number(balanceData.aFavorPendiente) || 0);
        setProximaLiquidacion(balanceData.proximaLiquidacion || null);
        setAFavorDetalle(Array.isArray(balanceData.aFavorPendienteDetalle) ? balanceData.aFavorPendienteDetalle : []);
        setCobros(Array.isArray(balanceData.cobrosPendientes) ? balanceData.cobrosPendientes : []);
        setCuentaDelPerfil(balanceData.cuentaDelPerfil || null);
        setEnfriamientoDelPerfil(balanceData.enfriamientoDelPerfil || null);
        setHorasDeEnfriamiento(Number(balanceData.horasDeEnfriamiento) || 24);
        // La primera vez se ofrece la cuenta del perfil si hay una; después se respeta lo que la persona eligió.
        // (Se lee la marca ANTES de bajarla: la función de abajo corre después, y ya la encontraría baja.)
        const esLaPrimera = primeraCarga.current;
        primeraCarga.current = false;
        setModoDeCuenta((actual) => (!balanceData.cuentaDelPerfil ? 'otra' : esLaPrimera ? 'perfil' : actual));
      }

      // Load withdrawals
      const withdrawalsRes = await fetch('/api/balance/withdrawals', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const withdrawalsData = await withdrawalsRes.json();
      if (withdrawalsData.success) {
        const list = withdrawalsData.withdrawals || [];
        setWithdrawals(list);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Retiro "todo o nada": siempre se retira el saldo completo (mín $1,000 ARS)
    const amountNum = balance;

    if (isNaN(amountNum) || amountNum < 1000) {
      setError('El monto mínimo de retiro es $1,000 ARS');
      return;
    }

    if (modoDeCuenta === 'perfil' && enfriamientoDelPerfil) {
      setError(enfriamientoDelPerfil.motivo || 'Cambiaste tu cuenta hace poco: por seguridad el retiro se habilita unas horas después.');
      return;
    }

    if (modoDeCuenta === 'otra') {
      if (!accountHolder.trim()) {
        setError('El titular de la cuenta es requerido');
        return;
      }

      if (!bankName.trim()) {
        setError('El nombre del banco es requerido');
        return;
      }

      if (esLemon(bankName)) {
        if (!lemonTag.trim() && !alias.trim() && !cbu) {
          setError('Para cobrar en Lemon cargá tu $lemontag, tu alias o tu CVU.');
          return;
        }
        if (cbu && cbu.length !== 22) {
          setError('El CVU debe tener exactamente 22 dígitos');
          return;
        }
      } else if (cbu.length !== 22 || !/^\d{22}$/.test(cbu)) {
        setError('El CBU debe tener exactamente 22 dígitos');
        return;
      }
    }

    await enviarRetiro(amountNum, false);
  };

  /**
   * El servidor puede contestar 409 "requiereConfirmacion" cuando parte del
   * saldo son devoluciones de publicaciones canceladas sin trabajador:
   * retirarlas a efectivo descuenta media comisión (T&C 9.1). Se le muestra
   * el número exacto y decide; dentro de la app ese saldo es gratis. Retirar
   * no tiene costo de pasarela: el procesamiento se pagó al pagar.
   */
  const enviarRetiro = async (amountNum: number, aceptaCostoPasarela: boolean) => {
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/balance/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: amountNum,
          aceptaCostoPasarela,
          // Sin cuenta en el pedido, el servidor usa la del perfil. Una cuenta nueva se puede guardar en el perfil.
          ...(modoDeCuenta === 'otra'
            ? {
                guardarEnPerfil,
                bankingInfo: {
                  accountHolder,
                  bankName,
                  accountType,
                  cbu: cbu || undefined,
                  alias: alias || undefined,
                  lemonTag: lemonTag.trim() || undefined,
                },
              }
            : {}),
        }),
      });

      const data = await response.json();

      if (response.status === 409 && data.requiereConfirmacion) {
        setSubmitting(false);
        confirmDialog({
          tone: 'warning',
          title: data.detalle ? 'Retirar saldo devuelto tiene un costo' : 'Vas a retirar saldo de una publicación',
          message: data.message,
          confirmLabel: data.detalle ? `Retirar $${Number(data.detalle.recibirias || 0).toLocaleString('es-AR')}` : 'Retirar igual',
          onConfirm: () => { void enviarRetiro(amountNum, true); },
        });
        return;
      }

      if (data.success) {
        // El servidor dice qué pasa con este retiro: lo aprueba un administrador y, si va a una cuenta nueva o supera el tope diario, además espera.
        toast.success('Solicitud de retiro enviada', data.message || t('withdrawals.submitSuccess'));
        // Reset form
        setAmount('');
        setAccountHolder('');
        setBankName('');
        setCbu('');
        setAlias('');
        setLemonTag('');
        // Reload data
        await loadData();
      } else {
        setError(data.message || 'Error al solicitar retiro');
      }
    } catch (err: any) {
      setError(err.message || 'Error al solicitar retiro');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = (withdrawalId: string) => {
    confirmDialog({
      tone: 'danger',
      title: t('common.cancel', 'Cancelar'),
      message: t('withdrawals.confirmCancel'),
      confirmLabel: t('common.yesCancel', 'Sí, cancelar'),
      onConfirm: () => doCancel(withdrawalId),
    });
  };

  const doCancel = async (withdrawalId: string) => {

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/balance/withdrawals/${withdrawalId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast.success(t('withdrawals.cancelSuccess'));
        await loadData();
      } else {
        setError(data.message || 'Error al cancelar solicitud');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cancelar solicitud');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: {
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
        icon: <Clock className="w-4 h-4" />,
        text: t('withdrawals.status.pending'),
      },
      approved: {
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
        icon: <CheckCircle className="w-4 h-4" />,
        text: t('withdrawals.status.approved'),
      },
      processing: {
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        text: t('withdrawals.status.processing'),
      },
      completed: {
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
        icon: <CheckCircle className="w-4 h-4" />,
        text: t('withdrawals.status.completed'),
      },
      rejected: {
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
        icon: <XCircle className="w-4 h-4" />,
        text: t('withdrawals.status.rejected'),
      },
      cancelled: {
        color: 'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-200',
        icon: <XCircle className="w-4 h-4" />,
        text: t('withdrawals.status.cancelled'),
      },
    };

    const badge = badges[status as keyof typeof badges] || badges.pending;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-sky-600" />
      </div>
    );
  }

  const totalWithdrawn = withdrawals
    .filter(w => w.status === 'completed')
    .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  const pendingAmount = withdrawals
    .filter(w => ['pending', 'approved', 'processing'].includes(w.status))
    .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  // Mientras hay un retiro en curso no se puede pedir otro: ese saldo ya está pedido.
  const retiroEnCurso = withdrawals.find(w => ['pending', 'approved', 'processing'].includes(w.status));

  return (
    <>
    <Helmet>
      <title>{t('withdrawals.pageTitle')}</title>
    </Helmet>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {t('withdrawals.title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {t('withdrawals.subtitle')}
        </p>
      </div>

      {/* Alerts */}
      <Transicion mostrar={!!error}>
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
      </Transicion>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Current Balance */}
        <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sky-100 text-sm mb-1">{t('withdrawals.availableBalance')}</p>
          <p className="text-3xl font-bold">
            ${balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
          {retiroEnCurso && (
            <p className="mt-2 text-xs text-sky-100">
              Este saldo ya está pedido en un retiro en curso (${Number(retiroEnCurso.metadata?.saldoDebitado || retiroEnCurso.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}): hasta que se complete no se puede pedir otro.
            </p>
          )}
          {enLiberacion > 0 && (
            <p className="mt-2 text-xs text-sky-100">
              + ${enLiberacion.toLocaleString('es-AR')} ya están en tu saldo de DOAPP, pero Mercado Pago todavía no liberó ese pago
              {proximaLiberacion ? `: los vas a poder retirar desde el ${new Date(proximaLiberacion).toLocaleDateString('es-AR')}` : ''}.
              {' '}No se retiran solos: cuando llegue la fecha, el retiro lo pedís vos desde esta pantalla.
            </p>
          )}
          {aFavorPendiente > 0 && (
            <div className="mt-2 text-xs text-sky-100">
              <p>
                + ${aFavorPendiente.toLocaleString('es-AR')} a favor pendientes de liquidar: todavía no son tuyos, no los podés usar ni retirar. Pasan a tu saldo
                {aFavorDetalle.length <= 1 && proximaLiquidacion ? ` el ${fechaDeLiquidacion(proximaLiquidacion)}` : ''}, cuando Mercado Pago libera el pago original.
              </p>
              {aFavorDetalle.length > 1 && (
                <ul className="mt-1 space-y-0.5">
                  {aFavorDetalle.map((a) => (
                    <li key={a.id}>
                      • {etiquetaDelAFavor(a.motivo)}: ${a.monto.toLocaleString('es-AR')}
                      {a.disponibleDesde ? ` · pasa a tu saldo el ${fechaDeLiquidacion(a.disponibleDesde)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Total Withdrawn */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <ArrowDownCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">{t('withdrawals.totalWithdrawn')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            ${totalWithdrawn.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Pending Amount */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">{t('withdrawals.pendingAmount')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            ${pendingAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <CobrosPendientes cobros={cobros} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Request Form */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 sticky top-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              {t('withdrawals.newRequest')}
            </h2>

            {retiroEnCurso ? (
              <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4 text-sm text-sky-900 dark:text-sky-100">
                <p className="font-semibold mb-1">Ya tenés un retiro en curso</p>
                <p>Cuando se complete o lo canceles vas a poder pedir otro. Lo ves a la derecha, en «Mis solicitudes de retiro».</p>
              </div>
            ) : balance <= 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
                  <DollarSign className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('withdrawals.zeroBalanceTitle', 'Saldo insuficiente')}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('withdrawals.zeroBalanceDesc', 'Tu saldo disponible es $0. Necesitas tener saldo para solicitar un retiro.')}
                </p>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Amount — all-or-nothing: the entire available balance is withdrawn */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('withdrawals.amount')}
                </label>
                <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-4 py-3">
                  <p className="text-xs text-sky-700 dark:text-sky-300">Vas a retirar <strong>todo tu saldo disponible</strong>:</p>
                  <p className="text-2xl font-bold text-sky-900 dark:text-sky-100 flex items-center gap-1">
                    <DollarSign className="h-5 w-5" />{balance.toLocaleString('es-AR')} ARS
                  </p>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  El retiro es por el total del saldo. Mínimo $1.000 ARS. Tu saldo quedará en $0.
                </p>
                {balance < 1000 && (
                  <p className="mt-1 text-xs text-red-500">{t('withdrawals.belowMinimum', 'Tu saldo es menor al mínimo de $1.000 ARS para retirar.')}</p>
                )}
              </div>

              {/* A dónde cobrar */}
              <fieldset className="space-y-2">
                <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">¿A qué cuenta querés cobrar?</legend>
                {cuentaDelPerfil && (
                  <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${modoDeCuenta === 'perfil' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                    <input type="radio" name="modoDeCuenta" className="mt-1" checked={modoDeCuenta === 'perfil'} onChange={() => setModoDeCuenta('perfil')} />
                    <span className="text-sm text-gray-800 dark:text-gray-100">
                      <strong>La cuenta de mi perfil</strong>
                      <span className="block text-gray-600 dark:text-gray-400">{cuentaDelPerfil.accountHolder} · {cuentaDelPerfil.etiqueta}</span>
                    </span>
                  </label>
                )}
                <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${modoDeCuenta === 'otra' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                  <input type="radio" name="modoDeCuenta" className="mt-1" checked={modoDeCuenta === 'otra'} onChange={() => setModoDeCuenta('otra')} />
                  <span className="text-sm text-gray-800 dark:text-gray-100">
                    <strong>{cuentaDelPerfil ? 'Otra cuenta' : 'Cargar una cuenta'}</strong>
                    <span className="block text-gray-600 dark:text-gray-400">Banco, billetera o Lemon.</span>
                  </span>
                </label>
                {modoDeCuenta === 'perfil' && enfriamientoDelPerfil && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{enfriamientoDelPerfil.motivo}</p>
                )}
              </fieldset>

              {modoDeCuenta === 'otra' && (<>
              {/* Account Holder */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('withdrawals.accountHolder')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder={t('withdrawals.accountHolderPlaceholder')}
                    required
                    className="pl-10 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Bank Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('withdrawals.bank')}
                </label>
                {/* Se elige de una lista (Mercado Pago, otras billeteras, bancos); «Otro…» deja escribirlo. */}
                <SelectorDeBanco
                  value={bankName}
                  onChange={setBankName}
                  cbu={cbu}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Account Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('withdrawals.accountType')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CreditCard className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as 'savings' | 'checking')}
                    className="pl-10 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="savings">{t('withdrawals.savings')}</option>
                    <option value="checking">{t('withdrawals.checking')}</option>
                  </select>
                </div>
              </div>

              {/* CBU */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {esLemon(bankName) ? 'CVU (opcional si cargás $lemontag o alias)' : t('withdrawals.cbu')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Hash className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={cbu}
                    onChange={(e) => setCbu(e.target.value.replace(/\D/g, '').slice(0, 22))}
                    placeholder={t('withdrawals.cbuPlaceholder')}
                    maxLength={22}
                    required={!esLemon(bankName)}
                    className="pl-10 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {cbu.length}/22 dígitos
                </p>
              </div>

              {/* Lemon se cobra con el $lemontag, el alias o el CVU: alcanza con uno */}
              {esLemon(bankName) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">$lemontag</label>
                  <input
                    type="text"
                    value={lemonTag}
                    onChange={(e) => setLemonTag(e.target.value.replace(/\s/g, '').slice(0, 31))}
                    placeholder="$tunombre"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Para cobrar en Lemon alcanza con uno: tu $lemontag, tu alias o tu CVU.</p>
                </div>
              )}

              {/* Alias (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('withdrawals.alias')}
                </label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder={t('withdrawals.aliaPlaceholder')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" className="mt-1" checked={guardarEnPerfil} onChange={(e) => setGuardarEnPerfil(e.target.checked)} />
                <span>Guardar esta cuenta en mi perfil para los próximos retiros</span>
              </label>
              {cuentaDelPerfil && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Por seguridad, un retiro a una cuenta distinta de la de tu perfil se procesa recién pasadas {horasDeEnfriamiento} horas, y te avisamos para que lo frenes si no fuiste vos.
                </p>
              )}
              </>)}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting || balance < 1000}
                className="w-full flex items-center justify-center"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {t('withdrawals.submitting')}
                  </>
                ) : (
                  <>
                    <ArrowDownCircle className="w-5 h-5 mr-2" />
                    {t('withdrawals.submit')}
                  </>
                )}
              </Button>
            </form>
            )}

            {/* Info Box */}
            <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 text-sm">
                {t('withdrawals.processingTitle')}
              </h3>
              <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                <li>• {t('withdrawals.processingApproval')}</li>
                <li>• {t('withdrawals.processingTransfer')}</li>
                <li>• {t('withdrawals.processingMin')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Withdrawals List */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('withdrawals.myRequests')}
              </h2>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {withdrawals.length === 0 ? (
                <div className="p-12 text-center">
                  <ArrowDownCircle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {t('withdrawals.noRequests')}
                  </p>
                </div>
              ) : (
                withdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            ${Number(withdrawal.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </p>
                          {getStatusBadge(withdrawal.status)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" />
                            <span>{withdrawal.bankingInfo.accountHolder}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            <span>{withdrawal.bankingInfo.bankName}</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <Hash className="w-4 h-4 flex-shrink-0" />
                            <span className="font-mono break-all">
                              {[
                                withdrawal.bankingInfo.lemonTag,
                                withdrawal.bankingInfo.alias,
                                withdrawal.bankingInfo.cbu && `${esLemon(withdrawal.bankingInfo.bankName) ? 'CVU' : 'CBU'} ${withdrawal.bankingInfo.cbu}`,
                              ].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(withdrawal.requestedAt).toLocaleDateString('es-AR')}</span>
                          </div>
                        </div>

                        {['pending', 'approved', 'processing'].includes(withdrawal.status) && (
                          <div className="mt-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 text-sm text-sky-900 dark:text-sky-100 space-y-1">
                            <p>
                              {withdrawal.status === 'pending'
                                ? 'Un administrador tiene que aprobar el envío del retiro a tu cuenta. Suele hacerlo en 24 a 48 horas hábiles. Gracias por tu paciencia.'
                                : 'Tu retiro ya fue aprobado: lo estamos transfiriendo a tu cuenta.'}
                            </p>
                            {Number(withdrawal.metadata?.retencion) > 0 && (
                              <p>
                                De tus ${Number(withdrawal.metadata?.saldoDebitado).toLocaleString('es-AR', { minimumFractionDigits: 2 })} se retienen ${Number(withdrawal.metadata?.retencion).toLocaleString('es-AR', { minimumFractionDigits: 2 })} (la parte de la comisión de una publicación cancelada, T&C 9.1): recibís ${Number(withdrawal.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}.
                              </p>
                            )}
                            {withdrawal.metadata?.destinoNuevo && withdrawal.metadata?.noSeProcesaAntesDe && new Date(withdrawal.metadata.noSeProcesaAntesDe).getTime() > Date.now() && (
                              <p>Es una cuenta nueva: por seguridad se procesa a partir del {new Date(withdrawal.metadata.noSeProcesaAntesDe).toLocaleString('es-AR')}. Si no fuiste vos, cancelalo.</p>
                            )}
                          </div>
                        )}

                        {withdrawal.rejectionReason && (
                          <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                            <p className="text-sm text-red-800 dark:text-red-200">
                              <strong>{t('withdrawals.rejectionReason')}:</strong> {withdrawal.rejectionReason}
                            </p>
                          </div>
                        )}
                      </div>

                      {withdrawal.status === 'pending' && (
                        <div>
                          <Button
                            variant="secondary"
                            onClick={() => handleCancel(withdrawal.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            {t('withdrawals.cancel')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
    {dialog}
    </>
  );
}
