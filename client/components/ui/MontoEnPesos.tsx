/**
 * Un monto en pesos escrito con puntos de miles mientras se tipea: 50000 → 50.000 (sin puntos es difícil saber si son cincuenta
 * mil o quinientos mil). Lo que se guarda y se envía son solo los dígitos: un campo oculto con `name` lleva el número limpio, así
 * un formulario que lee los datos con FormData recibe «50000», no «50.000».
 */
export const soloDigitos = (v: string): string => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);

export const conPuntosDeMiles = (digitos: string): string => (digitos ? Number(digitos).toLocaleString("es-AR") : "");

export default function MontoEnPesos({
  value,
  onChange,
  name,
  required,
  placeholder,
  className,
  disabled,
}: {
  /** Solo dígitos. */
  value: string;
  onChange: (digitos: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={conPuntosDeMiles(value)}
        onChange={(e) => onChange(soloDigitos(e.target.value))}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}
