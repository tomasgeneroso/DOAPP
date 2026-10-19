import { IdCard, ShieldOff } from "lucide-react";
import { BarraDePestanas, PanelDePestana, usePestana, type Pestana } from "../../components/admin/Pestanas";
import IdentidadARevisar from "./IdentidadARevisar";
import BannedIdentities from "./BannedIdentities";

/**
 * Identidades: lo que hay que mirar (un DNI que Didit leyó y ya usa otra cuenta) y lo que ya se decidió (identidades baneadas) son el
 * mismo asunto, así que viven juntas. Las direcciones viejas siguen funcionando: los avisos del servidor linkean a `identidad-a-revisar`.
 */
export default function Identidades({ inicial, pendientes }: { inicial?: "revisar" | "baneadas"; pendientes?: number }) {
  const pestanas: Pestana[] = [
    { id: "revisar", rotulo: "A revisar", icono: IdCard, insignia: pendientes && pendientes > 0 ? pendientes : undefined },
    { id: "baneadas", rotulo: "Baneadas", icono: ShieldOff },
  ];
  const [actual, cambiar] = usePestana(pestanas, inicial);
  return (
    <div className="px-4 pt-4 sm:px-6 sm:pt-6">
      <BarraDePestanas pestanas={pestanas} actual={actual} onCambiar={cambiar} etiqueta="Identidades" />
      <PanelDePestana id={actual}>{actual === "baneadas" ? <BannedIdentities /> : <IdentidadARevisar />}</PanelDePestana>
    </div>
  );
}
