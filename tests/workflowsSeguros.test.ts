import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Los workflows de GitHub Actions.
 *
 * Lo que había: las acciones se citaban por una etiqueta móvil (`@v4`, `@v1.0.0`): quien controle esa
 * etiqueta cambia lo que corre con los secretos del repositorio, y la acción de SSH recibe la llave privada
 * del servidor. No había bloque `permissions:` (el token queda con los permisos por defecto del repo, a menudo
 * de escritura). Si el deploy de producción fallaba después de mover el código, producción quedaba caída con el
 * código nuevo roto. Y staging usaba `${GITHUB_REF_NAME:-master}` dentro de la sesión SSH, donde esa variable
 * no existe: desplegaba siempre master.
 */

const raiz = process.cwd();
const dir = '.github/workflows';
const workflows = readdirSync(join(raiz, dir)).filter((f) => /\.ya?ml$/.test(f));
const leer = (f: string) => readFileSync(join(raiz, dir, f), 'utf8').replace(/\r\n/g, '\n');

describe('workflows de GitHub Actions', () => {
  it('hay workflows para revisar', () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it.each(workflows)('%s: toda acción externa está fijada por el SHA de un commit (40 hex), no por una etiqueta', (f) => {
    const usos = [...leer(f).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((m) => m[1]);
    expect(usos.length).toBeGreaterThan(0);
    const sinFijar = usos.filter((u) => !u.startsWith('./') && !/@[0-9a-f]{40}$/.test(u));
    expect(sinFijar).toEqual([]);
  });

  it.each(workflows)('%s: declara permisos mínimos para el GITHUB_TOKEN (sólo lectura)', (f) => {
    const t = leer(f);
    expect(t).toMatch(/^permissions:\n\s+contents:\s*read\s*$/m);
    expect(t).not.toMatch(/contents:\s*write/);
    expect(t).not.toMatch(/permissions:\s*write-all/);
  });

  it.each(workflows)('%s: no usa pull_request_target ni imprime secretos', (f) => {
    const t = leer(f);
    expect(t).not.toMatch(/pull_request_target/);
    expect(t).not.toMatch(/echo\s+["']?\$\{\{\s*secrets\./);
  });

  describe('deploy a producción (ci-cd.yml)', () => {
    const t = leer('ci-cd.yml');

    it('guarda el commit anterior y vuelve a él si el servidor no levanta o se cae', () => {
      expect(t).toContain('ANTERIOR="$(git rev-parse HEAD)"');
      expect(t).toContain('volver_atras()');
      // las dos salidas con error llaman al rollback ANTES de salir
      const fallas = [...t.matchAll(/volver_atras \|\| true\n\s+exit 1/g)].length;
      expect(fallas).toBe(2);
    });

    it('el rollback no pasa por alto la reconstrucción ni el reinicio', () => {
      const bloque = t.slice(t.indexOf('volver_atras() {'), t.indexOf('echo "📥 Pulling latest code..."'));
      for (const paso of ['git reset --hard "$ANTERIOR"', 'npm run build:client', 'pm2 start ecosystem.config.cjs']) {
        expect(bloque).toContain(paso);
      }
    });
  });

  describe('deploy a staging (staging.yml)', () => {
    const t = leer('staging.yml');

    it('la rama llega a la sesión SSH (variable del runner + envs)', () => {
      expect(t).toContain('envs: GITHUB_REF_NAME');
      expect(t).toMatch(/env:\n\s+GITHUB_REF_NAME:\s*\$\{\{\s*github\.ref_name\s*\}\}/);
    });

    it('tiene el mismo tiempo máximo que producción (el de 10 minutos por defecto ya mató deploys)', () => {
      expect(t).toContain('command_timeout: 25m');
    });
  });
});
