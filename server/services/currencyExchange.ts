interface ExchangeRate {
  rate: number;
  timestamp: Date;
}

/**
 * Servicio de conversión de moneda USD/EUR a ARS
 * Utiliza APIs públicas con fallback y caché en memoria
 */
class CurrencyExchangeService {
  private readonly CACHE_KEY = 'currency:usd_ars_rate';
  private readonly USDT_CACHE_KEY = 'currency:usdt_rate';
  private readonly CACHE_TTL = 3600; // 1 hora (en segundos)
  private memoryCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private readonly DOLAR_HOY_URL = 'https://dolarhoy.com/';
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
   * Obtiene el dólar blue (venta) desde dolarhoy.com
   * @private
   */
  private async fetchDolarBlueFromDolarHoy(): Promise<number> {
    try {
      console.log('📊 Fetching dólar blue from dolarhoy.com...');
      const response = await fetch(this.DOLAR_HOY_URL);

      if (!response.ok) {
        throw new Error(`DolarHoy returned status ${response.status}`);
      }

      const html = await response.text();

      // Buscar el valor de venta del dólar blue
      // El HTML tiene estructura: <div class="val">$1430</div>
      // Buscamos específicamente la sección del dólar blue
      const dolarBlueMatch = html.match(/DOLAR BLUE[\s\S]*?Venta[\s\S]*?\$(\d+)/i);

      if (dolarBlueMatch && dolarBlueMatch[1]) {
        const rate = parseInt(dolarBlueMatch[1], 10);
        console.log(`✅ Dólar Blue (Venta) obtenido de dolarhoy.com: $${rate}`);
        return rate;
      }

      // Método alternativo: buscar directamente por clases
      const ventaMatch = html.match(/<div[^>]*class="val"[^>]*>\$(\d+)<\/div>/g);
      if (ventaMatch && ventaMatch.length >= 2) {
        // El segundo valor suele ser la venta
        const secondMatch = ventaMatch[1].match(/\$(\d+)/);
        if (secondMatch && secondMatch[1]) {
          const rate = parseInt(secondMatch[1], 10);
          console.log(`✅ Dólar Blue (Venta) obtenido de dolarhoy.com (método alt): $${rate}`);
          return rate;
        }
      }

      throw new Error('No se pudo extraer el dólar blue de dolarhoy.com');
    } catch (error) {
      console.error('❌ Error fetching from dolarhoy.com:', error);
      throw error;
    }
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

      // Primero intentar obtener dólar blue de dolarhoy.com
      try {
        const dolarBlueRate = await this.fetchDolarBlueFromDolarHoy();

        // Guardar en caché
        await this.cacheSet(this.CACHE_KEY, {
          rate: dolarBlueRate,
          timestamp: new Date()
        }, this.CACHE_TTL);

        return dolarBlueRate;
      } catch (dolarHoyError) {
        console.warn('⚠️ DolarHoy failed, falling back to international APIs');
      }

      // Fallback: Obtener tasa de APIs internacionales
      const rate = await this.fetchRateFromAPIs();

      // Guardar en caché
      await this.cacheSet(this.CACHE_KEY, {
        rate,
        timestamp: new Date()
      }, this.CACHE_TTL);

      return rate;
    } catch (error) {
      console.error('❌ Error getting USD/ARS rate:', error);
      // Fallback a una tasa predeterminada en caso de error
      console.warn('⚠️ Using fallback rate: 1430 ARS/USD');
      return 1430; // Tasa de respaldo (dólar blue aproximado)
    }
  }

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
  async getEURtoARSRate(): Promise<number> {
    try {
      // EUR/ARS = EUR/USD * USD/ARS
      // Aproximadamente: 1 EUR ≈ 1.08 USD (puede variar)
      const usdToArs = await this.getUSDtoARSRate();

      // Tasa EUR/USD aproximada (puede actualizarse con API)
      const eurToUsd = 1.08;

      const eurToArs = usdToArs * eurToUsd;
      console.log(`EUR/ARS rate: ${eurToArs} (USD/ARS: ${usdToArs} * EUR/USD: ${eurToUsd})`);

      return eurToArs;
    } catch (error) {
      console.error('Error getting EUR/ARS rate:', error);
      // Fallback: 1080 ARS por EUR
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

    const data = await response.json();

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
    try {
      // Intentar obtener de caché
      const cached = await this.cacheGet<ExchangeRate>(this.USDT_CACHE_KEY);
      if (cached?.rate) {
        console.log('💰 Using cached ARS/USDT rate:', cached.rate);
        return cached.rate;
      }

      // USDT es prácticamente 1:1 con USD, así que usamos la misma tasa
      const usdToArsRate = await this.getUSDtoARSRate();

      // Guardar en caché
      await this.cacheSet(this.USDT_CACHE_KEY, {
        rate: usdToArsRate,
        timestamp: new Date()
      }, this.CACHE_TTL);

      console.log(`✅ ARS/USDT rate: ${usdToArsRate} ARS per USDT`);
      return usdToArsRate;
    } catch (error) {
      console.error('❌ Error getting ARS/USDT rate:', error);
      // Fallback a una tasa predeterminada
      console.warn('⚠️ Using fallback rate: 1430 ARS/USDT');
      return 1430;
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
