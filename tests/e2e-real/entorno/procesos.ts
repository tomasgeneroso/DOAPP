import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Los procesos que levantan las pruebas (servidor, gemelos, web) y cómo cortarlos. Cada uno escribe su registro en `tests/e2e-real/.registros/`. */
export interface Proceso {
  nombre: string;
  hijo: ChildProcess;
  /** Lo último que escribió (para mostrar si no arranca). */
  ultimas: () => string;
}

const RAIZ = process.cwd();
export const CARPETA_DE_REGISTROS = join(RAIZ, 'tests', 'e2e-real', '.registros');

export function lanzar(nombre: string, comando: string, args: string[], env: Record<string, string | undefined>): Proceso {
  mkdirSync(CARPETA_DE_REGISTROS, { recursive: true });
  const registro = createWriteStream(join(CARPETA_DE_REGISTROS, `${nombre}.log`), { flags: 'w' });
  const hijo = spawn(comando, args, { cwd: RAIZ, env: { ...process.env, ...env }, shell: true, windowsHide: true });
  let cola = '';
  const guardar = (d: Buffer) => {
    registro.write(d);
    cola = (cola + d.toString()).slice(-4000);
  };
  hijo.stdout?.on('data', guardar);
  hijo.stderr?.on('data', guardar);
  return { nombre, hijo, ultimas: () => cola };
}

/** Corta el proceso y todo lo que lanzó (en Windows `kill` solo mata al intérprete de comandos). */
export function cortar(p: Proceso | undefined): void {
  if (!p?.hijo.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.hijo.pid), '/T', '/F'], { windowsHide: true });
  else p.hijo.kill('SIGTERM');
}

export async function esperarHasta(descripcion: string, listo: () => Promise<boolean>, ms: number, proceso?: Proceso): Promise<void> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (proceso && proceso.hijo.exitCode !== null) throw new Error(`${descripcion}: el proceso «${proceso.nombre}» se cortó solo.\n${proceso.ultimas()}`);
    try {
      if (await listo()) return;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${descripcion}: no estuvo listo en ${Math.round(ms / 1000)} s.${proceso ? `\n${proceso.ultimas()}` : ''}`);
}

export async function responde(url: string, https = false): Promise<boolean> {
  if (https) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  return r.status < 500;
}
