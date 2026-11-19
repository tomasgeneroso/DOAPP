import { describe, it, expect, afterAll } from '@jest/globals';

/**
 * Los datos de cobro (transferencia y Binance) se cargan desde el panel y rigen en la pantalla de pago (pedido del dueño, 2026-11-19). Con la base real: se validan, ganan sobre el
 * entorno campo por campo, y vaciarlos vuelve al entorno. Un dato de ejemplo nunca se ofrece.
 */
import { AppSetting } from '../../server/models/sql/AppSetting.model.js';
import { COBRO_SETTING_KEY, DatoDeCobroInvalido, binanceVigente, cargarDatosDeCobro, datosBancariosVigentes, guardarDatosDeCobro } from '../../server/services/datosDeCobro.js';

const CBU_VALIDO = '0110599520000012345678';

describe('datos de cobro del panel', () => {
  const entornoAntes = { cbu: process.env.BANK_CBU, alias: process.env.BANK_ALIAS, bin: process.env.BINANCE_ID };
  afterAll(async () => {
    process.env.BANK_CBU = entornoAntes.cbu;
    process.env.BANK_ALIAS = entornoAntes.alias;
    process.env.BINANCE_ID = entornoAntes.bin;
    await AppSetting.destroy({ where: { key: COBRO_SETTING_KEY } }).catch(() => undefined);
    await cargarDatosDeCobro();
  });

  it('sin nada cargado no se ofrece ni transferencia ni Binance', async () => {
    delete process.env.BANK_CBU; delete process.env.BANK_ALIAS; delete process.env.BINANCE_ID;
    await AppSetting.destroy({ where: { key: COBRO_SETTING_KEY } });
    await cargarDatosDeCobro();
    expect(datosBancariosVigentes()).toBeNull();
    expect(binanceVigente().id).toBeNull();
  });

  it('lo cargado en el panel rige enseguida y sobrevive a un reinicio (se vuelve a cargar de la base)', async () => {
    await guardarDatosDeCobro({ cbu: CBU_VALIDO, alias: 'doapp.cobros', titular: 'DOAPP S.A.', cuit: '30-12345678-9', banco: 'Banco Prueba', binanceId: '123456789', binanceNickname: 'doapp' }, 'u-prueba');
    expect(datosBancariosVigentes()).toMatchObject({ cbu: CBU_VALIDO, alias: 'doapp.cobros', accountHolder: 'DOAPP S.A.', bank: 'Banco Prueba' });
    expect(binanceVigente()).toEqual({ id: '123456789', nickname: 'doapp' });
    await cargarDatosDeCobro();
    expect(datosBancariosVigentes()?.alias).toBe('doapp.cobros');
  });

  it('el panel gana campo por campo; un campo vacío vuelve a usar el entorno', async () => {
    process.env.BANK_ALIAS = 'alias.del.entorno';
    process.env.BANK_ACCOUNT_HOLDER = 'Titular del entorno';
    await guardarDatosDeCobro({ cbu: CBU_VALIDO, alias: '', titular: 'Titular del panel' }, 'u-prueba');
    const v = datosBancariosVigentes();
    expect(v?.alias).toBe('alias.del.entorno');
    expect(v?.accountHolder).toBe('Titular del panel');
    delete process.env.BANK_ACCOUNT_HOLDER;
  });

  it('rechaza lo mal escrito con el motivo (CBU, alias, CUIT, ID de Binance)', async () => {
    await expect(guardarDatosDeCobro({ cbu: '123' }, 'u')).rejects.toBeInstanceOf(DatoDeCobroInvalido);
    await expect(guardarDatosDeCobro({ cbu: '0'.repeat(22) }, 'u')).rejects.toBeInstanceOf(DatoDeCobroInvalido);
    await expect(guardarDatosDeCobro({ alias: 'a b' }, 'u')).rejects.toBeInstanceOf(DatoDeCobroInvalido);
    await expect(guardarDatosDeCobro({ cuit: '1234' }, 'u')).rejects.toBeInstanceOf(DatoDeCobroInvalido);
    await expect(guardarDatosDeCobro({ binanceId: 'abc' }, 'u')).rejects.toBeInstanceOf(DatoDeCobroInvalido);
  });

  it('los valores de ejemplo del .env.example no cuentan', async () => {
    await guardarDatosDeCobro({}, 'u');
    process.env.BANK_ALIAS = 'tu.alias';
    process.env.BANK_CBU = '0000000000000000000000';
    process.env.BINANCE_ID = 'your-binance-user-id';
    expect(datosBancariosVigentes()).toBeNull();
    expect(binanceVigente().id).toBeNull();
  });
});
