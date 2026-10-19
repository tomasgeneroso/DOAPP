import { BookOpen, LifeBuoy } from "lucide-react";
import { BarraDePestanas, PanelDePestana, usePestana, type Pestana } from "../../components/admin/Pestanas";
import Manual from "./Manual";
import GuiaDeErrores from "./GuiaDeErrores";

const PESTANAS: Pestana[] = [
  { id: "manual", rotulo: "Manual del equipo", icono: BookOpen },
  { id: "errores", rotulo: "Guía de errores", icono: LifeBuoy },
];

/**
 * Ayuda y manuales: todo lo que explica «cómo se hace» y «qué significa» en un solo lugar. Antes eran dos entradas sueltas del menú
 * (el manual y la guía de errores). Las direcciones viejas (`/admin/manual`, `/admin/guia-de-errores#CODIGO`) siguen funcionando y abren
 * la pestaña que corresponde: el servidor linkea la guía con el código en el ancla.
 */
export default function Ayuda({ inicial }: { inicial?: "manual" | "errores" }) {
  const [actual, cambiar] = usePestana(PESTANAS, inicial);
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6 sm:pt-6">
      <BarraDePestanas pestanas={PESTANAS} actual={actual} onCambiar={cambiar} etiqueta="Ayuda y manuales" />
      <PanelDePestana id={actual}>{actual === "errores" ? <GuiaDeErrores /> : <Manual />}</PanelDePestana>
    </div>
  );
}
