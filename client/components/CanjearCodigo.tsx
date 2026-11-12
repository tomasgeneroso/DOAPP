import { useState } from 'react';
import { Ticket, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { candidatosDeCodigo } from '../utils/clasificarCodigo';

/**
 * «Tengo un código» (Códigos de invitación, en el menú): un solo campo para el código de invitación de un creador de contenido (INF-…), el de familia (FAM-…)
 * o el de un referido. Reconoce el tipo por cómo se ve (`utils/clasificarCodigo.ts`) y llama al canje que corresponde; también acepta el enlace entero.
 */
const RUTAS = {
  invitacion: '/api/invitaciones/canjear',
  familia: '/api/auth/activate-family-code',
  referido: '/api/referrals/use-code',
} as const;

export default function CanjearCodigo() {
  const { refreshUser } = useAuth() as any;
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const canjear = async () => {
    if (enviando) return;
    const candidatos = candidatosDeCodigo(texto);
    if (candidatos.length === 0) {
      setResultado({ ok: false, texto: 'Ese código no tiene la forma de ninguno que conozcamos. Revisalo o pegá el enlace que te mandaron.' });
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      // Un código de 8 caracteres sin prefijo puede ser de un referido o de familia: se prueba uno y, si el servidor dice que no existe, el otro.
      let ultimo = 'No se pudo aplicar el código. Probá de nuevo.';
      for (const c of candidatos) {
        const r = await fetchWithAuth(RUTAS[c.tipo], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [c.tipo === 'invitacion' ? 'codigo' : 'code']: c.codigo }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.success) {
          setResultado({ ok: true, texto: d.message || '¡Código aplicado!' });
          setTexto('');
          await refreshUser?.();
          return;
        }
        ultimo = d.message || ultimo;
        // Un código que existe pero no se puede usar (ya usado, propio, ya tenés uno) se explica tal cual; solo «no existe» pasa al siguiente.
        if (r.status !== 404 && !/inv[aá]lid/i.test(String(d.message || ''))) break;
      }
      setResultado({ ok: false, texto: ultimo });
    } catch {
      setResultado({ ok: false, texto: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <label htmlFor="tengoUnCodigo" className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <Ticket className="h-4 w-4" aria-hidden="true" />
        Tengo un código
      </label>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Pegá el código de invitación que te enviaron (o el enlace entero), un código de familia o el de un amigo que te invitó.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          id="tengoUnCodigo"
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void canjear();
            }
          }}
          placeholder="INF-… / FAM-… / ABC12345"
          autoComplete="off"
          className="block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        <button type="button" onClick={canjear} disabled={enviando || !texto.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Aplicar
        </button>
      </div>
      {resultado && (
        <p role="alert" className={`mt-2 text-sm ${resultado.ok ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
