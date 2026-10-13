import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Pantalla from '../../components/Pantalla';
import { buscarPerfilPorUsuario } from '../../services/perfilPublico';

/** Enlace público de una persona (`doapp://u/<usuario>`): busca a quién corresponde y abre su perfil. */
export default function PerfilPorUsuario() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    (async () => {
      const r = await buscarPerfilPorUsuario(username);
      if (!vigente) return;
      if (r.ok) router.replace(`/user/${r.id}` as any);
      else setError(r.mensaje);
    })();
    return () => { vigente = false; };
  }, [username]);

  return <Pantalla titulo="Perfil" cargando={!error} error={error} volverA="/(tabs)" />;
}
