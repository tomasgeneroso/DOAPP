import { useState } from "react";

/**
 * La foto de perfil, o la inicial del nombre si no hay foto o no carga (un archivo que falta no tiene que dejar un círculo vacío o el texto
 * «Avatar» del navegador). `key={src}` reinicia el fallo cuando cambia la foto.
 */
function Interno({ src, nombre, className }: { src?: string | null; nombre?: string | null; className: string }) {
  const [fallo, setFallo] = useState(false);
  const inicial = (nombre || "?").trim().charAt(0).toUpperCase() || "?";
  if (!src || fallo) {
    return (
      <div className={`${className} flex items-center justify-center bg-sky-500 font-bold text-white`} role="img" aria-label={nombre ? `Sin foto: ${nombre}` : "Sin foto"}>
        {inicial}
      </div>
    );
  }
  return <img src={src} alt={nombre ? `Foto de ${nombre}` : "Foto de perfil"} className={`${className} object-cover`} onError={() => setFallo(true)} />;
}

export default function AvatarConInicial(props: { src?: string | null; nombre?: string | null; className: string }) {
  return <Interno key={props.src ?? "sin-foto"} {...props} />;
}
