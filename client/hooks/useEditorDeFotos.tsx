import { useCallback, useState, type ReactElement } from "react";
import ImageEditorModal from "../components/profile/ImageEditorModal";

export interface OpcionesDeEdicion {
  /** Proporción fija (ancho / alto). Sin esto, la persona elige: original, 1:1, 4:3 o 16:9. */
  aspect?: number;
  /** 'round' para avatares. */
  cropShape?: "rect" | "round";
  titulo?: string;
}

interface Pendiente {
  file: File;
  url: string;
  opciones: OpcionesDeEdicion;
  titulo: string;
  resolver: (f: File | null) => void;
}

/** Tipos que se editan: GIF (animado) y SVG se dejan tal cual. */
const EDITABLE = /^image\/(jpeg|jpg|png|webp|heic|heif|avif|bmp)$/i;

const conExtension = (nombre: string, tipo: string) => {
  const base = nombre.replace(/\.[^./\\]+$/, "") || "foto";
  return `${base}${tipo === "image/png" ? ".png" : ".jpg"}`;
};

/**
 * Editor de fotos al elegirlas: rotar, centrar, acercar y recortar.
 *
 *   const { editar, editarUna, editor } = useEditorDeFotos();
 *   const listas = await editar(Array.from(e.target.files));   // una por una; lo que no es foto pasa sin tocar
 *   ...
 *   return <>{...}{editor}</>;                                 // hay que dibujar `editor` en algún lado
 *
 * En cada foto la persona puede guardar lo editado, «Usar original» o cancelar (esa foto se descarta). `editar` devuelve las que quedaron.
 */
export function useEditorDeFotos() {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  const editarUna = useCallback(
    (file: File, opciones: OpcionesDeEdicion = {}, titulo = ""): Promise<File | null> => {
      if (!EDITABLE.test(file.type)) return Promise.resolve(file);
      return new Promise((resolver) => {
        setPendiente({ file, url: URL.createObjectURL(file), opciones, titulo: titulo || opciones.titulo || "Editar foto", resolver });
      });
    },
    [],
  );

  const editar = useCallback(
    async (files: File[], opciones: OpcionesDeEdicion = {}): Promise<File[]> => {
      const aEditar = files.filter((f) => EDITABLE.test(f.type)).length;
      const salida: File[] = [];
      let n = 0;
      for (const f of files) {
        if (!EDITABLE.test(f.type)) {
          salida.push(f);
          continue;
        }
        n += 1;
        const titulo = aEditar > 1 ? `${opciones.titulo || "Editar foto"} (${n} de ${aEditar})` : opciones.titulo || "Editar foto";
        const r = await editarUna(f, opciones, titulo);
        if (r) salida.push(r);
      }
      return salida;
    },
    [editarUna],
  );

  const cerrar = (resultado: File | null) => {
    if (!pendiente) return;
    URL.revokeObjectURL(pendiente.url);
    pendiente.resolver(resultado);
    setPendiente(null);
  };

  const editor: ReactElement | null = pendiente ? (
    <ImageEditorModal
      key={pendiente.url}
      imageSrc={pendiente.url}
      aspect={pendiente.opciones.aspect ?? 1}
      aspectLocked={pendiente.opciones.aspect !== undefined}
      cropShape={pendiente.opciones.cropShape}
      title={pendiente.titulo}
      outputType={pendiente.file.type === "image/png" ? "image/png" : "image/jpeg"}
      onUseOriginal={() => cerrar(pendiente.file)}
      onCancel={() => cerrar(null)}
      onConfirm={(blob) => cerrar(new File([blob], conExtension(pendiente.file.name, blob.type), { type: blob.type, lastModified: Date.now() }))}
    />
  ) : null;

  return { editar, editarUna, editor };
}
