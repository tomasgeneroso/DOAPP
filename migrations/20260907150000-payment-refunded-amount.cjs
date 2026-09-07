'use strict';

/**
 * Cuanto se devolvio de cada pago, acumulado.
 *
 * El libro mayor (payment_actions) ya impide una segunda operacion terminal
 * sobre el mismo contrato, y eso cubre las devoluciones hechas desde la app.
 * Lo que no cubre es una devolucion hecha desde el panel de MercadoPago: esa
 * ocurre sin pasar por nuestro codigo, y despues la app cree que todavia hay
 * plata para devolver cuando ya no queda.
 *
 * Con el acumulado, cada devolucion verifica contra el total del pago bajo un
 * bloqueo de fila, y la conciliacion puede comparar nuestro acumulado contra el
 * de MercadoPago y avisar si alguien devolvio por afuera.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabla = await queryInterface.describeTable('payments');

    if (!tabla.refunded_amount) {
      await queryInterface.addColumn('payments', 'refunded_amount', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    // Los pagos que ya figuran como devueltos tienen su monto entero devuelto.
    // Sin esto, un pago viejo marcado 'refunded' quedaria con acumulado cero y
    // la app creeria que todavia se le puede devolver todo otra vez.
    await queryInterface.sequelize.query(
      `UPDATE payments SET refunded_amount = amount WHERE status = 'refunded' AND refunded_amount = 0`,
    );
  },

  async down(queryInterface) {
    const tabla = await queryInterface.describeTable('payments');
    if (tabla.refunded_amount) await queryInterface.removeColumn('payments', 'refunded_amount');
  },
};
