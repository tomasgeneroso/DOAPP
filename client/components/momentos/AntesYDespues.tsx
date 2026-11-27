import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Images, Loader2 } from 'lucide-react';
import { getImageUrl } from '@/utils/imageUrl';
import { useEventoEnVivo } from '@/hooks/useSocket';
import { FOTOS_POR_LADO } from '../../../shared/momentos/momentos';
import { pedirMomentos } from './api';
import { rutaParaReportar } from '../../../shared/tickets/reportes';
import InfoIcono from '@/components/ui/InfoIcono';

interface Estado {
  terminado: boolean;
  fotos: { antes: string[]; despues: string[] };
  puedeProponer: boolean;
  /** Quien mira puede publicar sin pedir permiso (autorizado al contratar). */
  sePublicaDirecto?: boolean;
  trabajasteVos?: boolean;
  pedido: null | { id: string; estado: 'pending' | 'published' | 'rejected' | 'withdrawn' | 'removed'; loPropusisteVos: boolean; fotos: { antes: string[]; despues: string[] }; texto: string; publicacionId: string | null; puedeRetirar?: boolean };
}

const BOTON = 'rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50';

function Miniaturas({ titulo, rutas, elegidas, onTocar }: { titulo: string; rutas: string[]; elegidas?: string[]; onTocar?: (r: string) => void }) {
  if (rutas.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{titulo}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {rutas.map((r, i) => {
          const img = <img src={getImageUrl(r)} alt={`${titulo}, foto ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" loading="lazy" />;
          return onTocar ? (
            <button key={r} type="button" aria-pressed={!!elegidas?.includes(r)} onClick={() => onTocar(r)} className={`rounded-lg border-2 p-0.5 ${elegidas?.includes(r) ? 'border-sky-600' : 'border-transparent opacity-70'}`}>{img}</button>
          ) : <span key={r}>{img}</span>;
        })}
      </div>
    </div>
  );
}

/** «Antes y después» de un trabajo terminado: va al perfil de quien lo publica. Quien trabajó siempre puede mostrar su trabajo (con la autorización de la contratación). */
export default function AntesYDespues({ contractId }: { contractId: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [armando, setArmando] = useState(false);
  const [antes, setAntes] = useState<string[]>([]);
  const [despues, setDespues] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await pedirMomentos<Estado>(`/antes-despues/contrato/${contractId}`);
    if (r.ok && r.data?.fotos) setEstado(r.data);
  }, [contractId]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEventoEnVivo(['contract:updated', 'notification:new', 'socket:reconectado'], () => { void cargar(); });

  const hacer = async (ruta: string, cuerpo: unknown, exito: string) => {
    setEnviando(true);
    const r = await pedirMomentos(ruta, cuerpo);
    setEnviando(false);
    setAviso(r.ok ? exito : r.message || 'No pudimos completar eso.');
    if (r.ok) setArmando(false);
    void cargar();
  };
  const alternar = (lista: string[], poner: (v: string[]) => void) => (r: string) =>
    poner(lista.includes(r) ? lista.filter((x) => x !== r) : lista.length < FOTOS_POR_LADO ? [...lista, r] : lista);

  if (!estado || !estado.terminado) return null;
  const pedido = estado.pedido;
  const activo = !!pedido && (pedido.estado === 'pending' || pedido.estado === 'published');
  if (!activo && !estado.puedeProponer) return null;

  return (
    <section aria-label="Antes y después" data-testid="antes-y-despues" className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white"><Images className="h-5 w-5 text-sky-600" aria-hidden="true" />Antes y después<InfoIcono ayuda="Antes y después" /></h3>

      {activo && pedido && (
        <>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {pedido.estado === 'published' ? (pedido.loPropusisteVos ? 'Está publicado en tu perfil.' : 'Está publicado en el perfil de la otra persona.')
              : pedido.loPropusisteVos ? 'Esperando que la otra persona lo acepte. Hasta entonces las fotos siguen siendo privadas.'
              : 'Quieren publicar estas fotos en su perfil. Se publican solo si lo aceptás.'}
          </p>
          <Miniaturas titulo="Antes" rutas={pedido.fotos.antes} />
          <Miniaturas titulo="Después" rutas={pedido.fotos.despues} />
          {pedido.texto && <p className="text-sm italic text-slate-600 dark:text-slate-300">«{pedido.texto}»</p>}
          <div className="flex flex-wrap gap-2">
            {pedido.estado === 'pending' && !pedido.loPropusisteVos && (
              <>
                <button type="button" disabled={enviando} onClick={() => hacer(`/antes-despues/${pedido.id}/aceptar`, {}, 'Listo, quedó publicado.')} className={`${BOTON} bg-sky-600 text-white hover:bg-sky-700`}>Aceptar y publicar</button>
                <button type="button" disabled={enviando} onClick={() => hacer(`/antes-despues/${pedido.id}/rechazar`, {}, 'Las fotos quedan entre ustedes.')} className={`${BOTON} border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200`}>Dejarlo sin publicar</button>
              </>
            )}
            {pedido.publicacionId && <Link to={`/posts/${pedido.publicacionId}`} className={`${BOTON} border border-sky-600 text-sky-700 dark:text-sky-300`}>Ver la publicación</Link>}
            {pedido.puedeRetirar && (
              <button type="button" disabled={enviando} onClick={() => hacer(`/antes-despues/${pedido.id}/retirar`, {}, 'Retirado.')} className={`${BOTON} text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800`}>Retirar</button>
            )}
          </div>
          {pedido.estado === 'published' && !pedido.puedeRetirar && (
            <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="en-el-perfil-de-quien-trabajo">
              Quien trabajó puede mostrar en su perfil el trabajo que hizo, como se autorizó al contratar. Si las fotos muestran personas o datos personales,{' '}
              <Link to={rutaParaReportar({ sobre: 'contrato', contratoId: contractId })} className="font-medium text-sky-700 underline dark:text-sky-300">escribí a soporte</Link> para que se retiren.
            </p>
          )}
        </>
      )}

      {!activo && !armando && (
        <>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {!estado.sePublicaDirecto ? 'Mostrá cómo quedó. Se publica solo si la otra persona también lo acepta.'
              : estado.trabajasteVos ? 'Mostrá en tu perfil el trabajo que hiciste, como se autorizó al contratar.'
              : 'Mostrá cómo quedó en tu perfil. Las dos partes autorizaron publicar las fotos al contratar.'}
          </p>
          <button type="button" onClick={() => { setArmando(true); setAviso(''); }} className={`${BOTON} bg-sky-600 text-white hover:bg-sky-700`}>Armar un antes y después</button>
        </>
      )}

      {!activo && armando && (
        <>
          <p className="text-sm text-slate-700 dark:text-slate-200">Elegí hasta {FOTOS_POR_LADO} fotos de cada lado.</p>
          <Miniaturas titulo="Antes (fotos de la publicación)" rutas={estado.fotos.antes} elegidas={antes} onTocar={alternar(antes, setAntes)} />
          <Miniaturas titulo="Después (fotos de entrega)" rutas={estado.fotos.despues} elegidas={despues} onTocar={alternar(despues, setDespues)} />
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            Comentario (opcional)
            <textarea value={texto} maxLength={300} onChange={(e) => setTexto(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-900 dark:text-white" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={enviando || despues.length === 0} onClick={() => hacer(`/antes-despues/contrato/${contractId}`, { antes, despues, texto }, estado.sePublicaDirecto ? 'Listo, quedó publicado.' : 'Pedido enviado.')} className={`${BOTON} bg-sky-600 text-white hover:bg-sky-700`}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : estado.sePublicaDirecto ? 'Publicar en mi perfil' : 'Pedir permiso para publicar'}
            </button>
            <button type="button" onClick={() => setArmando(false)} className={`${BOTON} text-slate-600 dark:text-slate-300`}>Cancelar</button>
          </div>
        </>
      )}
      {aviso && <p role="status" className="animate-fadeIn text-sm text-slate-700 dark:text-slate-200">{aviso}</p>}
    </section>
  );
}
