import { Component, type ReactNode } from "react";

/**
 * Aísla una parte de una pantalla: si esa parte falla al dibujarse (un dato que llegó incompleto, un campo que no estaba), la pantalla
 * entera NO se reemplaza por «Algo salió mal»: se muestra un aviso chico en su lugar y el resto sigue funcionando.
 *
 * Es para las secciones accesorias de Configuración (membresía, promoción del perfil, verificaciones): ninguna es motivo para tirar
 * abajo el formulario que la persona vino a completar.
 */
export default class SeccionSegura extends Component<{ children: ReactNode; nombre?: string }, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Sección «${this.props.nombre || "sin nombre"}» no se pudo mostrar:`, error);
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 text-sm text-amber-800 dark:text-amber-300">
        No pudimos mostrar {this.props.nombre ? `«${this.props.nombre}»` : "esta sección"} ahora.{" "}
        <button type="button" onClick={() => this.setState({ fallo: false })} className="underline underline-offset-2">
          Reintentar
        </button>
      </div>
    );
  }
}
