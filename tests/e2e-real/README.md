# Pruebas reales con navegador

Estas pruebas hacen **lo mismo que hacés vos cuando probás a mano**: abren un navegador de verdad, entran a la web de DOAPP, escriben en los formularios, tocan los botones, pagan en la página de Mercado Pago, miran el correo y entran como administrador a aprobar. Cada prueba lleva el número del caso de la lista de pruebas manuales (A1, B3, etc.), así sabés cuál de tus pasos está cubriendo.

## Qué es real y qué no

| Parte | ¿Es real? |
|---|---|
| El navegador y la web (compilada igual que en producción) | Sí |
| El servidor de DOAPP (en modo producción) | Sí |
| La base de datos | Sí, pero una propia (`doapp_e2e`): se borra y se arma de cero cada vez. Nunca toca la de desarrollo ni la de producción |
| Mercado Pago, Didit (verificación de identidad), correo, direcciones, tipo de cambio | **No: son «gemelos»**, programas chicos de esta carpeta que se portan igual que el original pero no cobran ni mandan nada afuera |

Un «gemelo» sirve para probar **cómo reacciona DOAPP**. No sirve para probar **cómo se porta el tercero de verdad**. Ejemplo: el gemelo de Mercado Pago cobra exactamente lo que DOAPP le pide, así que no puede decirte si el Mercado Pago real descuenta lo mismo que DOAPP calcula. Esa parte sigue siendo manual (ver `COBERTURA.md`).

## Cómo correrlas

1. En una terminal, dejá el sistema levantado (tarda alrededor de 1 minuto y queda andando):

   ```
   npm run test:real:entorno
   ```

2. En otra terminal, corré las pruebas:

   ```
   E2E_REUSAR=1 npm run test:real -- --project=escritorio            # todas
   E2E_REUSAR=1 npm run test:real -- --project=escritorio casos/A-   # solo la parte A
   E2E_REUSAR=1 npm run test:real -- --project=escritorio -g "A12"   # un caso
   npm run test:real:ver                                            # con el navegador a la vista
   npm run test:real:informe                                        # abre el informe con capturas y video de lo que falló
   ```

   `E2E_REUSAR=1` quiere decir «el sistema ya está levantado, usalo». Sin eso, cada corrida lo levanta y lo baja sola (más lento).

3. Si cambiás código del **servidor** o de un **gemelo**, hay que reiniciar el sistema del paso 1 (cortalo con Ctrl+C y levantalo de nuevo). Si cambiás la **web**, se vuelve a compilar sola.

## Cómo está armado

- `casos/`: las pruebas, un archivo por parte de la lista (`A-publicar-y-pagar`, `B-pagar-por-transferencia`, …).
- `ayudas/`: pasos que se repiten (registrarse, publicar un trabajo, pagar con tarjeta, subir un comprobante).
- `gemelos/`: los terceros falsos.
- `entorno/`: lo que levanta y baja todo.
- `COBERTURA.md`: qué casos de la lista ya están automatizados, cuáles siguen a mano y por qué.

## Cosas a tener en cuenta

- **Cada persona entra con su propia dirección IP**, para que los límites de pedidos del servidor sigan encendidos (como en producción) y una corrida larga no los agote.
- **El navegador no sale a internet**: mapas, Google, estadísticas y fuentes se cortan. Lo único que se contesta a mano son las direcciones (tienen su gemelo).
- **La web tiene un cuadro «Mantente actualizado con todas las novedades»** que aparece un rato después de entrar. Las pruebas lo cierran con «Más tarde», como lo haría una persona.
- **No se puede publicar dos trabajos del mismo cliente en el mismo horario** (la web avisa «conflicto de horarios»): si una prueba publica dos, usa fechas distintas.
- **El sistema no deja usar dos veces el mismo número de operación** en una transferencia: cada prueba genera el suyo.
- **Las pruebas corren de a una** (`workers: 1`) porque comparten la base: algunas apagan un módulo un rato (A15) y lo vuelven a encender.
