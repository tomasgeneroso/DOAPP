import { Gift, Megaphone } from "lucide-react";
import { BarraDePestanas, PanelDePestana, usePestana, type Pestana } from "../../components/admin/Pestanas";
import FamilyCodes from "./FamilyCodes";
import InfluencerInvites from "./InfluencerInvites";

const PESTANAS: Pestana[] = [
  { id: "familia", rotulo: "Códigos de familia", icono: Gift },
  { id: "influencers", rotulo: "Invitaciones de influencers", icono: Megaphone },
];

/**
 * Códigos e invitaciones (solo el owner): los dos son beneficios que el owner entrega por código y quedaron juntos en una sola entrada del menú, con una
 * pestaña cada uno. Las direcciones viejas (`/admin/family-codes`, `/admin/influencer-invites`) siguen funcionando y abren la pestaña que corresponde.
 */
export default function CodigosDeAcceso({ inicial }: { inicial?: "familia" | "influencers" }) {
  const [actual, cambiar] = usePestana(PESTANAS, inicial);
  return (
    <div className="px-4 pt-4 sm:px-6 sm:pt-6">
      <BarraDePestanas pestanas={PESTANAS} actual={actual} onCambiar={cambiar} etiqueta="Códigos e invitaciones" />
      <PanelDePestana id={actual}>{actual === "influencers" ? <InfluencerInvites /> : <FamilyCodes />}</PanelDePestana>
    </div>
  );
}
