import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { separarDatosPrivados } from './datosPrivadosDeLaDireccion';

export { CLAVES_PRIVADAS_DE_LA_DIRECCION, separarDatosPrivados } from './datosPrivadosDeLaDireccion';

/**
 * La barra de direcciones no muestra identificadores de objetos (pedido del dueño, 2026-11-19: «a veces la url muestra el id del objeto: no mostrar información por
 * url, evitar todo lo posible cosas que puedan ayudar a los hackers»).
 *
 * Los pedidos entre pantallas (cotizar, reclamar, escribir a soporte sobre un trabajo o un contrato) viajaban en la dirección: \`/quotes/new?recipientId=…&jobId=…\`.
 * Esa dirección queda en el historial, en los registros, en lo que se comparte por error y en la captura de pantalla de quien pide ayuda. Ahora, apenas llega la
 * persona, esos datos se pasan al estado del historial del navegador (no se ven en la dirección, sobreviven a recargar la página y no viajan en el \`Referer\`) y la
 * dirección queda limpia. Lo que lee cada pantalla sale de \`useParametrosDeLaRuta\`, que junta lo del estado y lo de la dirección (los enlaces viejos siguen andando).
 *
 * Ojo: esconder el identificador NO es la defensa. Los identificadores son UUID (no se adivinan) y cada ruta del servidor comprueba que la persona sea parte del
 * objeto; esto solo evita regalar datos de más.
 */
/** Lo que pide la pantalla: los datos guardados en el historial más lo que traiga la dirección. Se lee igual que `useSearchParams`. */
export function useParametrosDeLaRuta(): URLSearchParams {
  const location = useLocation();
  return useMemo(() => {
    const juntos = new URLSearchParams(location.search);
    const guardados = (location.state as { datosPrivados?: Record<string, string> } | null)?.datosPrivados;
    if (guardados) for (const [k, v] of Object.entries(guardados)) juntos.set(k, v);
    return juntos;
  }, [location.search, location.state]);
}

/** Pasa los datos privados de la dirección al estado del historial y deja la dirección limpia. Va una sola vez, dentro del Router. */
export function LimpiarDireccion(): null {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const { publica, privados } = separarDatosPrivados(location.search);
    if (Object.keys(privados).length === 0) return;
    const previos = (location.state as { datosPrivados?: Record<string, string> } | null)?.datosPrivados ?? {};
    navigate({ pathname: location.pathname, search: publica, hash: location.hash }, { replace: true, state: { ...(location.state as object | null), datosPrivados: { ...previos, ...privados } } });
  }, [location, navigate]);
  return null;
}
