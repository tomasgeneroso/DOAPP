import { Lock } from 'lucide-react';
import InfoIcono from '../ui/InfoIcono';
import Pestanas from '../ui/Pestanas';

/** Los chats cerrados (el de un equipo cuando su trabajo termina o se cancela) van en su propia pestaña, de solo lectura (pedido del dueño, 2026-11-27). */
export interface ChatCerrado {
  el: string;
  borrarDesde: string | null;
}

const dia = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

export function PestanasDeChats({ cerrados, ver, alCambiar }: { cerrados: number; ver: 'abiertos' | 'cerrados'; alCambiar: (v: 'abiertos' | 'cerrados') => void }) {
  return (
    <Pestanas
      ariaLabel="Chats"
      testid="pestanas-de-chats"
      valor={ver}
      onCambiar={alCambiar}
      opciones={[
        { id: 'abiertos' as const, texto: 'Abiertos' },
        { id: 'cerrados' as const, texto: 'Chats cerrados', insignia: cerrados > 0 ? cerrados : undefined },
      ]}
    />
  );
}

export function ExplicacionDeCerrados() {
  return (
    <p className="flex items-center justify-center gap-1 px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
      Acá van los chats de trabajos terminados <InfoIcono ayuda="Chats cerrados" />
    </p>
  );
}

/** Reemplaza al cuadro para escribir. */
export function AvisoDeChatCerrado({ cerrado }: { cerrado: ChatCerrado }) {
  return (
    <div role="status" data-testid="chat-cerrado" className="animate-fadeIn flex items-center justify-center gap-2 border-t border-slate-200 bg-slate-100 px-4 py-4 text-center text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <Lock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>
        Este chat se cerró el {dia(cerrado.el)}. Se puede leer{cerrado.borrarDesde ? ` hasta el ${dia(cerrado.borrarDesde)} (y mientras haya un reclamo abierto)` : ''}.
      </span>
    </div>
  );
}
