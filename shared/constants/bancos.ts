/**
 * Bancos y billeteras donde se puede cobrar un retiro. Una sola lista para la web (retiro y perfil) y la app, así el nombre del banco se
 * elige y no se escribe: antes era un campo libre y cada persona anotaba «MP», «mercado pago», «Mercadopago»… y administración no podía
 * agrupar ni filtrar los retiros por destino.
 *
 * `codigo` son los tres primeros dígitos del CBU (código de entidad del BCRA): con él se avisa si el CBU parece de otro banco que el elegido.
 * Las billeteras virtuales no tienen: su número es un CVU (empieza con 000).
 */
export interface Banco {
  nombre: string;
  tipo: 'billetera' | 'banco';
  /** Código de entidad (primeros 3 dígitos del CBU), si el banco lo tiene fijo. */
  codigo?: string;
}

/** Lo que se guarda cuando la persona elige «otro» y escribe el nombre a mano. */
export const OTRO_BANCO = 'Otro';

export const MERCADO_PAGO = 'Mercado Pago';

export const BANCOS: readonly Banco[] = [
  { nombre: MERCADO_PAGO, tipo: 'billetera' },
  { nombre: 'Ualá', tipo: 'billetera' },
  { nombre: 'Brubank', tipo: 'banco', codigo: '143' },
  { nombre: 'Naranja X', tipo: 'billetera' },
  { nombre: 'Personal Pay', tipo: 'billetera' },
  { nombre: 'Banco Nación', tipo: 'banco', codigo: '011' },
  { nombre: 'Banco Provincia', tipo: 'banco', codigo: '014' },
  { nombre: 'Banco Ciudad', tipo: 'banco', codigo: '029' },
  { nombre: 'Banco Galicia', tipo: 'banco', codigo: '007' },
  { nombre: 'Santander', tipo: 'banco', codigo: '072' },
  { nombre: 'BBVA', tipo: 'banco', codigo: '017' },
  { nombre: 'Banco Macro', tipo: 'banco', codigo: '285' },
  { nombre: 'HSBC', tipo: 'banco', codigo: '150' },
  { nombre: 'ICBC', tipo: 'banco', codigo: '015' },
  { nombre: 'Banco Credicoop', tipo: 'banco', codigo: '191' },
  { nombre: 'Banco Supervielle', tipo: 'banco', codigo: '027' },
  { nombre: 'Banco Patagonia', tipo: 'banco', codigo: '034' },
  { nombre: 'Itaú', tipo: 'banco', codigo: '259' },
  { nombre: 'Banco Comafi', tipo: 'banco', codigo: '299' },
  { nombre: 'Banco Hipotecario', tipo: 'banco', codigo: '044' },
  { nombre: 'Banco del Sol', tipo: 'banco', codigo: '310' },
  { nombre: 'Banco de Córdoba (Bancor)', tipo: 'banco', codigo: '020' },
];

export const NOMBRES_DE_BANCOS: readonly string[] = BANCOS.map((b) => b.nombre);

/** ¿El nombre guardado es uno de la lista? Si no, es un valor escrito a mano (cuentas viejas): se muestra como «Otro» con ese texto. */
export function esBancoDeLaLista(nombre: string | null | undefined): boolean {
  return !!nombre && NOMBRES_DE_BANCOS.includes(nombre);
}

/** El banco al que pertenece un CBU por su código de entidad, si lo conocemos. Un CVU (empieza con 000) es de una billetera virtual. */
export function bancoDelCbu(cbu: string | null | undefined): Banco | null {
  const limpio = String(cbu || '').replace(/\D/g, '');
  if (limpio.length < 3) return null;
  const codigo = limpio.slice(0, 3);
  return BANCOS.find((b) => b.codigo === codigo) ?? null;
}

/** ¿Es un CVU (billetera virtual) y no un CBU de banco? */
export const esCvu = (cbu: string | null | undefined): boolean => /^000\d{19}$/.test(String(cbu || ''));
