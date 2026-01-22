import fetch from 'node-fetch';
import https from 'https';

// Disable SSL verification for localhost
const agent = new https.Agent({
  rejectUnauthorized: false
});

async function testAdminPayments() {
  try {
    // 1. Login as admin
    console.log('🔐 Logging in as admin...');
    const loginResponse = await fetch('https://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@doapp.com',
        password: 'password123'
      }),
      agent
    });

    const loginData = await loginResponse.json() as any;
    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.message);
      return;
    }

    const token = loginData.token;
    console.log('✅ Logged in successfully\n');

    // 2. Get pending payments
    console.log('📋 Fetching pending payments...');
    const paymentsResponse = await fetch('https://localhost:3001/api/admin/payments/pending', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      agent
    });

    const paymentsData = await paymentsResponse.json() as any;
    if (!paymentsData.success) {
      console.error('❌ Failed to get payments:', paymentsData.message);
      return;
    }

    console.log(`✅ Found ${paymentsData.data.length} pending payments\n`);

    // 3. Display first 5 payments
    console.log('=== Pending Payments (First 5) ===\n');
    paymentsData.data.slice(0, 5).forEach((payment: any, index: number) => {
      console.log(`${index + 1}. Payment ID: ${payment.id.substring(0, 8)}...`);
      console.log(`   Type: ${payment.paymentType}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Amount: $${payment.amount} ${payment.currency}`);
      console.log(`   Method: ${payment.paymentMethod}`);
      console.log(`   Payer: ${payment.payer?.name || 'N/A'} (${payment.payer?.email || 'N/A'})`);
      console.log(`   Recipient: ${payment.recipient?.name || 'N/A'} (${payment.recipient?.email || 'N/A'})`);

      if (payment.contract) {
        console.log(`   Contract:`);
        console.log(`     - Job: ${payment.contract.job?.title || 'N/A'}`);
        console.log(`     - Status: ${payment.contract.status}`);
        console.log(`     - Price: $${payment.contract.price}`);
      }

      if (payment.recipient?.bankingInfo) {
        console.log(`   Banking Info:`);
        console.log(`     - CBU: ${payment.recipient.bankingInfo.cbu || 'N/A'}`);
        console.log(`     - Alias: ${payment.recipient.bankingInfo.alias || 'N/A'}`);
        console.log(`     - Bank: ${payment.recipient.bankingInfo.bankName || 'N/A'}`);
      }

      console.log(`   Created: ${new Date(payment.createdAt).toLocaleString()}`);
      console.log('');
    });

    console.log(`\n📊 Total pending payments: ${paymentsData.pagination.total}`);
    console.log(`✅ Admin payment module is now working!\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testAdminPayments();
