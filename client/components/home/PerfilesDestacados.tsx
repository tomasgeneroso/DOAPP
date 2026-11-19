import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PromotedCard } from '../profile/ProfilePromotion';

/**
 * Los perfiles que pagaron días de promoción, en el muro de trabajos («Promocionar perfil», Configuración). Antes la promoción se reservaba pero no se mostraba en ningún lado:
 * nadie podía ver lo que se compraba. Se piden los que están vigentes HOY (pagos y activos), se mezclan para que todos tengan su turno y se muestran hasta tres, con la marca
 * «Promocionado» (siempre se aclara que es publicidad). No aparece si no hay ninguno.
 */
interface Perfil {
  id: string;
  username: string | null;
  name: string;
  avatar: string | null;
  rating: number;
  reviewsCount: number;
  skills: string[];
  location: string | null;
}

export default function PerfilesDestacados({ excluirId }: { excluirId?: string }) {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);

  useEffect(() => {
    let vigente = true;
    // El servidor sortea quiénes se muestran y cuenta la impresión de cada uno.
    fetch(`/api/profile-promotion/activos${excluirId ? `?excluir=${encodeURIComponent(excluirId)}` : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vigente || !d?.success || !Array.isArray(d.data)) return;
        setPerfiles(d.data as Perfil[]);
      })
      .catch(() => {
        /* sin destacados: el muro se ve igual */
      });
    return () => {
      vigente = false;
    };
  }, [excluirId]);

  if (perfiles.length === 0) return null;
  return (
    <section aria-label="Profesionales destacados" className="mb-6" data-testid="perfiles-destacados">
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Profesionales destacados</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {perfiles.map((p) => (
          <Link
            key={p.id}
            to={`/profile/${p.username || p.id}`}
            onClick={() => {
              // un clic más para sus estadísticas (no frena la navegación)
              void fetch('/api/profile-promotion/clic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfilId: p.id }), keepalive: true }).catch(() => undefined);
            }}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            <PromotedCard p={{ name: p.name, avatar: p.avatar, rating: p.rating, reviewsCount: p.reviewsCount, skills: p.skills, location: p.location }} />
          </Link>
        ))}
      </div>
    </section>
  );
}
