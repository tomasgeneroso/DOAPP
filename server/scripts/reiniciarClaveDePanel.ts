/**
 * Salida de emergencia: borra la clave de panel de una persona para que cree una nueva la próxima vez que entre (por ejemplo, el owner la perdió y el correo
 * no sale). Se corre en el servidor. Vista previa por defecto; escribe solo con --aplicar.
 *
 *   npx tsx server/scripts/reiniciarClaveDePanel.ts --email=<correo> [--aplicar]
 */
import { initDatabase, sequelize } from '../config/database.js';
import { User } from '../models/sql/User.model.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import { borrarClaveDePanel, estadoDeLaClave } from '../services/claveDePanel.js';
import { conSistema } from '../db/contextoRls.js';
import { enmascararCorreo } from '../../shared/seguridad/datosPersonales.js';

async function main(): Promise<void> {
  const email = process.argv.find((a) => a.startsWith('--email='))?.slice('--email='.length).trim().toLowerCase();
  const aplicar = process.argv.includes('--aplicar');
  if (!email) {
    console.log('Uso: npx tsx server/scripts/reiniciarClaveDePanel.ts --email=<correo> [--aplicar]');
    process.exit(1);
  }
  await initDatabase();
  await conSistema(async () => {
    const persona = await User.findOne({ where: { email } });
    if (!persona) {
      console.log(`No hay una cuenta con el correo ${enmascararCorreo(email)}.`);
      return;
    }
    const { creada, desde } = await estadoDeLaClave(String(persona.id));
    console.log(`Cuenta ${enmascararCorreo(email)} · rol: ${persona.adminRole || 'sin rol'} · clave de panel: ${creada ? `creada el ${desde?.toISOString().slice(0, 10)}` : 'todavía no tiene'}`);
    if (!aplicar) {
      console.log('Vista previa: no se cambió nada. Con --aplicar se borra la clave y esa persona crea una nueva al entrar al panel.');
      return;
    }
    const borrada = await borrarClaveDePanel(String(persona.id));
    if (borrada) {
      await AuditLog.create({ action: 'panel_key.reset_by_script', category: 'role', severity: 'critical', description: 'Clave de panel reiniciada desde el servidor (script)', targetModel: 'User', targetId: String(persona.id), performedBy: persona.id } as any);
    }
    console.log(borrada ? 'Listo: la clave se borró. Al entrar al panel va a crear una nueva.' : 'No había nada para borrar.');
  });
  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('No se pudo:', e?.message);
  process.exit(1);
});
