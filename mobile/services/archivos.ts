import { Linking } from 'react-native';
import { get, getToken, API_URL } from './api';

/**
 * Archivos privados en la app (reclamos, tickets y bitácora ya no son públicos por dirección: auditoría de seguridad, 2026-11-24).
 *
 * - Para MOSTRAR una miniatura en la pantalla: `<Image source={{ uri, headers }}>` con `encabezadoDeSesion()` (así ya se muestran las fotos de entrega).
 * - Para ABRIR un archivo con el navegador del teléfono (no lleva la sesión): `abrirArchivo(url)`, que pide un enlace firmado de 10 minutos y lo abre.
 */
const ORIGEN = String(API_URL).replace(/\/api\/?$/, '');

export const direccionCompleta = (url: string): string => (/^https?:\/\//i.test(url) ? url : `${ORIGEN}${url.startsWith('/') ? '' : '/'}${url}`);

export async function encabezadoDeSesion(): Promise<Record<string, string> | undefined> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function abrirArchivo(url: string): Promise<void> {
  try {
    const r: any = await get<unknown>(`/archivo/enlace?ruta=${encodeURIComponent(url)}`);
    const firmada: string | undefined = r?.url ?? r?.data?.url;
    if (firmada) {
      await Linking.openURL(direccionCompleta(firmada));
      return;
    }
  } catch {
    /* sin enlace firmado se intenta con la dirección tal cual (sirve si el archivo es público) */
  }
  await Linking.openURL(direccionCompleta(url)).catch(() => {});
}
