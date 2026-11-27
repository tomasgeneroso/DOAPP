import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect } from './base';
import { correo } from './gemelos-cliente';
import { variablesDelServidor } from '../entorno/variables';

/**
 * Una PERSONA de las pruebas: alguien con su correo, su clave y su documento, que usa el navegador como lo haría de verdad. Cada método es una cosa
 * que se hace con los ojos y las manos: llenar el formulario de registro, abrir el correo, ingresar.
 */
let serie = 0;

export interface Datos {
  nombre: string;
  apellido: string;
  correo: string;
  clave: string;
  dni: string;
  telefono: string;
}

/** Datos nuevos y únicos (el correo y el DNI no se pueden repetir en DOAPP). */
export function datosNuevos(etiqueta: string): Datos {
  serie += 1;
  const sello = `${Date.now().toString(36)}${serie}`;
  const dni = String(21_000_000 + ((Date.now() * 7 + serie * 97_531) % 9_000_000));
  return {
    nombre: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1).toLowerCase(),
    apellido: 'Prueba',
    correo: `${etiqueta.toLowerCase()}.${sello}@e2e.doapp.test`,
    clave: 'Clave-Segura-123',
    dni: dni.endsWith('0000') || dni.endsWith('1111') ? `${dni.slice(0, 7)}7` : dni,
    telefono: `11${String(55_000_000 + serie * 13)}`,
  };
}

export class Persona {
  constructor(
    public readonly page: Page,
    public readonly datos: Datos,
  ) {}

  static nueva(page: Page, etiqueta: string): Persona {
    return new Persona(page, datosNuevos(etiqueta));
  }

  get correo(): string {
    return this.datos.correo;
  }

  /**
   * El registro de un solo paso, como lo hace una persona (regla del dueño, 2026-11-12): nombre, apellido, usuario, correo, contraseña, DNI, teléfono y
   * términos. No abre sesión: se ingresa después de confirmar el correo.
   */
  async registrarse(): Promise<void> {
    const { page, datos } = this;
    await page.goto('/register');
    await page.locator('input[name=firstName]').fill(datos.nombre);
    await page.locator('input[name=lastName]').fill(datos.apellido);
    await page.locator('input[name=username]').fill(datos.correo.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(-20));
    await page.locator('input[name=email]').fill(datos.correo);
    await page.locator('input[name=password]').fill(datos.clave);
    await page.locator('input[name=dni]').fill(datos.dni);
    await page.locator('input[name=phone]').fill(datos.telefono);
    await page.locator('input[name=termsAccepted]').check();
    const alta = page.waitForResponse((r) => r.url().includes('/api/auth/register') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Registrarme' }).last().click();
    const respuesta = await alta;
    expect(respuesta.status(), await respuesta.text()).toBeLessThan(300);
  }

  /** Abre el correo de confirmación y toca el enlace. */
  async confirmarElCorreo(): Promise<void> {
    const mail = await correo.esperar(this.correo, /Confirmá tu email/i);
    await this.page.goto(correo.enlace(mail, /verify-email/));
    await expect(this.page.getByText(/Email verificado/i).first()).toBeVisible();
  }

  async ingresar(): Promise<void> {
    const { page, datos } = this;
    await page.goto('/login');
    await page.locator('input[name=email]').fill(datos.correo);
    await page.locator('input[name=password]').fill(datos.clave);
    await page.getByRole('button', { name: 'Iniciar Sesión' }).last().click();
  }

  /** Ingresa y espera a que la web deje la pantalla de ingreso (la persona ya está adentro). */
  async entrar(): Promise<void> {
    await this.ingresar();
    await this.page.waitForURL((u) => !/\/(login|register)/.test(u.pathname), { timeout: 20_000 });
  }

  /** Todo el alta: registrarse, confirmar el correo e ingresar. Termina con la sesión abierta. */
  async darseDeAlta(): Promise<void> {
    await this.registrarse();
    await this.confirmarElCorreo();
    await this.ingresar();
    await this.page.waitForURL((u) => !/\/(login|register|verify-email|complete-registration)/.test(u.pathname), { timeout: 20_000 });
  }

  /**
   * Le da un rol de administración igual que lo hace el dueño: con el script del servidor (`assignAdminRoleSQL.ts`). Después hay que cerrar la sesión y
   * volver a entrar para que el rol rija (así lo dice la guía): quien llama debe hacerlo con `reingresar()`.
   */
  darRol(rol: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo'): void {
    execFileSync('npx', ['tsx', 'server/scripts/assignAdminRoleSQL.ts', this.correo, rol], {
      cwd: process.cwd(),
      env: { ...process.env, ...variablesDelServidor(process.cwd()) },
      shell: true,
      stdio: 'pipe',
    });
  }

  /**
   * La clave de panel, como la primera vez que alguien del equipo entra a la administración: la crea con la contraseña de su cuenta y la pone. El pase queda en
   * una cookie de este navegador.
   */
  async abrirElPanel(): Promise<void> {
    const creada = await this.page.request.post('/api/clave-de-panel/crear', { data: { contrasena: this.datos.clave } });
    const clave = (await creada.json()).data?.clave;
    if (!clave) throw new Error(`No se pudo crear la clave de panel (${creada.status()})`);
    const abierta = await this.page.request.post('/api/clave-de-panel/abrir', { data: { clave } });
    if (!abierta.ok()) throw new Error(`No se pudo abrir el panel (${abierta.status()})`);
    await this.page.reload();
  }

  async reingresar(): Promise<void> {
    await this.page.context().clearCookies();
    await this.page.goto('/');
    await this.page.evaluate(() => localStorage.clear());
    await this.ingresar();
    await this.page.waitForURL((u) => !/\/(login|register)/.test(u.pathname), { timeout: 20_000 });
  }
}
