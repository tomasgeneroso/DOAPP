import { useCallback, useRef, useState } from "react";
import {
  cambiosPorElBarrio,
  nombreDeZona,
  ubicarBarrio,
  ubicarCodigoPostal,
  type ContextoDeZona,
} from "../../shared/geo/coherenciaDeDireccion";

/**
 * Deja la dirección CONGRUENTE cuando la persona cambia el barrio o el código postal a mano (pedido del dueño, 2026-11-13): se ubica lo escrito y cambian con
 * ello el punto del mapa, la ciudad y el código postal (o el barrio); si la calle de antes ya no corresponde, se borra y se avisa.
 * Lo usan el formulario de crear y el de editar un trabajo.
 */
interface Params {
  zona: ContextoDeZona;
  hayCalle: boolean;
  setLocation: (v: string) => void;
  setNeighborhood: (v: string) => void;
  setPostalCode: (v: string) => void;
  setAddressStreet: (v: string) => void;
  setAddressNumber: (v: string) => void;
  setLatitude: (v: number) => void;
  setLongitude: (v: number) => void;
  setContextoGeo: (v: ContextoDeZona) => void;
}

export interface AvisoDeDireccion {
  tipo: "info" | "problema";
  texto: string;
}

export function useCoherenciaDeDireccion(p: Params) {
  const [aviso, setAviso] = useState<AvisoDeDireccion | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const turno = useRef(0);

  const completarDesdeBarrio = useCallback(
    async (barrio: string, codigoDeLaLista?: string) => {
      const b = barrio.trim();
      if (b.length < 3) return;
      const mio = ++turno.current;
      setUbicando(true);
      setAviso(null);
      try {
        const z = await ubicarBarrio(b, p.zona);
        if (mio !== turno.current) return; // llegó tarde: la persona ya cambió otra cosa
        if (!z) {
          if (codigoDeLaLista) p.setPostalCode(codigoDeLaLista);
          setAviso({ tipo: "problema", texto: `No pudimos ubicar «${b}» en el mapa. Revisá el nombre del barrio o marcá el punto a mano en el mapa.` });
          return;
        }
        const c = cambiosPorElBarrio(z, p.zona, p.hayCalle, codigoDeLaLista);
        p.setLatitude(c.lat);
        p.setLongitude(c.lon);
        p.setContextoGeo(c.zona);
        if (c.ubicacion) p.setLocation(c.ubicacion);
        p.setPostalCode(c.codigoPostal);
        if (c.borrarCalle) {
          p.setAddressStreet("");
          p.setAddressNumber("");
          setAviso({ tipo: "info", texto: "Cambiaste el barrio: borramos la calle y el número para que la dirección coincida. Elegí la calle de nuevo." });
        }
      } finally {
        if (mio === turno.current) setUbicando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.zona.ciudad, p.zona.provincia, p.hayCalle],
  );

  const completarDesdeCodigoPostal = useCallback(
    async (codigo: string) => {
      const mio = ++turno.current;
      setUbicando(true);
      setAviso(null);
      try {
        const z = await ubicarCodigoPostal(codigo, p.zona);
        if (mio !== turno.current) return;
        if (!z) {
          setAviso({ tipo: "problema", texto: `No encontramos el código postal ${codigo.toUpperCase()} en ${nombreDeZona(p.zona.ciudad, p.zona.provincia) || "esa zona"}. Revisalo o elegí el barrio.` });
          return;
        }
        p.setLatitude(z.lat);
        p.setLongitude(z.lon);
        p.setContextoGeo({ ciudad: z.ciudad || p.zona.ciudad, provincia: z.provincia || p.zona.provincia });
        const nueva = nombreDeZona(z.ciudad, z.provincia);
        if (nueva && !(p.zona.ciudad && z.ciudad.toLowerCase() === p.zona.ciudad.toLowerCase())) p.setLocation(nueva);
        // El barrio es el del punto del código postal; si no se sabe cuál es, se vacía antes que dejar uno que no corresponde.
        p.setNeighborhood(z.barrio);
        if (p.hayCalle) {
          p.setAddressStreet("");
          p.setAddressNumber("");
          setAviso({ tipo: "info", texto: "Cambiaste el código postal: actualizamos el barrio y el mapa, y borramos la calle y el número para que la dirección coincida." });
        }
      } finally {
        if (mio === turno.current) setUbicando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.zona.ciudad, p.zona.provincia, p.hayCalle],
  );

  return { aviso, ubicando, completarDesdeBarrio, completarDesdeCodigoPostal, limpiarAviso: () => setAviso(null) };
}
