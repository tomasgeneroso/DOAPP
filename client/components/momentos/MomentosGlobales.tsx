import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Info, PartyPopper, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Transicion from '@/components/ui/Transicion';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useEventoEnVivo } from '@/hooks/useSocket';
import { claveDelCambio, type CambioDePoliticas } from '../../../shared/legal/cambiosDePoliticas';
import { CLAVE_BIENVENIDA, CLAVE_PRIMER_COBRO } from '../../../shared/momentos/momentos';
import { rolSegunOfrece } from '../../../shared/cuenta/capacidades';
import { pedirMomentos } from './api';

interface PrimerCobro { contractId: string; titulo: string; via: 'transferencia' | 'saldo'; monto: number | null }
interface Pendientes { cambioDePoliticas: CambioDePoliticas | null; primerCobro: PrimerCobro | null; bienvenida: boolean }
const NADA: Pendientes = { cambioDePoliticas: null, primerCobro: null, bienvenida: false };

/**
 * Lo que se muestra una sola vez a cada persona: el aviso de un cambio significativo de las políticas y la felicitación por el primer cobro. Van dentro de la
 * página (no flotan sobre otros carteles). Cerrarlos queda guardado en el servidor, así no vuelven en otro dispositivo.
 */
export default function MomentosGlobales() {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { isActive: hayVisitaGuiada } = useOnboarding();
  const { pathname } = useLocation();
  const [datos, setDatos] = useState<Pendientes>(NADA);
  const [cerrados, setCerrados] = useState<string[]>([]);
  const id = (user as any)?.id || (user as any)?._id;
  const habilitado = isAuthenticated && !(user as any)?.registrationPending;

  const cargar = useCallback(async () => {
    if (!habilitado) return;
    const r = await pedirMomentos<Pendientes>('');
    if (r.ok && r.data && typeof r.data === 'object') setDatos({ cambioDePoliticas: r.data.cambioDePoliticas ?? null, primerCobro: r.data.primerCobro ?? null, bienvenida: r.data.bienvenida === true });
  }, [habilitado, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setCerrados([]); setDatos(NADA); void cargar(); }, [cargar]);
  // Cuando entra plata o cambia un contrato, el primer cobro puede aparecer sin recargar.
  useEventoEnVivo(['balance:updated', 'contract:updated', 'socket:reconectado'], () => { void cargar(); });

  // La visita guiada oscurece la pantalla: los carteles esperan a que termine, para no quedar tapados ni competir con ella.
  if (!habilitado || hayVisitaGuiada) return null;

  const cerrar = (clave: string) => {
    setCerrados((c) => [...c, clave]);
    void pedirMomentos('/visto', { clave });
  };
  const cambio = datos.cambioDePoliticas;
  const cobro = datos.primerCobro;
  const claveCambio = cambio ? claveDelCambio(cambio.version) : '';
  // Mientras se lee el documento el aviso no estorba arriba del propio texto.
  const verCambio = !!cambio && !cerrados.includes(claveCambio) && !pathname.startsWith('/legal');
  const verCobro = !!cobro && !cerrados.includes(CLAVE_PRIMER_COBRO);
  // La pregunta va solo en la portada: en medio de otra tarea distraería.
  const verBienvenida = datos.bienvenida && !cerrados.includes(CLAVE_BIENVENIDA) && pathname === '/';

  const vengoAContratar = () => {
    cerrar(CLAVE_BIENVENIDA);
    navigate('/contracts/create');
  };
  const vengoATrabajar = async () => {
    cerrar(CLAVE_BIENVENIDA);
    try {
      await fetch('/api/auth/mode', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ mode: rolSegunOfrece(true) }) });
      await refreshUser();
    } catch {
      /* se puede activar después desde el perfil («Ofrecer mis servicios») */
    }
    navigate('/settings?tab=address');
  };

  return (
    <div className="container mx-auto max-w-4xl px-4">
      <Transicion mostrar={verCambio}>
        {cambio && (
          <section aria-label="Cambios en las políticas" data-testid="aviso-de-politicas" className="mt-4 rounded-xl border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/30 p-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-sky-900 dark:text-sky-100"><Info className="h-5 w-5 shrink-0" aria-hidden="true" />{cambio.titulo}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
              {cambio.puntos.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={cambio.enlace} className="rounded-lg border border-sky-600 px-3 py-2 text-sm font-medium text-sky-700 dark:text-sky-300">Leer la política</Link>
              <button type="button" onClick={() => cerrar(claveCambio)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">Entendido</button>
            </div>
          </section>
        )}
      </Transicion>

      <Transicion mostrar={verBienvenida}>
        <section aria-label="Bienvenida" data-testid="bienvenida" className="relative mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 pr-12">
          <button type="button" onClick={() => cerrar(CLAVE_BIENVENIDA)} aria-label="Cerrar" className="absolute right-2 top-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"><X className="h-4 w-4" aria-hidden="true" /></button>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">¿Por dónde querés empezar?</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Con tu cuenta podés hacer las dos cosas cuando quieras.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={vengoAContratar} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">Necesito que me hagan un trabajo</button>
            <button type="button" onClick={() => { void vengoATrabajar(); }} className="rounded-lg border border-sky-600 px-3 py-2 text-sm font-medium text-sky-700 dark:text-sky-300">Quiero trabajar</button>
          </div>
        </section>
      </Transicion>

      <Transicion mostrar={verCobro}>
        {cobro && (
          <section aria-label="Tu primer cobro" data-testid="primer-cobro" className="relative mt-4 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 p-4 pr-12">
            <button type="button" onClick={() => cerrar(CLAVE_PRIMER_COBRO)} aria-label="Cerrar" className="absolute right-2 top-2 rounded-lg p-2 text-slate-500 hover:bg-emerald-100 dark:text-slate-300 dark:hover:bg-emerald-900/50"><X className="h-4 w-4" aria-hidden="true" /></button>
            <h2 className="flex items-center gap-2 text-base font-semibold text-emerald-900 dark:text-emerald-100"><PartyPopper className="h-5 w-5 shrink-0" aria-hidden="true" />Tu primer trabajo en DOAPP ya está cobrado</h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              «{cobro.titulo}»{cobro.via === 'saldo' && cobro.monto !== null ? `: $ ${cobro.monto.toLocaleString('es-AR')} en tu saldo.` : ': el equipo registró la transferencia.'} Sumalo a tu portafolio para que la próxima persona vea cómo trabajás.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/my-jobs?tab=realizados" onClick={() => cerrar(CLAVE_PRIMER_COBRO)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800">Mostrarlo en mi perfil</Link>
              <Link to={`/contracts/${cobro.contractId}`} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">Ver el contrato</Link>
            </div>
          </section>
        )}
      </Transicion>
    </div>
  );
}
