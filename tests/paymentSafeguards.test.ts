import {
  requiereDobleConfirmacion,
  verificarEnfriamientoCbu,
  MONTO_DOBLE_CONFIRMACION_ARS,
  ENFRIAMIENTO_CBU_HORAS,
  TOPE_DIARIO_POR_ROL_ARS,
} from '../server/services/paymentSafeguards.js';

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
  const { leerMetadata } = require('../server/utils/auditLog.js');
  const { gzipSync } = require('node:zlib');

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
  const { PROPORCION_MAXIMA_DEVOLUCIONES, TOPE_DIARIO_POR_ROL_ARS } = require('../server/services/paymentSafeguards.js');

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
  const { desgloseCancelacionSinContratar } = require('../shared/pricing/processingCost.js');

  it('el costo de pasarela no vuelve', () => {
    // Es lo que la gente no espera: MercadoPago ya cobro por procesar, y
    // devolver es una segunda operacion, no un "deshacer".
    const d = desgloseCancelacionSinContratar(110000, 10000, 2100, 0.0531);
    expect(d.costoPasarela).toBeCloseTo(5841, 0);
    expect(d.devolver).toBeCloseTo(110000 - 5841, 0);
    expect(d.retiene).toBeCloseTo(d.costoPasarela, 2);
  });

  it('la comision y el IVA vuelven porque no hubo contratacion', () => {
    // La comision se cobra por intermediar una contratacion. Si no hubo
    // ninguna, quedarsela seria cobrar por un servicio que no se presto.
    const d = desgloseCancelacionSinContratar(110000, 10000, 2100, 0);
    expect(d.devolver).toBe(110000);
    expect(d.retiene).toBe(0);
  });

  it('nunca devuelve mas de lo que entro', () => {
    const d = desgloseCancelacionSinContratar(50000, 5000, 1050, 0.0531);
    expect(d.devolver).toBeLessThanOrEqual(d.pagado);
    expect(d.devolver + d.retiene).toBeCloseTo(d.pagado, 2);
  });

  it('un pago en cero no genera devoluciones negativas', () => {
    const d = desgloseCancelacionSinContratar(0, 0, 0, 0.0531);
    expect(d.devolver).toBe(0);
    expect(d.retiene).toBe(0);
  });
});

describe('marcas diarias del contrato', () => {
  const { marcarDiasAlFinalizar, umbralAusencia, buildDailyLog } = require('../server/services/dailyLog.js');

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
  const { evidenceToPdf } = require('../server/services/contractEvidence.js');

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
  const { indicesAIncluir } = require('../server/services/contractEvidence.js');

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
  const { puedePromocionarse } = require('../server/routes/profilePromotion.js');

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
  const { estadoDeSilencio, DIAS_PARA_RESPONDER } = require('../server/jobs/disputeSilence.js');
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

describe('escalera de cancelaciones', () => {
  const { VENTANA_DIAS, MARCA_VISIBLE_DIAS, SUSPENSION_DIAS } = require('../server/services/cancellationLadder.js');

  it('la ventana es movil, no de por vida', () => {
    // Un trabajador que cancelo dos veces hace un año y desde entonces cumplio
    // no es el mismo que uno que cancelo dos veces este mes.
    expect(VENTANA_DIAS).toBeLessThanOrEqual(90);
    expect(VENTANA_DIAS).toBeGreaterThanOrEqual(30);
  });

  it('la suspension es corta y la marca larga', () => {
    // La suspension castiga; la marca informa. Informar tiene que durar mas
    // que castigar: es lo que le sirve al proximo cliente.
    expect(SUSPENSION_DIAS).toBeLessThan(MARCA_VISIBLE_DIAS);
  });
});
