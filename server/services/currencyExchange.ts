interface ExchangeRate {
  rate: number;
  timestamp: Date;
  /** Where the figure came from — shown to the user so the quote is auditable. */
  source?: string;
}

/** A rate plus its provenance, for callers that display freshness. */
export interface QuotedRate {
  rate: number;
  timestamp: Date;
  source: string;
}

/**
 * De dónde salió cada cotización, en castellano y listo para mostrar.
 *
 * Por qué se muestra: los precios de la membresía están fijados en euros y se
 * cobran en pesos al cambio del día, así que el importe en pesos cambia solo
 * de un mes a otro. Un número que se mueve sin explicación se lee como un
 * aumento encubierto. Decir de dónde sale y de cuándo es convierte una
 * sospecha en un dato verificable: el usuario puede ir a la misma fuente.
 *
 * También sirve hacia adentro: cuando la cotización cae al valor de respaldo
 * —porque se cayeron todas las fuentes— el precio se calcula con un número
 * inventado, y eso tiene que ser visible, no un detalle del log.
 */
export const ORIGEN_LEGIBLE: Record<string, { nombre: string; url?: string; confiable: boolean }> = {
  dolarapi: { nombre: 'Dólar blue (venta) de dolarapi.com', url: 'https://dolarapi.com/v1/dolares/blue', confiable: true },
  bluelytics: { nombre: 'Dólar blue (venta) de Bluelytics', url: 'https://bluelytics.com.ar/', confiable: true },
  'api-internacional': { nombre: 'Cotización oficial de exchangerate-api.com', url: 'https://www.exchangerate-api.com/', confiable: true },
  'eur-directo': { nombre: 'Cotización EUR/ARS de exchangerate-api.com', url: 'https://www.exchangerate-api.com/', confiable: true },
  'eur-cruzado': { nombre: 'EUR/USD de exchangerate-api.com sobre el dólar blue', confiable: true },
  binance: { nombre: 'USDT/ARS de Binance', url: 'https://www.binance.com/', confiable: true },
  cache: { nombre: 'Última cotización obtenida', confiable: true },
  respaldo: { nombre: 'Valor de respaldo: no se pudo consultar ninguna fuente', confiable: false },
};

export interface CotizacionMostrable {
  valor: number;
  origen: string;
  nombreDelOrigen: string;
  url?: string;
  /** false cuando se usó el valor de respaldo: el precio no refleja el mercado. */
  confiable: boolean;
  actualizada: string;
}

export function describirCotizacion(q: QuotedRate): CotizacionMostrable {
  const info = ORIGEN_LEGIBLE[q.source] || { nombre: q.source, confiable: true };
  return {
    valor: Math.round(q.rate * 100) / 100,
    origen: q.source,
    nombreDelOrigen: info.nombre,
    url: info.url,
    confiable: info.confiable,
    actualizada: (q.timestamp instanceof Date ? q.timestamp : new Date(q.timestamp)).toISOString(),
  };
}

/**
 * Servicio de conversión de moneda USD/EUR a ARS
 * Utiliza APIs públicas con fallback y caché en memoria
 */
class CurrencyExchangeService {
  private readonly CACHE_KEY = 'currency:usd_ars_rate';
  private readonly USDT_CACHE_KEY = 'currency:usdt_rate';
  private readonly CACHE_TTL = 3600; // 1 hora (en segundos)
  // El USDT se cotiza aparte y mucho más corto: una hora de caché sobre un
  // mercado cripto significa cobrar a un precio que ya no existe, y la
  // diferencia la termina pagando el usuario o la plataforma.
  private readonly USDT_CACHE_TTL = 300; // 5 minutos
  private memoryCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private readonly APIS = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://api.exchangerate-api.com/v4/latest/USD'
  ];
  private readonly BINANCE_API = 'https://api.binance.com/api/v3/ticker/price?symbol=USDTARS';

  // Simple in-memory cache methods
  private async cacheGet<T>(key: string): Promise<T | null> {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return cached.data as T;
  }

  private async cacheSet(key: string, data: any, ttl: number = this.CACHE_TTL): Promise<void> {
    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + (ttl * 1000)
    });
  }

  private async cacheDel(key: string): Promise<void> {
    this.memoryCache.delete(key);
  }

  /**
   * Obtiene el dólar blue (venta). Devuelve además de qué fuente salió.
   * @private
   */
  private async fetchDolarBlue(): Promise<{ rate: number; source: string }> {
    /**
     * El blue, por API y no raspando HTML.
     *
     * Esto leía la portada de dolarhoy.com con una expresión regular contra su
     * maquetado. Cuando el sitio cambió el HTML —cosa que un sitio hace sin
     * avisarle a nadie— la expresión dejó de encontrar el número, el método
     * empezó a fallar SIEMPRE y todo el sistema cayó al dólar oficial de la
     * API internacional. No se rompió nada visible: los precios simplemente
     * pasaron a calcularse con otra cotización, varios cientos de pesos más
     * barata por dólar, y nadie se enteró.
     *
     * Dos APIs de verdad, que devuelven JSON y tienen contrato estable. La
     * segunda existe porque una sola fuente vuelve a dejarnos donde estábamos.
     */
    const fuentes: Array<{ id: string; url: string; leer: (d: any) => number }> = [
      { id: 'dolarapi', url: 'https://dolarapi.com/v1/dolares/blue', leer: (d) => Number(d?.venta) },
      { id: 'bluelytics', url: 'https://api.bluelytics.com.ar/v2/latest', leer: (d) => Number(d?.blue?.value_sell) },
    ];

    for (const f of fuentes) {
      try {
        const controlador = new AbortController();
        const corte = setTimeout(() => controlador.abort(), 8000);
        const resp = await fetch(f.url, { signal: controlador.signal });
        clearTimeout(corte);
        if (!resp.ok) throw new Error(`estado ${resp.status}`);

        const rate = f.leer(await resp.json());
        // Un rango amplio a propósito: sirve para descartar un 0, un NaN o un
        // cambio de formato, no para opinar sobre cuánto "debería" valer.
        if (!Number.isFinite(rate) || rate < 100 || rate > 100_000) {
          throw new Error(`valor fuera de rango: ${rate}`);
        }
        console.log(`✅ Dólar blue (venta) de ${f.id}: $${rate}`);
        return { rate, source: f.id };
      } catch (e: any) {
        console.warn(`⚠️ ${f.id} no respondió: ${e?.message}`);
      }
    }

    throw new Error('Ninguna fuente del dólar blue respondió');
  }

  /**
   * Obtiene la tasa de cambio USD a ARS usando dólar blue
   * @returns Tasa de cambio actual
   */
  async getUSDtoARSRate(): Promise<number> {
    try {
      // Intentar obtener de caché
      const cached = await this.cacheGet<ExchangeRate>(this.CACHE_KEY);
      if (cached?.rate) {
        console.log('💰 Using cached USD/ARS rate (Dólar Blue):', cached.rate);
        return cached.rate;
      }

      // Primero el dólar blue, que es el que se usa para cotizar.
      try {
        const blue = await this.fetchDolarBlue();

        // El origen viaja con la cotización: es lo que se le muestra al
        // usuario para que pueda ir a verificarla a la misma fuente.
        await this.cacheSet(this.CACHE_KEY, {
          rate: blue.rate,
          timestamp: new Date(),
          source: blue.source,
        }, this.CACHE_TTL);

        return blue.rate;
      } catch (sinBlue) {
        // Caer al oficial no es equivalente: son cotizaciones distintas y la
        // diferencia la paga alguien. Queda como advertencia, no como info.
        console.warn('⚠️ Sin dólar blue; se usa la cotización oficial internacional');
      }

      // Fallback: Obtener tasa de APIs internacionales
      const rate = await this.fetchRateFromAPIs();

      await this.cacheSet(this.CACHE_KEY, {
        rate,
        timestamp: new Date(),
        source: 'api-internacional',
      }, this.CACHE_TTL);

      return rate;
    } catch (error) {
      console.error('❌ Error getting USD/ARS rate:', error);
      /**
       * Se cayeron las dos fuentes del blue Y las APIs internacionales. El
       * precio se va a calcular con un
       * número escrito a mano, así que NO se cachea: cachearlo haría que el
       * valor inventado sobreviviera una hora más allá de que las fuentes
       * vuelvan. Y queda marcado como no confiable para que la pantalla lo diga.
       */
      console.warn('⚠️ Using fallback rate: 1430 ARS/USD');
      this.ultimoOrigenUSD = 'respaldo';
      return 1430; // Tasa de respaldo (dólar blue aproximado)
    }
  }

  /** El origen de la última cotización USD/ARS servida, para poder mostrarlo. */
  private ultimoOrigenUSD: string | null = null;

  /** USD/ARS con su procedencia. Es lo que consume la UI. */
  async getQuotedUSDRate(): Promise<QuotedRate> {
    const cached = await this.cacheGet<ExchangeRate>(this.CACHE_KEY);
    if (cached?.rate) {
      return {
        rate: cached.rate,
        timestamp: cached.timestamp instanceof Date ? cached.timestamp : new Date(cached.timestamp),
        source: cached.source || 'cache',
      };
    }
    this.ultimoOrigenUSD = null;
    const rate = await this.getUSDtoARSRate();
    const fresco = await this.cacheGet<ExchangeRate>(this.CACHE_KEY);
    return {
      rate,
      timestamp: fresco?.timestamp ? new Date(fresco.timestamp) : new Date(),
      source: fresco?.source || this.ultimoOrigenUSD || 'respaldo',
    };
  }

  /** EUR/ARS con su procedencia. */
  async getQuotedEURRate(): Promise<QuotedRate> {
    const cached = await this.cacheGet<ExchangeRate>('currency:eur_ars_rate');
    if (cached?.rate) {
      return {
        rate: cached.rate,
        timestamp: cached.timestamp instanceof Date ? cached.timestamp : new Date(cached.timestamp),
        source: cached.source || 'cache',
      };
    }
    this.ultimoOrigenEUR = null;
    const rate = await this.getEURtoARSRate();
    const fresco = await this.cacheGet<ExchangeRate>('currency:eur_ars_rate');
    return {
      rate,
      timestamp: fresco?.timestamp ? new Date(fresco.timestamp) : new Date(),
      source: fresco?.source || this.ultimoOrigenEUR || 'respaldo',
    };
  }

  private ultimoOrigenEUR: string | null = null;

  /**
   * Convierte una cantidad en USD a ARS
   * @param amountUSD Cantidad en dólares
   * @returns Cantidad convertida en pesos argentinos
   */
  async convertUSDtoARS(amountUSD: number): Promise<number> {
    const rate = await this.getUSDtoARSRate();
    return Math.round(amountUSD * rate * 100) / 100; // Redondear a 2 decimales
  }

  /**
   * Convierte una cantidad en ARS a USD
   * @param amountARS Cantidad en pesos argentinos
   * @returns Cantidad convertida en dólares
   */
  async convertARStoUSD(amountARS: number): Promise<number> {
    const rate = await this.getUSDtoARSRate();
    return Math.round((amountARS / rate) * 100) / 100; // Redondear a 2 decimales
  }

  /**
   * Obtiene la tasa de cambio EUR a ARS
   * @returns Tasa de cambio actual
   */
  /**
   * EUR/USD, live. Cached for an hour like the other rates.
   *
   * This used to be hardcoded at 1.08. It is 1.17 today, so every price quoted
   * in euros was about 8% low — which matters because the membership prices are
   * denominated in euros precisely so they track the currency.
   */
  private async getEURtoUSDRate(): Promise<number> {
    const cached = await this.cacheGet<ExchangeRate>('currency:eur_usd_rate');
    if (cached?.rate) return cached.rate;

    try {
      const resp = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
      if (resp.ok) {
        const data: any = await resp.json();
        const rate = Number(data?.rates?.USD);
        if (Number.isFinite(rate) && rate > 0.5 && rate < 3) {
          await this.cacheSet('currency:eur_usd_rate', { rate, timestamp: new Date() }, this.CACHE_TTL);
          return rate;
        }
      }
    } catch (e: any) {
      console.warn('EUR/USD no disponible:', e?.message);
    }
    // Last resort. Deliberately a recent figure rather than the old 1.08.
    return 1.17;
  }

  /**
   * EUR/ARS, quoted directly.
   *
   * Direct rather than EUR/USD x USD/ARS: the membership price is set in euros,
   * so the euro-to-peso pair is the one that should decide it. Deriving it
   * through the dollar made the price depend on which dollar this service
   * happened to be using that day.
   *
   * Falls back to the cross rate only if the direct quote is unavailable, and
   * logs which one was used so a surprising charge can be traced.
   */
  async getEURtoARSRate(): Promise<number> {
    const cached = await this.cacheGet<ExchangeRate>('currency:eur_ars_rate');
    if (cached?.rate) return cached.rate;

    // 1) Direct EUR/ARS.
    try {
      const resp = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
      if (resp.ok) {
        const data: any = await resp.json();
        const rate = Number(data?.rates?.ARS);
        if (Number.isFinite(rate) && rate > 100) {
          await this.cacheSet('currency:eur_ars_rate', { rate, timestamp: new Date(), source: 'eur-directo' }, this.CACHE_TTL);
          console.log(`EUR/ARS (directo): ${rate.toFixed(2)}`);
          return rate;
        }
      }
    } catch (e: any) {
      console.warn('EUR/ARS directo no disponible:', e?.message);
    }

    // 2) Cross rate, so a missing quote does not stop a payment.
    try {
      const usdToArs = await this.getUSDtoARSRate();
      const eurToUsd = await this.getEURtoUSDRate();
      const rate = usdToArs * eurToUsd;
      await this.cacheSet('currency:eur_ars_rate', { rate, timestamp: new Date(), source: 'eur-cruzado' }, this.CACHE_TTL);
      console.log(`EUR/ARS (cruzado): ${rate.toFixed(2)} = USD/ARS ${usdToArs} x EUR/USD ${eurToUsd}`);
      return rate;
    } catch (error) {
      console.error('Error getting EUR/ARS rate:', error);
      // No se cachea, por el mismo motivo que en USD: un valor inventado no
      // puede sobrevivir a que las fuentes vuelvan.
      this.ultimoOrigenEUR = 'respaldo';
      return 1080;
    }
  }

  /**
   * Convierte una cantidad en EUR a ARS
   * @param amountEUR Cantidad en euros
   * @returns Cantidad convertida en pesos argentinos
   */
  async convertEURtoARS(amountEUR: number): Promise<number> {
    const rate = await this.getEURtoARSRate();
    return Math.round(amountEUR * rate * 100) / 100; // Redondear a 2 decimales
  }

  /**
   * Convierte una cantidad en ARS a EUR
   * @param amountARS Cantidad en pesos argentinos
   * @returns Cantidad convertida en euros
   */
  async convertARStoEUR(amountARS: number): Promise<number> {
    const rate = await this.getEURtoARSRate();
    return Math.round((amountARS / rate) * 100) / 100; // Redondear a 2 decimales
  }

  /**
   * Obtiene la tasa de cambio desde múltiples APIs con fallback
   * @private
   */
  private async fetchRateFromAPIs(): Promise<number> {
    for (const apiUrl of this.APIS) {
      try {
        const rate = await this.fetchFromAPI(apiUrl);
        if (rate > 0) {
          console.log(`Successfully fetched USD/ARS rate from ${apiUrl}:`, rate);
          return rate;
        }
      } catch (error) {
        console.warn(`Failed to fetch from ${apiUrl}:`, error);
        continue;
      }
    }

    throw new Error('All currency APIs failed');
  }

  /**
   * Obtiene la tasa desde una API específica
   * @private
   */
  private async fetchFromAPI(url: string): Promise<number> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json() as any;

    // Manejar diferentes formatos de respuesta
    if (url.includes('fawazahmed0')) {
      // Formato: { date: "2025-10-19", usd: { ars: 1452.52 } }
      return data.usd?.ars || 0;
    } else if (url.includes('exchangerate-api')) {
      // Formato: { rates: { ARS: 1452.52 } }
      return data.rates?.ARS || 0;
    }

    return 0;
  }

  /**
   * Obtiene la tasa de cambio ARS a USDT desde Binance
   * @returns Tasa de cambio actual (1 USDT = X ARS)
   */
  async getARStoUSDTRate(): Promise<number> {
    return (await this.getQuotedUSDTRate()).rate;
  }

  /**
   * Cotización ARS/USDT con su procedencia y antigüedad.
   *
   * Antes esto devolvía la tasa del dólar, con el comentario "USDT es
   * prácticamente 1:1 con USD". En Argentina no lo es: el USDT cotiza contra el
   * peso en su propio mercado y la brecha con el dólar de las APIs de referencia
   * ronda el 5-6%. Sobre un pago de $100.000 eso son ~3,5 USDT que alguien pone
   * de más. BINANCE_API ya estaba declarado en este archivo pero nunca se usaba.
   *
   * Se mantiene la tasa del dólar como respaldo: es incorrecta pero acotada, y
   * es preferible a dejar el checkout sin cotización.
   */
  async getQuotedUSDTRate(): Promise<QuotedRate> {
    const cached = await this.cacheGet<ExchangeRate>(this.USDT_CACHE_KEY);
    if (cached?.rate) {
      return { rate: cached.rate, timestamp: new Date(cached.timestamp), source: cached.source || 'cache' };
    }

    // 1) Mercado real: par USDT/ARS de Binance.
    try {
      const resp = await fetch(this.BINANCE_API);
      if (resp.ok) {
        const data: any = await resp.json();
        const rate = Number(data?.price);
        if (Number.isFinite(rate) && rate > 0) {
          const quote: ExchangeRate = { rate, timestamp: new Date(), source: 'binance' };
          await this.cacheSet(this.USDT_CACHE_KEY, quote, this.USDT_CACHE_TTL);
          console.log(`✅ ARS/USDT rate (binance): ${rate}`);
          return { rate, timestamp: quote.timestamp, source: 'binance' };
        }
      }
      console.warn(`⚠️ Binance USDTARS respondió ${resp.status}, uso la tasa del dólar`);
    } catch (error: any) {
      console.warn('⚠️ Binance USDTARS no disponible:', error?.message);
    }

    // 2) Respaldo: tasa del dólar (aproximación, no el mercado del USDT).
    try {
      const usdToArsRate = await this.getUSDtoARSRate();
      const quote: ExchangeRate = { rate: usdToArsRate, timestamp: new Date(), source: 'usd-fallback' };
      await this.cacheSet(this.USDT_CACHE_KEY, quote, this.USDT_CACHE_TTL);
      return { rate: usdToArsRate, timestamp: quote.timestamp, source: 'usd-fallback' };
    } catch (error) {
      console.error('❌ Error getting ARS/USDT rate:', error);
      console.warn('⚠️ Using fallback rate: 1430 ARS/USDT');
      return { rate: 1430, timestamp: new Date(), source: 'fallback' };
    }
  }

  /**
   * Convierte una cantidad en ARS a USDT
   * @param amountARS Cantidad en pesos argentinos
   * @returns Cantidad convertida en USDT
   */
  async convertARStoUSDT(amountARS: number): Promise<number> {
    const rate = await this.getARStoUSDTRate();
    return Math.round((amountARS / rate) * 100) / 100; // Redondear a 2 decimales
  }

  /**
   * Convierte una cantidad en USDT a ARS
   * @param amountUSDT Cantidad en USDT
   * @returns Cantidad convertida en pesos argentinos
   */
  async convertUSDTtoARS(amountUSDT: number): Promise<number> {
    const rate = await this.getARStoUSDTRate();
    return Math.round(amountUSDT * rate * 100) / 100; // Redondear a 2 decimales
  }

  /**
   * Invalida el caché de tasas de cambio
   * Útil para forzar una actualización
   */
  async invalidateCache(): Promise<void> {
    await this.cacheDel(this.CACHE_KEY);
    await this.cacheDel(this.USDT_CACHE_KEY);
  }

  /**
   * Obtiene información detallada sobre la tasa actual
   */
  async getRateInfo(): Promise<{
    rate: number;
    timestamp: Date;
    source: 'cache' | 'api';
  }> {
    const cached = await this.cacheGet<ExchangeRate>(this.CACHE_KEY);

    if (cached?.rate) {
      return {
        rate: cached.rate,
        timestamp: cached.timestamp,
        source: 'cache'
      };
    }

    const rate = await this.fetchRateFromAPIs();
    const timestamp = new Date();

    await this.cacheSet(this.CACHE_KEY, { rate, timestamp }, this.CACHE_TTL);

    return {
      rate,
      timestamp,
      source: 'api'
    };
  }
}

// Exportar instancia única
export default new CurrencyExchangeService();
