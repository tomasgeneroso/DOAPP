export const ROL_DE_LA_APP: string;
export const TABLAS: Record<string, { mia: string }>;
/** `ejecutar(sql, true)` tiene que devolver verdadero si `SELECT to_regclass(...)` encontró la tabla. */
export type Ejecutar = (sql: string, escalar?: boolean) => Promise<any>;
export function aplicarRls(ejecutar: Ejecutar): Promise<{ protegidas: string[]; saltadas: string[] }>;
export function quitarRls(ejecutar: Ejecutar): Promise<void>;
export function sqlDelRol(): string[];
export function sqlDeLaTabla(tabla: string): string[];
