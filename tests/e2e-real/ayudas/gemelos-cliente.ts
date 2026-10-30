import { URL_CORREO, URL_DIDIT, URL_MP } from '../entorno/variables';

/** Cómo una prueba mira y maneja a los gemelos (lo que en la vida real haría la persona mirando su correo o su cuenta de Mercado Pago). */

export interface Correo {
  id: number;
  recibidoEl: string;
  para: string[];
  de: string;
  asunto: string;
  texto: string;
  html: string;
  enlaces: string[];
}

export const correo = {
  /** Los correos que llegaron a una dirección (más nuevos primero). */
  async de(para: string, asunto?: string | RegExp): Promise<Correo[]> {
    const r = await fetch(`${URL_CORREO}/correos?para=${encodeURIComponent(para)}`);
    const lista = (await r.json()) as Correo[];
    return asunto ? lista.filter((c) => (typeof asunto === 'string' ? c.asunto.toLowerCase().includes(asunto.toLowerCase()) : asunto.test(c.asunto))) : lista;
  },
  /** Espera a que llegue un correo (como una persona que refresca la bandeja). Falla con la lista de lo que sí llegó. */
  async esperar(para: string, asunto: string | RegExp, ms = 20_000): Promise<Correo> {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
      const lista = await correo.de(para, asunto);
      if (lista[0]) return lista[0];
      await new Promise((r) => setTimeout(r, 400));
    }
    const llegaron = (await correo.de(para)).map((c) => c.asunto);
    throw new Error(`No llegó ningún correo a ${para} con asunto ${asunto}. Llegaron: ${JSON.stringify(llegaron)}`);
  },
  /** Confirma que NO llegó un correo (por ejemplo, que un aviso no se mande dos veces). */
  async cuantos(para: string, asunto: string | RegExp): Promise<number> {
    return (await correo.de(para, asunto)).length;
  },
  /** El primer enlace del correo que cumple el patrón. */
  enlace(c: Correo, patron: RegExp): string {
    const e = c.enlaces.find((x) => patron.test(x));
    if (!e) throw new Error(`El correo «${c.asunto}» no tiene un enlace como ${patron}. Tiene: ${JSON.stringify(c.enlaces)}`);
    return e;
  },
};

export interface PagoDelGemelo {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  installments: number;
  coupon_amount: number;
  transaction_amount_refunded: number;
  metadata: Record<string, unknown>;
  payment_type_id: string;
  preference_id: string;
}

export const mp = {
  async estado(): Promise<{ pagos: PagoDelGemelo[]; preferencias: Array<{ id: string; body: any }>; pedidos: Array<{ metodo: string; ruta: string; cuerpo: any }>; config: any }> {
    return (await fetch(`${URL_MP}/__control/estado`)).json() as any;
  },
  async pagos(): Promise<PagoDelGemelo[]> {
    return (await mp.estado()).pagos;
  },
  /** Cómo se mandan los avisos: `no_enviar` simula que Mercado Pago no avisó (o avisó tarde). */
  async config(cambios: Record<string, unknown>): Promise<void> {
    await fetch(`${URL_MP}/__control/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cambios) });
  },
  async reiniciar(): Promise<void> {
    await fetch(`${URL_MP}/__control/reiniciar`, { method: 'POST' });
  },
  /** Alguien paga el cupón de efectivo en Rapipago. */
  async pagarCupon(idPago: number): Promise<void> {
    await fetch(`${URL_MP}/__control/pagar-cupon/${idPago}`, { method: 'POST' });
  },
  async reenviarAviso(idPago: number): Promise<void> {
    await fetch(`${URL_MP}/__control/reenviar-aviso/${idPago}`, { method: 'POST' });
  },
};

export const didit = {
  /** Fuerza la decisión de la PRÓXIMA verificación de identidad. */
  async proximaDecision(decision: 'Approved' | 'Declined' | 'In Review' | null): Promise<void> {
    await fetch(`${URL_DIDIT}/__control/proxima-decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) });
  },
};
