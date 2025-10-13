/**
 * Test SMTP Connection for Hostinger
 *
 * Run with: node test-smtp.js
 *
 * This script tests your Hostinger SMTP configuration
 * before using it in the application.
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE === 'true' || true,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM_EMAIL || '',
};

console.log('\n📧 Testing Hostinger SMTP Configuration\n');
console.log('Configuration:');
console.log(`  Host: ${SMTP_CONFIG.host}`);
console.log(`  Port: ${SMTP_CONFIG.port}`);
console.log(`  Secure: ${SMTP_CONFIG.secure}`);
console.log(`  User: ${SMTP_CONFIG.user}`);
console.log(`  From: ${SMTP_CONFIG.from}`);
console.log(`  Password: ${'*'.repeat(SMTP_CONFIG.pass.length)}`);
console.log('');

// Validate configuration
if (!SMTP_CONFIG.user || !SMTP_CONFIG.pass) {
  console.error('❌ Error: SMTP_USER and SMTP_PASS are required in .env file\n');
  process.exit(1);
}

// Create transporter
const transporter = nodemailer.createTransport({
  host: SMTP_CONFIG.host,
  port: SMTP_CONFIG.port,
  secure: SMTP_CONFIG.secure,
  auth: {
    user: SMTP_CONFIG.user,
    pass: SMTP_CONFIG.pass,
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

console.log('🔄 Testing connection...\n');

// Test connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Connection Failed!\n');
    console.error('Error:', error.message);
    console.error('\n💡 Common issues:\n');
    console.error('1. Incorrect email/password');
    console.error('   → Use the EMAIL password, not your Hostinger account password');
    console.error('   → Make sure SMTP_USER is the full email (e.g., noreply@doapparg.site)');
    console.error('');
    console.error('2. Email account not activated in Hostinger');
    console.error('   → Go to Hostinger panel > Emails');
    console.error('   → Verify your email account is active');
    console.error('');
    console.error('3. Wrong port/security settings');
    console.error('   → Try port 465 with SMTP_SECURE=true (SSL)');
    console.error('   → Or port 587 with SMTP_SECURE=false (STARTTLS)');
    console.error('');
    console.error('4. SMTP access not enabled');
    console.error('   → Check Hostinger email settings');
    console.error('   → Some hosting plans may have restrictions\n');
    process.exit(1);
  } else {
    console.log('✅ SMTP Connection Successful!\n');
    console.log('The server is ready to send emails.\n');

    // Optionally send a test email
    const testEmail = process.argv[2]; // node test-smtp.js your@email.com

    if (testEmail) {
      console.log(`📨 Sending test email to ${testEmail}...\n`);

      transporter.sendMail({
        from: SMTP_CONFIG.from,
        to: testEmail,
        subject: 'Test Email from DoApp',
        text: 'This is a test email from your DoApp SMTP configuration.',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>✅ SMTP Test Successful</h1>
                </div>
                <div class="content">
                  <p>Congratulations! Your Hostinger SMTP configuration is working correctly.</p>
                  <p><strong>Configuration details:</strong></p>
                  <ul>
                    <li>Host: ${SMTP_CONFIG.host}</li>
                    <li>Port: ${SMTP_CONFIG.port}</li>
                    <li>Secure: ${SMTP_CONFIG.secure}</li>
                    <li>From: ${SMTP_CONFIG.from}</li>
                  </ul>
                  <p>Your DoApp email service is ready to use!</p>
                </div>
              </div>
            </body>
          </html>
        `
      }, (error, info) => {
        if (error) {
          console.error('❌ Failed to send test email:', error.message);
          process.exit(1);
        } else {
          console.log('✅ Test email sent successfully!');
          console.log('Message ID:', info.messageId);
          console.log('\nCheck your inbox (and spam folder) for the test email.\n');
        }
      });
    } else {
      console.log('💡 To send a test email, run:');
      console.log('   node test-smtp.js your@email.com\n');
    }
  }
});
