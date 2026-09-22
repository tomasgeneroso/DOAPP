import {
  requiereDobleConfirmacion,
  verificarEnfriamientoCbu,
  MONTO_DOBLE_CONFIRMACION_ARS,
  ENFRIAMIENTO_CBU_HORAS,
  TOPE_DIARIO_POR_ROL_ARS,
} from '../server/services/paymentSafeguards.js';
import { leerMetadata } from '../server/utils/auditLog.js';
import { gzipSync } from 'node:zlib';
import { PROPORCION_MAXIMA_DEVOLUCIONES } from '../server/services/paymentSafeguards.js';
import {
  desgloseCancelacionSinContratar,
  liquidarCancelacion,
  getProcessingFeeRate,
  pasarelaSinIva,
  procesamientoParaCobrar,
  splitFees,
} from '../shared/pricing/processingCost.js';
import { POLITICAS } from '../shared/constants/policies.js';
import { marcarDiasAlFinalizar, umbralAusencia, buildDailyLog } from '../server/services/dailyLog.js';
import { evidenceToPdf, indicesAIncluir } from '../server/services/contractEvidence.js';
import { puedePromocionarse } from '../server/routes/profilePromotion.js';
import { estadoDeSilencio, DIAS_PARA_RESPONDER } from '../server/jobs/disputeSilence.js';
import { VENTANA_DIAS, MARCA_VISIBLE_DIAS, SUSPENSION_3RA_DIAS, SUSPENSION_4TA_DIAS, diasDeSuspension } from '../server/services/cancellationLadder.js';
import { montoParaElTrabajador, componentesDelPago } from '../server/services/payoutAmount.js';

/**
 * Estos controles solo sirven si fallan cerrados: ante la duda, no dejan pasar
 * la plata. La mayoria de los casos de acá prueban justamente eso, no el camino
 * feliz.
 */

describe('doble confirmacion por monto', () => {
  it('la pide desde el umbral, no despues', () => {
    // El limite es inclusivo a proposito: un monto exactamente igual al umbral
    // es tan grande como uno que lo supera por un peso.
    expect(requiereDobleConfirmacion(MONTO_DOBLE_CONFIRMACION_ARS)).toBe(true);
    expect(requiereDobleConfirmacion(MONTO_DOBLE_CONFIRMACION_ARS + 1)).toBe(true);
  });

  it('no molesta en los montos chicos', () => {
    // Si el control se dispara todo el tiempo, el equipo lo evita.
    expect(requiereDobleConfirmacion(MONTO_DOBLE_CONFIRMACION_ARS - 1)).toBe(false);
    expect(requiereDobleConfirmacion(50_000)).toBe(false);
  });
});

describe('enfriamiento tras cambiar el CBU', () => {
  const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000);

  it('bloquea el retiro inmediatamente despues del cambio', () => {
    // Es el ataque concreto: entrar con la contraseña robada, cambiar la cuenta
    // de destino y retirar. Sin demora, entre las dos cosas pasan segundos.
    const r = verificarEnfriamientoCbu(new Date());
    expect(r.permitido).toBe(false);
    expect(r.motivo).toMatch(/no fuiste vos/i);
  });

  it('sigue bloqueando una hora antes de cumplirse el plazo', () => {
    expect(verificarEnfriamientoCbu(haceHoras(ENFRIAMIENTO_CBU_HORAS - 1)).permitido).toBe(false);
  });

  it('habilita cuando se cumplio el plazo', () => {
    expect(verificarEnfriamientoCbu(haceHoras(ENFRIAMIENTO_CBU_HORAS)).permitido).toBe(true);
    expect(verificarEnfriamientoCbu(haceHoras(ENFRIAMIENTO_CBU_HORAS + 10)).permitido).toBe(true);
  });

  it('no bloquea a quien nunca cambio la cuenta', () => {
    // La inmensa mayoria de los retiros son de gente que cargo su CBU una vez y
    // no lo toco nunca mas. Ese caso no puede pagar el costo del control.
    expect(verificarEnfriamientoCbu(null).permitido).toBe(true);
    expect(verificarEnfriamientoCbu(undefined).permitido).toBe(true);
  });

  it('dice cuanto falta, no solo que no se puede', () => {
    const r = verificarEnfriamientoCbu(haceHoras(4));
    expect(r.detalle?.horasFaltantes).toBe(ENFRIAMIENTO_CBU_HORAS - 4);
  });
});

describe('topes diarios por rol', () => {
  it('soporte no mueve plata', () => {
    // Tope cero y no "sin permiso": si algun dia una ruta se le abre por error,
    // el tope lo frena igual.
    expect(TOPE_DIARIO_POR_ROL_ARS.support).toBe(0);
  });

  it('el tope crece con la responsabilidad', () => {
    expect(TOPE_DIARIO_POR_ROL_ARS.admin).toBeLessThan(TOPE_DIARIO_POR_ROL_ARS.super_admin);
    expect(TOPE_DIARIO_POR_ROL_ARS.super_admin).toBeLessThan(TOPE_DIARIO_POR_ROL_ARS.owner);
  });

  it('el dueño no tiene tope', () => {
    // Ponerle un tope solo lo obligaria a saltearselo, y un control que se
    // saltea rutinariamente ensena que los controles son opcionales.
    expect(TOPE_DIARIO_POR_ROL_ARS.owner).toBe(Number.POSITIVE_INFINITY);
  });

  it('un rol desconocido no tiene tope definido, y eso lo bloquea', () => {
    // verificarTopeDiario rechaza cuando el rol no figura. Es la diferencia
    // entre fallar cerrado y fallar abierto.
    expect(TOPE_DIARIO_POR_ROL_ARS['marketing']).toBeUndefined();
    expect(TOPE_DIARIO_POR_ROL_ARS['dpo']).toBeUndefined();
  });
});

describe('compresion de la metadata de auditoria', () => {

  it('lee una metadata comprimida', () => {
    const original = { discrepancias: Array.from({ length: 50 }, (_, i) => ({ id: i, detalle: 'x'.repeat(60) })) };
    const fila = {
      metadata: { _comprimida: true, _claves: ['discrepancias'] },
      metadataGz: gzipSync(Buffer.from(JSON.stringify(original), 'utf8')),
    };
    expect(leerMetadata(fila)).toEqual(original);
  });

  it('lee una metadata sin comprimir', () => {
    expect(leerMetadata({ metadata: { monto: 1000 } })).toEqual({ monto: 1000 });
  });

  it('no rompe cuando la metadata comprimida esta corrupta', () => {
    // Devolver el resumen es mejor que devolver nada: al menos dice que claves
    // habia. Y tirar una excepcion acá dejaria sin ver TODO el listado de
    // auditoria por una sola fila mal escrita.
    const r = leerMetadata({
      metadata: { _claves: ['a'] },
      metadataGz: Buffer.from('esto no es gzip'),
    });
    expect(r?._errorAlDescomprimir).toBeDefined();
    expect(r?._claves).toEqual(['a']);
  });

  it('comprimir vale la pena solo por encima del umbral', () => {
    // El caso contraintuitivo: gzip agrega ~20 bytes de encabezado, asi que un
    // objeto chico comprimido pesa MAS que el original. Por eso hay umbral.
    const chico = JSON.stringify({ monto: 1000, moneda: 'ARS' });
    expect(gzipSync(Buffer.from(chico)).length).toBeGreaterThan(Buffer.byteLength(chico));

    const grande = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i, campo: 'valor repetido' })));
    expect(gzipSync(Buffer.from(grande)).length).toBeLessThan(Buffer.byteLength(grande) / 5);
  });
});

describe('sub-tope de devoluciones', () => {

  it('las devoluciones no pueden ocupar todo el tope', () => {
    // Un pago va a la cuenta de un trabajador que se registro, verifico su
    // identidad y completo un contrato. Una devolucion vuelve al medio de pago
    // del cliente, que es mucho mas facil de controlar por quien esta
    // cometiendo el fraude. Por eso no pueden pesar lo mismo.
    expect(PROPORCION_MAXIMA_DEVOLUCIONES).toBeGreaterThan(0);
    expect(PROPORCION_MAXIMA_DEVOLUCIONES).toBeLessThan(1);
  });

  it('deja margen suficiente para operar un dia normal', () => {
    // Un dia normal casi no tiene devoluciones, asi que el 30% de $1.500.000
    // alcanza de sobra. Si se llega a ese techo, o paso algo grave o algo raro:
    // en los dos casos conviene que lo autorice alguien mas.
    const techo = TOPE_DIARIO_POR_ROL_ARS.admin * PROPORCION_MAXIMA_DEVOLUCIONES;
    expect(techo).toBeGreaterThanOrEqual(400_000);
  });
});

describe('cancelacion antes de contratar', () => {
  const PARTE = POLITICAS.CANCELACION_EN_REVISION_PARTE_COMISION;
  // Pago 115.841: precio 97.900 + comision 10.000 + IVA 2.100 + procesamiento 5.841 (con IVA).

  it('como saldo recupera precio y comision; en efectivo pierde ademas media comision. El procesamiento no vuelve nunca', () => {
    // Es lo que la gente no espera: MercadoPago ya cobro por procesar cuando
    // entro el pago, y devolver es una segunda operacion, no un "deshacer".
    const d = desgloseCancelacionSinContratar(115841, 10000, 2100, 5841);
    expect(d.precioTrabajo).toBe(97900);
    expect(d.procesamiento).toBe(5841);
    expect(d.retiene).toBeCloseTo(5841 + (10000 + 2100) * PARTE, 0);
    expect(d.devolver).toBeCloseTo(115841 - d.retiene, 0);
  });

  it('la parte de la comision que se retiene al retirar es la de la politica', () => {
    const d = desgloseCancelacionSinContratar(110000, 10000, 2100, 0);
    expect(d.retiene).toBeCloseTo((10000 + 2100) * PARTE, 2);
    expect(PARTE).toBeGreaterThan(0);
    expect(PARTE).toBeLessThan(1);
  });

  it('dice lo mismo que liquidarCancelacion, que es la regla general', () => {
    const d = desgloseCancelacionSinContratar(115841, 10000, 2100, 5841);
    const l = liquidarCancelacion({ precio: 97900, comision: 10000, iva: 2100, procesamiento: 5841, aprobada: false, hayTrabajador: false, tardia: false });
    expect(l.aCliente).toBe(110000);
    expect(l.procesamientoNoVuelve).toBe(5841);
    expect(d.devolver).toBeCloseTo(l.aCliente - l.alRetirar.comision, 2);
  });

  it('nunca devuelve mas de lo que entro', () => {
    const d = desgloseCancelacionSinContratar(52655, 5000, 1050, 2655);
    expect(d.devolver).toBeLessThanOrEqual(d.pagado);
    expect(d.devolver + d.retiene).toBeCloseTo(d.pagado, 2);
  });

  it('un pago en cero no genera devoluciones negativas', () => {
    const d = desgloseCancelacionSinContratar(0, 0, 0, 0);
    expect(d.devolver).toBe(0);
    expect(d.retiene).toBe(0);
  });
});

describe('marcas diarias del contrato', () => {

  /** Contrato falso con lo justo que usa el servicio. */
  const contrato = (desde: string, hasta: string, log: any[] = []) => {
    const c: any = {
      startDate: new Date(desde + 'T12:00:00'),
      endDate: new Date(hasta + 'T12:00:00'),
      dailyLog: log,
      changed: () => {},
    };
    return c;
  };

  const ayer = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
  const anteayer = () => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().slice(0, 10); };
  const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

  it('completa los dias transcurridos al confirmar el final', () => {
    const c = contrato(anteayer(), ayer());
    expect(marcarDiasAlFinalizar(c, 'client')).toBe(true);
    expect(c.dailyLog.length).toBe(2);
    expect(c.dailyLog.every((d: any) => d.markedByClientAt)).toBe(true);
  });

  it('NO marca dias que todavia no llegaron', () => {
    // Marcar el futuro seria afirmar que se trabajo un dia que no paso. Como
    // evidencia no vale nada y le quita credibilidad al resto de las marcas.
    const c = contrato(ayer(), manana());
    marcarDiasAlFinalizar(c, 'worker');
    expect(c.dailyLog.some((d: any) => d.date === manana())).toBe(false);
  });

  it('no pisa lo que ya se habia marcado dia por dia', () => {
    // Una marca puesta mientras el trabajo pasaba es mas creible que una puesta
    // en bloque al cerrar. No se sobrescribe.
    const original = '2020-01-01T10:00:00.000Z';
    const c = contrato(anteayer(), ayer(), [
      { date: anteayer(), markedByClientAt: original, markedByWorkerAt: null },
    ]);
    marcarDiasAlFinalizar(c, 'client');
    const fila = c.dailyLog.find((d: any) => d.date === anteayer());
    expect(fila.markedByClientAt).toBe(original);
    expect(fila.markedByClientAtAuto).toBeUndefined();
  });

  it('deja registrado que la marca fue automatica', () => {
    // Quien lea el expediente tiene que poder distinguir una marca del dia de
    // una puesta en bloque al cerrar: no valen lo mismo.
    const c = contrato(ayer(), ayer());
    marcarDiasAlFinalizar(c, 'worker');
    expect(c.dailyLog[0].markedByWorkerAtAuto).toBe(true);
  });

  it('el umbral de ausencia se adapta a la duracion', () => {
    // Dos dias de silencio en un contrato de un mes es normal; en uno de dos
    // dias es abandono total.
    expect(umbralAusencia(2)).toBe(1);
    expect(umbralAusencia(30)).toBe(4);
  });

  it('la vista expone los adjuntos de cada dia, y una lista vacia si no hay', () => {
    // Las pantallas web y mobile dibujan la galeria desde aca. Si el campo
    // faltara en un dia sin fotos, el `.length` rompe la pantalla entera.
    const foto = {
      url: '/uploads/daily-log/a.jpg', nombre: 'a.jpg', tipo: 'image/jpeg', bytes: 10,
      subidoPor: 'worker', subidoPorId: 'w1', subidoEl: '2026-09-10T10:00:00.000Z',
    };
    const c = contrato(anteayer(), ayer(), [
      { date: anteayer(), markedByClientAt: null, markedByWorkerAt: '2026-09-10T10:00:00.000Z', adjuntos: [foto] },
    ]);
    const vista = buildDailyLog(c, 'client');
    const conFoto = vista.dias.find((d: any) => d.date === anteayer());
    const sinFoto = vista.dias.find((d: any) => d.date === ayer());
    expect(conFoto.adjuntos).toEqual([foto]);
    expect(sinFoto.adjuntos).toEqual([]);
  });
});

describe('expediente en PDF', () => {

  const expediente = (mensajes: number) => ({
    generadoEn: new Date().toISOString(),
    contrato: {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', estado: 'completed',
      precio: 100000, comision: 10000, total: 112100,
      estadoEscrow: 'released', estadoPago: 'completed',
      inicio: new Date().toISOString(), fin: new Date().toISOString(),
      creado: new Date().toISOString(), codigoEmparejamiento: '123456',
      confirmoCliente: true, confirmoTrabajador: true, ampliaciones: [],
      diasConfirmados: 4, diasMarcadosPorTrabajador: 5, diasTotales: 5,
    },
    trabajo: { id: 'j1', titulo: 'Pintura', descripcion: 'Dos manos', categoria: 'Reparaciones', ubicacion: 'CABA', precioPublicado: 100000 },
    cliente: { id: 'c1', nombre: 'Ana', email: 'a@t.com', documentoVerificado: true, puntuacion: 4.8, trabajosCompletados: 3, registrado: new Date().toISOString() },
    trabajador: { id: 'w1', nombre: 'Luis', email: 'l@t.com', documentoVerificado: true, puntuacion: 4.9, trabajosCompletados: 22, registrado: new Date().toISOString() },
    pagos: [], movimientos: [], disputa: null,
    conversacion: Array.from({ length: mensajes }, (_, i) => ({
      fecha: new Date().toISOString(), de: i % 2 ? 'Luis' : 'Ana',
      mensaje: 'Mensaje ' + i + ' con acentos: ñandú, atención.', tipo: 'text',
    })),
    faltantes: [],
  });

  it('genera un PDF valido', async () => {
    // Es el unico formato que MercadoPago acepta para un descargo. Si esto
    // falla, un contracargo llega y no hay con que responder.
    const pdf = await evidenceToPdf(expediente(10) as any);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('entra en el limite de 10 MB aunque la conversacion sea enorme', async () => {
    // Un expediente que no entra en el limite no se puede presentar, que es
    // igual de malo que no tenerlo.
    const pdf = await evidenceToPdf(expediente(400) as any);
    expect(pdf.length).toBeLessThan(10 * 1024 * 1024);
  });

  it('recorta la conversacion larga pero avisa cuanto falta', async () => {
    // Callar el recorte le quitaria credibilidad al expediente entero si el
    // otro lado nota que faltan mensajes.
    const largo = await evidenceToPdf(expediente(400) as any);
    const corto = await evidenceToPdf(expediente(10) as any);
    expect(largo.length).toBeGreaterThan(corto.length);
    // 400 mensajes recortados a 120 no pueden pesar 40 veces mas que 10.
    expect(largo.length).toBeLessThan(corto.length * 40);
  });
});

describe('seleccion de mensajes del expediente', () => {

  it('con pocos mensajes los incluye todos', () => {
    expect(indicesAIncluir(8, 60)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('con muchos toma los extremos', () => {
    const r = indicesAIncluir(300, 60);
    expect(r.length).toBe(120);
    expect(r[0]).toBe(0);
    expect(r[r.length - 1]).toBe(299);
    // El del medio no entra: es lo que hay que poder pedir aparte.
    expect(r.includes(150)).toBe(false);
  });

  it('agrega un mensaje suelto del medio', () => {
    // El numero es el que muestra el PDF, empezando en 1: quien lo lee pide
    // "el 151" y recibe ese, no el 150.
    const r = indicesAIncluir(300, 60, [151]);
    expect(r.includes(150)).toBe(true);
  });

  it('agrega un rango', () => {
    const r = indicesAIncluir(300, 60, ['140-145']);
    for (let i = 139; i <= 144; i++) expect(r.includes(i)).toBe(true);
    expect(r.includes(145)).toBe(false);
  });

  it('un rango al reves se lee igual', () => {
    // Quien escribio "145-140" queria los mismos mensajes. Descartarlo seria
    // castigar un tipeo en el momento en que menos hay que estorbar.
    expect(indicesAIncluir(300, 60, ['145-140'])).toEqual(indicesAIncluir(300, 60, ['140-145']));
  });

  it('ignora lo que no tiene sentido en vez de romper', () => {
    // Un pedido invalido no puede dejar sin expediente a nadie el dia que hay
    // que presentar un descargo.
    const r = indicesAIncluir(300, 60, ['abc', -5, 0, 9999, '']);
    expect(r.length).toBe(120);
  });

  it('no duplica un mensaje que ya estaba en los extremos', () => {
    const r = indicesAIncluir(300, 60, [1, '295-300']);
    expect(new Set(r).size).toBe(r.length);
  });

  it('devuelve los indices ordenados', () => {
    // El PDF los recorre en orden: desordenados mostraria la conversacion
    // salteada y perderia todo sentido como evidencia.
    const r = indicesAIncluir(300, 60, ['200-205', 150]);
    expect([...r]).toEqual([...r].sort((a: number, b: number) => a - b));
  });
});

describe('quien puede promocionar su perfil', () => {

  it('un trabajador sin opiniones puede', () => {
    // Es quien mas lo necesita: no tiene historial que lo recomiende y la
    // promocion es su unica forma de que lo vean. Exigirle una opinion era
    // pedirle que consiga trabajo antes de poder buscarlo.
    expect(puedePromocionarse(0, 0)).toBe(true);
  });

  it('con opiniones buenas puede', () => {
    expect(puedePromocionarse(4.5, 3)).toBe(true);
    expect(puedePromocionarse(3.5, 1)).toBe(true);
  });

  it('con opiniones malas no', () => {
    // La plataforma ya sabe algo de esa persona, y vender visibilidad a quien
    // los clientes calificaron mal es cobrarle a los clientes el problema.
    expect(puedePromocionarse(2.0, 5)).toBe(false);
    expect(puedePromocionarse(3.4, 1)).toBe(false);
  });
});

describe('el silencio pierde en disputas', () => {
  const C = 'cliente-1', T = 'trabajador-1', A = 'admin-1';
  const hace = (d: number) => new Date(Date.now() - d * 86_400_000);

  it('abrir la disputa cuenta como hablar: el otro tiene que responder', () => {
    const s = estadoDeSilencio({ initiatedBy: C, createdAt: hace(3), messages: [] }, C, T);
    expect(s.ultimoEnHablar).toBe(C);
    expect(s.enSilencio).toBe(T);
    expect(s.dias).toBe(3);
  });

  it('el reloj pasa al que no respondio ultimo', () => {
    const s = estadoDeSilencio({
      initiatedBy: C, createdAt: hace(10),
      messages: [{ from: T, message: 'respondo', createdAt: hace(4) }],
    }, C, T);
    // El trabajador respondio hace 4 dias; ahora el silencio es del cliente.
    expect(s.ultimoEnHablar).toBe(T);
    expect(s.enSilencio).toBe(C);
    expect(s.dias).toBe(4);
  });

  it('los mensajes de administracion no cuentan para el reloj', () => {
    // Un admin que pide informacion no esta hablando en nombre de nadie. Si
    // contara, un admin activo le daria la razon al ultimo usuario que hablo
    // sin que el otro se enterara.
    const s = estadoDeSilencio({
      initiatedBy: C, createdAt: hace(8),
      messages: [{ from: A, isAdmin: true, message: 'necesito mas datos', createdAt: hace(1) }],
    }, C, T);
    expect(s.ultimoEnHablar).toBe(C);
    expect(s.enSilencio).toBe(T);
    expect(s.dias).toBe(8);
  });

  it('a los 7 dias corresponde resolver', () => {
    const s = estadoDeSilencio({ initiatedBy: T, createdAt: hace(7), messages: [] }, C, T);
    expect(s.dias).toBeGreaterThanOrEqual(DIAS_PARA_RESPONDER);
    // El trabajador abrio y el cliente callo: gana el trabajador.
    expect(s.ultimoEnHablar).toBe(T);
  });

  it('ante la duda no resuelve', () => {
    // Sin las dos partes identificadas, o con un iniciador que no es parte, es
    // mejor que un administrador mire que resolver mal a favor de alguien.
    expect(estadoDeSilencio({ initiatedBy: C, createdAt: hace(9), messages: [] }, C, '')).toBeNull();
    expect(estadoDeSilencio({ initiatedBy: 'otro', createdAt: hace(9), messages: [] }, C, T)).toBeNull();
  });
});

describe('el costo de procesamiento lo paga el cliente, con una tasa unica, y cubre la tarifa de MP al centavo', () => {
  // Trabajo de 36.000 con comision 3.600 e IVA 756: base 40.356. Tasa 4,19%.
  const RATE = 0.0419;

  it('se despeja sobre el total, no se suma sobre la base', () => {
    const p = procesamientoParaCobrar(40356, RATE);
    // Si se sumara 4,19% de la base (1.690,92), MP cobraria 4,19% del total
    // (mayor) y faltarian ~90 pesos en cada operacion. Despejado, cierra.
    expect(p.cargo).toBeGreaterThan(40356 * RATE);
    const total = 40356 + p.total;
    expect(total * RATE).toBeCloseTo(p.cargo, 1);
    expect(p.iva).toBeCloseTo(p.cargo * 0.21, 1);
  });

  it('el trabajador recibe el precio entero y a DOAPP le queda comision + IVA', () => {
    const s = splitFees(36000, 3600, 756, RATE);
    expect(s.workerReceives).toBe(36000);
    expect(s.clientPays).toBeCloseTo(40356 + s.processingCharge + s.processingVat, 2);
    // Lo que MP cobra de verdad (con IVA) sale del total; lo que queda es la comision con su IVA.
    expect(s.processingCost).toBeCloseTo(s.processingCharge, 0);
    expect(s.platformKeeps).toBeCloseTo(3600 + 756, 0);
    // La cuenta cierra al centavo.
    expect(s.workerReceives + s.processingCost + s.processingCostVat + s.platformKeeps).toBeCloseTo(s.clientPays, 2);
  });

  it('con tasa cero (pago con saldo) no hay procesamiento', () => {
    const s = splitFees(36000, 3600, 756, 0);
    expect(s.processingCharge).toBe(0);
    expect(s.clientPays).toBe(40356);
  });

  it('en beta (comision 0) el cliente paga el precio mas el procesamiento, nada mas', () => {
    const s = splitFees(36000, 0, 0, RATE);
    expect(s.commission).toBe(0);
    expect(s.clientPays).toBeCloseTo(36000 + s.processingCharge + s.processingVat, 2);
    expect(s.platformKeeps).toBeCloseTo(0, 0);
  });

  it('la tasa configurada por defecto es la del panel sin IVA, y el helper le saca el IVA a lo que MP informa', () => {
    expect(getProcessingFeeRate()).toBeLessThan(0.07);
    expect(pasarelaSinIva(121)).toBe(100);
  });
});

describe('liquidacion de una cancelacion (T&C 7.5, 9.1-9.3)', () => {
  // Trabajo de 36.000 con comision 3.600 e IVA 756: 40.356 a repartir. El
  // procesamiento (2.155 con IVA) lo pago el cliente y no entra en el reparto.
  const base = { precio: 36000, comision: 3600, iva: 756, procesamiento: 2155.27 };
  const PARTE = POLITICAS.CANCELACION_EN_REVISION_PARTE_COMISION;

  it('cada peso tiene un unico destino: saldo del cliente, trabajador o plataforma. El procesamiento nunca vuelve', () => {
    for (const caso of [
      { aprobada: false, hayTrabajador: false, tardia: false },
      { aprobada: true, hayTrabajador: false, tardia: false },
      { aprobada: true, hayTrabajador: true, tardia: false },
      { aprobada: true, hayTrabajador: true, tardia: true },
    ]) {
      const l = liquidarCancelacion({ ...base, ...caso });
      expect(l.aCliente + l.aTrabajador + l.retieneApp).toBeCloseTo(40356, 1);
      expect(l.procesamientoNoVuelve).toBeCloseTo(2155.27, 2);
    }
  });

  it('sin trabajador (antes o despues de aprobar): vuelve precio + comision como saldo, y retirar cuesta media comision', () => {
    for (const aprobada of [false, true]) {
      const l = liquidarCancelacion({ ...base, aprobada, hayTrabajador: false, tardia: false });
      expect(l.regla).toBe(aprobada ? 'sin_trabajador' : 'antes_de_aprobar');
      expect(l.retieneApp).toBe(0);
      expect(l.aCliente).toBe(40356);
      expect(l.aTrabajador).toBe(0);
      expect(l.alRetirar.comision).toBeCloseTo(4356 * PARTE, 1);
    }
  });

  it('la parte retenida al retirar equivale a la mitad de la comision: 5% con piso de EUR 1', () => {
    // Es lo que dice el T&C 9.1 en numeros; si la politica cambia, el texto
    // cambia solo, pero este test obliga a mirar que la frase siga teniendo sentido.
    const l = liquidarCancelacion({ ...base, aprobada: false, hayTrabajador: false, tardia: false, parteComisionEnRevision: 0.5 });
    expect(l.alRetirar.comision).toBeCloseTo((3600 + 756) / 2, 1);
  });

  it('con trabajador y con tiempo: el precio vuelve como saldo, la comision queda, retirar no cuesta', () => {
    const l = liquidarCancelacion({ ...base, aprobada: true, hayTrabajador: true, tardia: false });
    expect(l.regla).toBe('con_tiempo');
    expect(l.retieneApp).toBeCloseTo(4356, 1);
    expect(l.aCliente).toBe(36000);
    expect(l.aTrabajador).toBe(0);
    expect(l.alRetirar.comision).toBe(0);
  });

  it('tardia con trabajador: mitad al trabajador ENTERA, mitad al cliente', () => {
    const l = liquidarCancelacion({ ...base, aprobada: true, hayTrabajador: true, tardia: true });
    expect(l.regla).toBe('tardia_con_trabajador');
    expect(l.aTrabajador).toBe(18000);
    expect(l.aCliente).toBe(18000);
    expect(l.alRetirar.comision).toBe(0);
    expect(l.retieneApp).toBeCloseTo(4356, 1);
  });

  it('la parte del trabajador es la de la politica, no un 50% escrito a mano', () => {
    const l = liquidarCancelacion({ ...base, aprobada: true, hayTrabajador: true, tardia: true, parteTrabajador: 0.3 });
    expect(l.aTrabajador).toBeCloseTo(36000 * 0.3, 1);
    expect(l.aCliente).toBeCloseTo(36000 * 0.7, 1);
  });

  it('un pago sin procesamiento (anterior al cargo, o con saldo) liquida igual', () => {
    const l = liquidarCancelacion({ precio: 36000, comision: 3600, iva: 756, aprobada: true, hayTrabajador: true, tardia: false });
    expect(l.procesamientoNoVuelve).toBe(0);
    expect(l.aCliente).toBe(36000);
  });

  it('nunca devuelve negativos aunque el trabajo sea absurdamente chico', () => {
    const l = liquidarCancelacion({ precio: 100, comision: 3600, iva: 756, aprobada: true, hayTrabajador: true, tardia: true });
    expect(l.aCliente).toBeGreaterThanOrEqual(0);
    expect(l.aTrabajador).toBeGreaterThanOrEqual(0);
  });
});

describe('lo que cobra el trabajador (una sola cuenta)', () => {
  const contrato = { price: 36000 };

  it('cobra el precio entero: ni la comision ni la pasarela lo tocan', () => {
    // La comision la paga el cliente (mark-paid hacia precio - comision: se la
    // cobraba dos veces), y el procesamiento tambien (antes se le descontaba
    // al trabajador la tarifa real de fee_details).
    const m = montoParaElTrabajador(contrato, { processingFee: 1815, amount: 40356 } as any);
    expect(m.bruto).toBe(36000);
    expect(m.neto).toBe(36000);
  });

  it('en un contrato con varios trabajadores cobra su parte', () => {
    const m = montoParaElTrabajador({ price: 36000, allocatedAmount: 18000 }, {});
    expect(m.bruto).toBe(18000);
    expect(m.neto).toBe(18000);
  });

  it('tras una devolucion parcial por disputa, lo devuelto sale de la parte del trabajador', () => {
    // El admin resolvio devolverle 10.000 al cliente. El trabajador cobra
    // 26.000; antes cobraba los 36.000 y la diferencia la ponia la plataforma
    // sin que nadie lo viera.
    const m = montoParaElTrabajador(contrato, { refundedAmount: 10000 });
    expect(m.devueltoAlCliente).toBe(10000);
    expect(m.bruto).toBe(36000);
    expect(m.neto).toBe(26000);
  });

  it('con varios trabajadores, lo devuelto tambien se prorratea', () => {
    const m = montoParaElTrabajador({ price: 36000, allocatedAmount: 18000 }, { refundedAmount: 10000 });
    expect(m.devueltoAlCliente).toBe(5000);
    expect(m.neto).toBe(13000);
  });

  it('nunca devuelve negativo', () => {
    const m = montoParaElTrabajador({ price: 500 }, { refundedAmount: 900 });
    expect(m.neto).toBe(0);
  });
});

describe('las partes de un pago se reconstruyen desde el pago, con o sin procesamiento', () => {
  it('con procesamiento: el IVA de la comision es lo que queda despues de restar precio, comision y procesamiento con IVA', () => {
    const c = componentesDelPago({ amount: 42511.27, platformFee: 3600, processingCharge: 1781.22 }, 36000);
    expect(c.comision).toBe(3600);
    expect(c.procesamiento).toBeCloseTo(2155.28, 1);
    expect(c.iva).toBeCloseTo(756, 0);
  });

  it('sin procesamiento (pago anterior al cargo): procesamiento 0 y la cuenta sigue cerrando', () => {
    const c = componentesDelPago({ amount: 40356, platformFee: 3600, processingCharge: null }, 36000);
    expect(c.procesamiento).toBe(0);
    expect(c.iva).toBe(756);
  });

  it('sin pago: todo cero', () => {
    expect(componentesDelPago(null, 36000)).toEqual({ comision: 0, iva: 0, procesamiento: 0 });
  });
});

describe('escalera de cancelaciones', () => {

  it('la ventana es movil, no de por vida', () => {
    // Un trabajador que cancelo dos veces hace un año y desde entonces cumplio
    // no es el mismo que uno que cancelo dos veces este mes.
    expect(VENTANA_DIAS).toBeLessThanOrEqual(90);
    expect(VENTANA_DIAS).toBeGreaterThanOrEqual(30);
  });

  it('la suspension es corta y la marca larga', () => {
    // La suspension castiga; la marca informa. Informar tiene que durar mas
    // que castigar: es lo que le sirve al proximo cliente.
    expect(SUSPENSION_4TA_DIAS).toBeLessThan(MARCA_VISIBLE_DIAS);
  });

  it('la cuarta cancelacion suspende mas que la tercera', () => {
    // La tercera todavia puede ser mala suerte; la cuarta en tres meses es un
    // patron. Cada escalon tiene que ser mas caro que el anterior, si no la
    // escalera deja de ser escalera.
    expect(SUSPENSION_3RA_DIAS).toBeGreaterThan(0);
    expect(SUSPENSION_4TA_DIAS).toBeGreaterThan(SUSPENSION_3RA_DIAS);
    expect(diasDeSuspension(3)).toBe(SUSPENSION_3RA_DIAS);
    expect(diasDeSuspension(4)).toBe(SUSPENSION_4TA_DIAS);
    expect(diasDeSuspension(9)).toBe(SUSPENSION_4TA_DIAS);
  });
});
