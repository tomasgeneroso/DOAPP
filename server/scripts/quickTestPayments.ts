import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function testPaymentsEndpoint() {
  try {
    // 1. Login
    console.log('🔐 Logging in...');
    const loginRes = await fetch('https://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@doapp.com', password: 'password123' }),
      agent
    });

    const loginData = await loginRes.json() as any;
    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.message);
      return;
    }

    const token = loginData.token;
    console.log('✅ Logged in as admin\n');

    // 2. Get pending payments
    console.log('📋 Testing /api/admin/payments/pending endpoint...');
    const paymentsRes = await fetch('https://localhost:3001/api/admin/payments/pending', {
      headers: { 'Authorization': `Bearer ${token}` },
      agent
    });

    const paymentsData = await paymentsRes.json() as any;

    console.log('\n=== API Response ===');
    console.log('Success:', paymentsData.success);
    console.log('Total payments:', paymentsData.data?.length || 0);
    console.log('Pagination:', paymentsData.pagination);

    if (paymentsData.data && paymentsData.data.length > 0) {
      console.log('\n=== First 3 Payments ===\n');
      paymentsData.data.slice(0, 3).forEach((p: any, i: number) => {
        console.log(`${i+1}. Payment ${p.id.substring(0,8)}...`);
        console.log(`   Type: ${p.paymentType}`);
        console.log(`   Status: ${p.status}`);
        console.log(`   Amount: $${p.amount} ${p.currency}`);
        console.log(`   Payer: ${p.payer?.name || 'N/A'} (${p.payer?.email || 'N/A'})`);
        console.log(`   Recipient: ${p.recipient?.name || 'Platform'}`);
        console.log(`   Payment Method: ${p.isMercadoPago ? 'MercadoPago' : 'Transfer'}`);
        console.log(`   Payer Confirmed: ${p.payerConfirmed ? 'Yes' : 'No'}`);
        console.log(`   Recipient Confirmed: ${p.recipientConfirmed ? 'Yes' : 'No'}`);
        if (p.contract?.job) {
          console.log(`   Job: ${p.contract.job.title}`);
        }
        console.log('');
      });

      console.log(`\n✅ Endpoint is working! Found ${paymentsData.data.length} pending payments\n`);
    } else {
      console.log('\n⚠️ No payments found (this might be expected if no payments are pending)\n');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testPaymentsEndpoint();
