import { useEffect, useState } from "react";

/**
 * Una imagen de una carpeta privada (comprobantes, DNI, entregas): se pide con la sesión de la persona y se muestra desde la memoria.
 *
 * Un `<img src>` común depende de que el navegador mande la cookie de sesión; si no la manda (otro dominio, cookie bloqueada, sesión que vive solo en el
 * navegador) el servidor contesta 401 y la imagen aparece rota sin decir por qué. Acá la sesión viaja siempre en el pedido y, si falla, se dice POR QUÉ
 * (sin sesión, sin permiso, el archivo no está en el servidor) en vez de «No se pudo cargar la imagen».
 */
type Estado = { fase: "cargando" } | { fase: "lista"; url: string } | { fase: "error"; estado: number };

const MENSAJES: Record<number, string> = {
  401: "El servidor no recibió tu sesión para mostrar este archivo. Cerrá sesión, volvé a entrar y probá de nuevo.",
  403: "Este archivo lo ven solo las partes del trabajo y el equipo de DOAPP.",
  404: "El archivo no está en el servidor (se registró pero no se encontró el archivo).",
};

export default function ImagenProtegida({ src, alt, className = "", testid }: { src: string; alt: string; className?: string; testid?: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  useEffect(() => {
    let vivo = true;
    let objeto: string | null = null;
    setEstado({ fase: "cargando" });
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {
      /* sin almacenamiento: queda la cookie */
    }
    fetch(src, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(async (r) => {
        if (!r.ok) {
          if (vivo) setEstado({ fase: "error", estado: r.status });
          return;
        }
        const blob = await r.blob();
        if (!vivo) return;
        objeto = URL.createObjectURL(blob);
        setEstado({ fase: "lista", url: objeto });
      })
      .catch(() => {
        if (vivo) setEstado({ fase: "error", estado: 0 });
      });
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [src]);

  if (estado.fase === "cargando") {
    return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700 ${className}`} style={{ minHeight: 96 }} aria-label="Cargando imagen" data-testid={testid ? `${testid}-cargando` : undefined} />;
  }
  if (estado.fase === "error") {
    return (
      <div role="alert" className="rounded-lg border border-gray-200 py-5 px-3 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400" data-testid={testid ? `${testid}-error` : "imagen-con-error"}>
        {MENSAJES[estado.estado] ?? `No se pudo cargar la imagen (${estado.estado ? `el servidor respondió ${estado.estado}` : "sin conexión con el servidor"}).`}
        <a href={src} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sky-600 hover:underline dark:text-sky-400">
          Abrir en pestaña nueva
        </a>
      </div>
    );
  }
  return <img src={estado.url} alt={alt} className={className} data-testid={testid} />;
}
