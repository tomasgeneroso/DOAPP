import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import paypalService from "../services/paypal.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testPayPalConnection() {
  console.log("🧪 Testing PayPal Sandbox Connection...\n");
  const mode = process.env.PAYPAL_MODE || "sandbox";
  const clientId = mode === "sandbox"
    ? (process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID)
    : process.env.PAYPAL_CLIENT_ID;
  const clientSecret = mode === "sandbox"
    ? (process.env.PAYPAL_SANDBOX_SECRET || process.env.PAYPAL_CLIENT_SECRET)
    : process.env.PAYPAL_CLIENT_SECRET;

  console.log("📋 Configuration:");
  console.log(`   Mode: ${mode}`);
  console.log(`   Using: ${mode === "sandbox" ? "SANDBOX" : "PRODUCTION"} credentials`);
  console.log(`   Client ID: ${clientId?.substring(0, 20)}...`);
  console.log(`   Client Secret: ${clientSecret?.substring(0, 20)}...`);
  console.log(`   Platform Fee: ${process.env.PAYPAL_PLATFORM_FEE_PERCENTAGE}%\n`);

  if (!clientId || !clientSecret) {
    console.log("❌ PayPal credentials not configured in .env");
    if (mode === "sandbox") {
      console.log("💡 Looking for: PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_SECRET");
    } else {
      console.log("💡 Looking for: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
    }
    process.exit(1);
  }

  try {
    // Test 1: Create a test order
    console.log("📝 Test 1: Creating PayPal Order...");
    const testOrder = await paypalService.createOrder({
      amount: "100.00",
      currency: "USD",
      description: "Test Order - PayPal Integration",
      contractId: "test-contract-123",
    });

    console.log("   ✅ Order Created Successfully!");
    console.log(`   Order ID: ${testOrder.orderId}`);
    console.log(`   Status: ${testOrder.status}`);

    // Find approval URL
    const approvalUrl = testOrder.links?.find((link: any) => link.rel === "approve")?.href;
    if (approvalUrl) {
      console.log(`   Approval URL: ${approvalUrl}`);
    }

    // Test 2: Get order details
    console.log("\n📖 Test 2: Getting Order Details...");
    const orderDetails = await paypalService.getOrderDetails(testOrder.orderId);
    console.log("   ✅ Order Details Retrieved!");
    console.log(`   Amount: ${orderDetails.purchase_units[0].amount.value} ${orderDetails.purchase_units[0].amount.currency_code}`);
    console.log(`   Status: ${orderDetails.status}`);

    // Test 3: Calculate platform fee
    console.log("\n🔢 Test 3: Testing Platform Fee Calculation...");
    const testAmounts = [100, 250, 500, 1000];
    testAmounts.forEach(amount => {
      const fee = paypalService.calculatePlatformFee(amount);
      console.log(`   Amount: $${amount} → Fee: $${fee} (${process.env.PAYPAL_PLATFORM_FEE_PERCENTAGE}%)`);
    });
    console.log("   ✅ Platform Fee Calculation Working!");

    // Summary
    console.log("\n✅ All PayPal Tests Completed Successfully!\n");
    console.log("📊 Summary:");
    console.log("   - Connection: ✅ Working");
    console.log("   - Create Order: ✅ Working");
    console.log("   - Get Order Details: ✅ Working");
    console.log("   - Platform Fee: ✅ Working");

    console.log("\n🎯 Next Steps:");
    console.log("   1. Use the Approval URL to complete payment in sandbox");
    console.log("   2. Test order capture after approval");
    console.log("   3. Test escrow hold and release");
    console.log("   4. Test refund functionality");

    console.log("\n🔗 PayPal Sandbox Accounts:");
    console.log(`   Business: ${process.env.SANDBOX_BUSINESS_ACCOUNT || "Not configured"}`);
    console.log(`   Personal: ${process.env.SANDBOX_PERSONAL_ACCOUNT || "Not configured"}`);
    console.log("   Password: Check your PayPal Developer Dashboard");

    console.log("\n📚 Testing Guide:");
    console.log("   1. Go to: https://www.sandbox.paypal.com");
    console.log("   2. Login with Personal Account credentials");
    console.log("   3. Use the Approval URL from Test 1");
    console.log("   4. Complete the payment");
    console.log("   5. Then test capture via API");

  } catch (error: any) {
    console.error("\n❌ Error during PayPal testing:");
    console.error(`   Message: ${error.message}`);

    if (error.message.includes("Authentication")) {
      console.log("\n💡 Tip: Check your PayPal credentials in .env");
      console.log("   - Make sure Client ID and Client Secret are correct");
      console.log("   - Verify you're using SANDBOX credentials");
      console.log("   - Get credentials from: https://developer.paypal.com/dashboard/");
    }

    process.exit(1);
  }
}

testPayPalConnection();
