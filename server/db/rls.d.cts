export const ROL_DE_LA_APP: string;
export interface TablaRls {
  tanda: 'dinero' | 1 | 2 | 3;
  mia: string;
  equipo?: 'soporte' | 'equipo';
  borra?: 'mia';
}
export const TABLAS: Record<string, TablaRls>;
export const TANDAS: Tanda[];
export const SOLO_AGREGAR: string[];
export type Tanda = 'dinero' | 1 | 2 | 3 | 'rastro';
export interface OpcionesRls {
  tandas?: Tanda[];
}
/** `ejecutar(sql, true)` tiene que devolver verdadero si `SELECT to_regclass(...)` encontró la tabla. */
export type Ejecutar = (sql: string, escalar?: boolean) => Promise<any>;
export function aplicarRls(ejecutar: Ejecutar, opciones?: OpcionesRls): Promise<{ protegidas: string[]; saltadas: string[] }>;
export function quitarRls(ejecutar: Ejecutar, opciones?: OpcionesRls): Promise<void>;
export function tablasDe(tandas?: Tanda[]): string[];
export function sinBorrarElRastro(ejecutar: Ejecutar): Promise<string[]>;
export function conBorradoDelRastro(ejecutar: Ejecutar): Promise<void>;
export function sqlDelRol(): string[];
export function sqlDeLaTabla(tabla: string): string[];
