import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { post } from '../services/api';

/** Igual que en la web (shared/metricas/definiciones.ts): un latido por minuto mientras la app está en primer plano. */
const SEGUNDOS_ENTRE_LATIDOS = 60;
const CLAVE_DE_PRIMERA_APERTURA = 'primera_apertura_avisada';

const plataforma = (): 'android' | 'ios' | null => (Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null);

/** La primera vez que la app se abre en este teléfono suma uno a un contador. No manda ningún identificador del teléfono ni de la persona. */
async function avisarPrimeraApertura(): Promise<void> {
  const p = plataforma();
  if (!p) return;
  try {
    if (await SecureStore.getItemAsync(CLAVE_DE_PRIMERA_APERTURA)) return;
    const r = await post('/actividad/primera-apertura', { plataforma: p });
    // Solo se marca si el servidor lo recibió: sin conexión se vuelve a probar en la próxima apertura.
    if (r.success !== false) await SecureStore.setItemAsync(CLAVE_DE_PRIMERA_APERTURA, '1');
  } catch {
    /* contar nunca puede molestar */
  }
}

export function useLatidoDeUso(conSesion: boolean): void {
  useEffect(() => {
    void avisarPrimeraApertura();
  }, []);

  useEffect(() => {
    const p = plataforma();
    if (!conSesion || !p) return;
    let reloj: ReturnType<typeof setInterval> | null = null;
    const latir = () => { void post('/actividad/latido', { plataforma: p }).catch(() => undefined); };
    const parar = () => { if (reloj) { clearInterval(reloj); reloj = null; } };
    const empezar = () => {
      if (reloj) return;
      latir();
      reloj = setInterval(latir, SEGUNDOS_ENTRE_LATIDOS * 1000);
    };
    if (AppState.currentState === 'active') empezar();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? empezar() : parar()));
    return () => { parar(); sub.remove(); };
  }, [conSesion]);
}
