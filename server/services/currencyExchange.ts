import cache from './cache.js';

interface ExchangeRate {
  rate: number;
  timestamp: Date;
}

/**
 * Servicio de conversión de moneda USD/EUR a ARS
 * Utiliza APIs públicas con fallback y caché
 */
class CurrencyExchangeService {
  private readonly CACHE_KEY = 'currency:usd_ars_rate';
  private readonly CACHE_TTL = 3600; // 1 hora
  private readonly APIS = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://api.exchangerate-api.com/v4/latest/USD'
  ];

  /**
   * Obtiene la tasa de cambio USD a ARS
   * @returns Tasa de cambio actual
   */
  async getUSDtoARSRate(): Promise<number> {
    try {
      // Intentar obtener de caché
      const cached = await cache.get<ExchangeRate>(this.CACHE_KEY);
      if (cached?.rate) {
        console.log('Using cached USD/ARS rate:', cached.rate);
        return cached.rate;
      }

      // Obtener tasa actual de las APIs
      const rate = await this.fetchRateFromAPIs();

      // Guardar en caché
      await cache.set(this.CACHE_KEY, {
        rate,
        timestamp: new Date()
      }, this.CACHE_TTL);

      return rate;
    } catch (error) {
      console.error('Error getting USD/ARS rate:', error);
      // Fallback a una tasa predeterminada en caso de error
      return 1000; // Tasa de respaldo conservadora
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
   * Invalida el caché de tasas de cambio
   * Útil para forzar una actualización
   */
  async invalidateCache(): Promise<void> {
    await cache.del(this.CACHE_KEY);
  }

  /**
   * Obtiene información detallada sobre la tasa actual
   */
  async getRateInfo(): Promise<{
    rate: number;
    timestamp: Date;
    source: 'cache' | 'api';
  }> {
    const cached = await cache.get<ExchangeRate>(this.CACHE_KEY);

    if (cached?.rate) {
      return {
        rate: cached.rate,
        timestamp: cached.timestamp,
        source: 'cache'
      };
    }

    const rate = await this.fetchRateFromAPIs();
    const timestamp = new Date();

    await cache.set(this.CACHE_KEY, { rate, timestamp }, this.CACHE_TTL);

    return {
      rate,
      timestamp,
      source: 'api'
    };
  }
}

// Exportar instancia única
export default new CurrencyExchangeService();
