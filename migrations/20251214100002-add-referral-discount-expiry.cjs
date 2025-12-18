'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add referral discount expiration date
    await queryInterface.addColumn('users', 'referral_discount_expires_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add flag for referral discount
    await queryInterface.addColumn('users', 'has_referral_discount', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    // For existing users with 3% commission rate from referrals,
    // set expiry to 1 month from now (grandfathering existing users)
    await queryInterface.sequelize.query(`
      UPDATE users
      SET referral_discount_expires_at = NOW() + INTERVAL '1 month',
          has_referral_discount = true
      WHERE current_commission_rate = 3.0
        AND membership_tier = 'free'
        AND completed_referrals >= 3
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'referral_discount_expires_at');
    await queryInterface.removeColumn('users', 'has_referral_discount');
  }
};
