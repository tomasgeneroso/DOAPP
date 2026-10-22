import { useState } from "react";
import { ShieldCheck, Upload, X } from "lucide-react";
import { useEditorDeFotos } from "../hooks/useEditorDeFotos";

/**
 * Archivos de la matrícula: hasta DOS archivos, cada uno una foto o un PDF (frente y reverso, dos fotos, o un PDF y una foto). El primero es
 * obligatorio para el panel; el segundo es opcional. Las fotos pasan por el editor (rotar, centrar, recortar) antes de subirse.
 *
 * Qué se le dice a la persona (es lo mismo que dicen los Términos 4.6 y la Política de Privacidad): se guardan encriptados,
 * DOAPP no verifica la matrícula (se basa en su buena fe) y el cliente que la contrata puede verla para verificarla por su
 * cuenta una vez que hay un contrato entre los dos. Los enlaces «Ver» abren la dirección que desencripta el archivo: no
 * existe una dirección pública del archivo.
 */

type Lado = "front" | "back";

interface Props {
  token: string;
  frente: string;
  dorso: string;
  setFrente: (v: string) => void;
  setDorso: (v: string) => void;
  /** Para una profesión que no exige matrícula (título, certificados): no se marca como obligatorio. */
  opcional?: boolean;
}

const CAMPO: Record<Lado, string> = { front: "licenseDocument", back: "licenseDocumentBack" };

export default function MatriculaArchivos({ token, frente, dorso, setFrente, setDorso, opcional = false }: Props) {
  const { editarUna, editor } = useEditorDeFotos();
  const [ocupado, setOcupado] = useState<Lado | null>(null);
  const [error, setError] = useState("");

  const aplicar = (data: any) => {
    setFrente(data?.licenseDocumentUrl || "");
    setDorso(data?.licenseDocumentBackUrl || "");
  };

  const subir = async (lado: Lado, elegido: File | undefined) => {
    if (!elegido) return;
    setError("");
    // Una foto se puede rotar, centrar y recortar antes de subirla; un PDF va como está. Cancelar = no se sube.
    const archivo = await editarUna(elegido, { titulo: "Editar la foto del documento" });
    if (!archivo) return;
    setOcupado(lado);
    try {
      const fd = new FormData();
      fd.append(CAMPO[lado], archivo);
      const res = await fetch("/api/auth/license-document", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) aplicar(data);
      else setError(data.message || "No se pudo subir el archivo");
    } catch {
      setError("No se pudo subir el archivo. Probá de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  const quitar = async (lado: Lado) => {
    setError("");
    setOcupado(lado);
    try {
      const res = await fetch(`/api/auth/license-document/${lado}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) aplicar(data);
      else setError(data.message || "No se pudo quitar el archivo");
    } catch {
      setError("No se pudo quitar el archivo. Probá de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  const fila = (lado: Lado, titulo: string, url: string, deshabilitado: boolean) => (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{titulo}</p>
      {url ? (
        <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
          <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-300 flex-1 truncate">Cargado (guardado encriptado)</span>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:text-sky-700 underline">
            Ver
          </a>
          <button
            type="button"
            onClick={() => quitar(lado)}
            disabled={ocupado !== null || (lado === "front" && !!dorso)}
            title={lado === "front" && dorso ? "Quitá primero el archivo 2" : "Quitar"}
            className="text-red-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center gap-1 h-24 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg ${
            deshabilitado ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-sky-400"
          }`}
        >
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {ocupado === lado ? "Subiendo..." : deshabilitado ? "Subí primero el archivo 1" : "Elegí una foto o un PDF"}
          </span>
          <span className="text-xs text-slate-400">JPG, PNG, WEBP o PDF · hasta 10 MB</span>
          <input
            type="file"
            className="hidden"
            disabled={deshabilitado || ocupado !== null}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              subir(lado, e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {fila("front", opcional ? "Archivo 1 (foto o PDF)" : "Archivo 1 de la matrícula (foto o PDF) *", frente, false)}
      {fila("back", "Archivo 2 (opcional: el reverso, otra foto o un PDF)", dorso, !frente)}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {editor}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Tus archivos se guardan <strong>encriptados</strong>. DOAPP <strong>no verifica</strong> la matrícula: se basa en tu buena fe,
        y quien te contrata puede verla para comprobarla por su cuenta una vez que hay un contrato entre los dos.
      </p>
    </div>
  );
}
