'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Verificar si la tabla ya existe
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('family_codes')) {
      // 1. Crear tabla family_codes
      await queryInterface.createTable('family_codes', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        first_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        last_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        code: {
          type: Sequelize.STRING(20),
          allowNull: false,
          unique: true,
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          allowNull: false,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        used_by_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        used_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });

      // 2. Agregar índices a family_codes (solo si no existen)
      try {
        await queryInterface.addIndex('family_codes', ['code']);
      } catch (e) {
        // Índice ya existe
      }
      try {
        await queryInterface.addIndex('family_codes', ['used_by_id']);
      } catch (e) {
        // Índice ya existe
      }
      try {
        await queryInterface.addIndex('family_codes', ['created_by_id']);
      } catch (e) {
        // Índice ya existe
      }
      try {
        await queryInterface.addIndex('family_codes', ['is_active']);
      } catch (e) {
        // Índice ya existe
      }
    }

    // 3. Agregar columnas a users para family plan (solo si no existen)
    const usersTable = await queryInterface.describeTable('users');

    if (!usersTable.family_code_id) {
      await queryInterface.addColumn('users', 'family_code_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'family_codes',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    }

    if (!usersTable.has_family_plan) {
      await queryInterface.addColumn('users', 'has_family_plan', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }

    // 4. Agregar índice para family_code_id
    if (!usersTable.family_code_id) {
      try {
        await queryInterface.addIndex('users', ['family_code_id']);
      } catch (e) {
        // Índice ya existe
      }
    }
  },

  async down (queryInterface, Sequelize) {
    // Revertir en orden inverso
    await queryInterface.removeIndex('users', ['family_code_id']);
    await queryInterface.removeColumn('users', 'has_family_plan');
    await queryInterface.removeColumn('users', 'family_code_id');

    await queryInterface.removeIndex('family_codes', ['is_active']);
    await queryInterface.removeIndex('family_codes', ['created_by_id']);
    await queryInterface.removeIndex('family_codes', ['used_by_id']);
    await queryInterface.removeIndex('family_codes', ['code']);

    await queryInterface.dropTable('family_codes');
  }
};
