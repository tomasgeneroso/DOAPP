/**
 * Script para probar el envío de emails con Hostinger SMTP
 *
 * Uso:
 * npx tsx server/scripts/testEmail.ts your-email@example.com
 */

import emailService from '../services/email.js';

async function testEmail() {
  const testEmailAddress = process.argv[2];

  if (!testEmailAddress) {
    console.error('❌ Por favor proporciona un email de destino');
    console.log('Uso: npx tsx server/scripts/testEmail.ts your-email@example.com');
    process.exit(1);
  }

  console.log('📧 Probando envío de email a:', testEmailAddress);
  console.log('📝 Configuración:');
  console.log('  - Provider:', process.env.EMAIL_PROVIDER || 'NO CONFIGURADO');
  console.log('  - SMTP Host:', process.env.SMTP_HOST || 'NO CONFIGURADO');
  console.log('  - SMTP Port:', process.env.SMTP_PORT || 'NO CONFIGURADO');
  console.log('  - SMTP User:', process.env.SMTP_USER || 'NO CONFIGURADO');
  console.log('  - SMTP From:', process.env.SMTP_FROM_EMAIL || 'NO CONFIGURADO');
  console.log('');

  try {
    const result = await emailService.sendEmail({
      to: testEmailAddress,
      subject: 'Test Email - DOAPP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0284c7;">🎉 Email de Prueba - DOAPP</h1>
          <p>Este es un email de prueba del servicio de notificaciones de DOAPP.</p>
          <p>Si recibes este mensaje, significa que la configuración de email está funcionando correctamente.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <h2 style="color: #059669;">✅ Configuración Exitosa</h2>
          <ul>
            <li><strong>Provider:</strong> ${process.env.EMAIL_PROVIDER}</li>
            <li><strong>Host:</strong> ${process.env.SMTP_HOST}</li>
            <li><strong>Puerto:</strong> ${process.env.SMTP_PORT}</li>
            <li><strong>Usuario:</strong> ${process.env.SMTP_USER}</li>
          </ul>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Este es un email automático generado por el script de prueba de DOAPP.
          </p>
        </div>
      `,
    });

    if (result) {
      console.log('✅ Email enviado exitosamente!');
      console.log('📬 Revisa tu bandeja de entrada y también la carpeta de spam');
    } else {
      console.error('❌ Error al enviar el email');
      console.error('Verifica tu configuración en el archivo .env');
    }
  } catch (error) {
    console.error('❌ Error al enviar email:', error);
  }

  process.exit(0);
}

testEmail();
