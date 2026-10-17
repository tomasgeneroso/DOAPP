import { useState } from "react";
import { BANCOS, MERCADO_PAGO, OTRO_BANCO, bancoDelCbu, esBancoDeLaLista, esCvu } from "../../../shared/constants/bancos";

interface Props {
  id?: string;
  /** Nombre del banco o billetera guardado (o escrito a mano, en cuentas viejas). */
  value: string;
  onChange: (nombre: string) => void;
  /** El CBU/CVU que se está cargando: si parece de otro banco que el elegido, se avisa (sin bloquear). */
  cbu?: string;
  required?: boolean;
  /** Clases del select y del campo de texto de «Otro». */
  className?: string;
}

/**
 * El banco se ELIGE de una lista (Mercado Pago, otras billeteras, bancos) en vez de escribirse: así «MP», «mercadopago» y «Mercado Pago»
 * dejan de ser tres destinos distintos para administración. Para lo que no está, «Otro…» abre un campo de texto.
 */
export default function SelectorDeBanco({ id, value, onChange, cbu, required, className = "" }: Props) {
  const enLista = esBancoDeLaLista(value);
  // Una cuenta vieja trae un nombre escrito a mano: se muestra como «Otro…» con ese texto, sin perderlo.
  const [eligioOtro, setEligioOtro] = useState(!!value && !enLista);
  const mostrarTexto = eligioOtro || (!!value && !enLista);
  const seleccion = mostrarTexto ? OTRO_BANCO : value;

  const billeteras = BANCOS.filter((b) => b.tipo === "billetera");
  const bancos = BANCOS.filter((b) => b.tipo === "banco");

  // Avisos al cargar el CBU: no bloquean, solo evitan transferir al banco equivocado por un error de tipeo.
  const delCbu = bancoDelCbu(cbu);
  const elegido = BANCOS.find((b) => b.nombre === value);
  let aviso: string | null = null;
  if (cbu && cbu.length >= 3) {
    if (delCbu && elegido && delCbu.nombre !== elegido.nombre) {
      aviso = `El CBU parece ser de ${delCbu.nombre}, y elegiste ${elegido.nombre}. Revisá que sea el correcto.`;
    } else if (esCvu(cbu) && elegido?.tipo === "banco") {
      aviso = `Ese número empieza con 000: es el CVU de una billetera virtual, no el CBU de un banco. Elegí la billetera (por ejemplo ${MERCADO_PAGO}).`;
    }
  }

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={seleccion}
        required={required}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTRO_BANCO) {
            setEligioOtro(true);
            onChange("");
          } else {
            setEligioOtro(false);
            onChange(v);
          }
        }}
        className={className}
      >
        <option value="" disabled>
          Elegí tu banco o billetera
        </option>
        <optgroup label="Billeteras virtuales">
          {billeteras.map((b) => (
            <option key={b.nombre} value={b.nombre}>
              {b.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="Bancos">
          {bancos.map((b) => (
            <option key={b.nombre} value={b.nombre}>
              {b.nombre}
            </option>
          ))}
        </optgroup>
        <option value={OTRO_BANCO}>Otro…</option>
      </select>

      {mostrarTexto && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nombre del banco o billetera"
          aria-label="Nombre del banco o billetera"
          required={required}
          maxLength={80}
          className={className}
        />
      )}

      {aviso && (
        <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
          {aviso}
        </p>
      )}
    </div>
  );
}
