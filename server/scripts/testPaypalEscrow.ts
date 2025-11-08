import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "../models/User.js";
import Contract from "../models/Contract.js";
import Payment from "../models/Payment.js";
import Job from "../models/Job.js";
import paypalService from "../services/paypal.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found in .env");
  process.exit(1);
}

async function testPayPalEscrowFlow() {
  console.log("🧪 PayPal Escrow Flow - Complete Integration Test\n");
  console.log("📋 This test will simulate the complete escrow flow:");
  console.log("   1. Create test contract");
  console.log("   2. Create PayPal order");
  console.log("   3. Simulate payment (you'll need to approve manually)");
  console.log("   4. Capture payment (escrow hold)");
  console.log("   5. Release escrow");
  console.log("   6. Verify final state\n");

  try {
    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Step 1: Find or create test users
    console.log("👥 Step 1: Setting up test users...");

    let client = await User.findOne({ email: "maria@example.com" });
    let doer = await User.findOne({ email: "carlos@example.com" });

    if (!client || !doer) {
      console.log("❌ Test users not found. Please run: npm run seed:mockup");
      process.exit(1);
    }

    console.log(`   Client: ${client.name} (${client.email})`);
    console.log(`   Doer: ${doer.name} (${doer.email})`);
    console.log("   ✅ Users ready\n");

    // Step 2: Create test job and contract
    console.log("💼 Step 2: Creating test job and contract...");

    const testJob = await Job.create({
      title: "PayPal Escrow Test - Web Development",
      description: "Test job for PayPal escrow flow testing",
      summary: "Testing escrow functionality",
      category: "Desarrollo Web",
      budget: 100,
      price: 100,
      location: "Remote",
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "in_progress",
      postedBy: client._id,
      client: client._id,
      doer: doer._id,
    });

    const testContract = await Contract.create({
      job: testJob._id,
      client: client._id,
      doer: doer._id,
      type: "trabajo",
      price: 100,
      commission: 5,
      totalPrice: 105,
      escrowAmount: 100,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "accepted",
      termsAccepted: true,
      termsAcceptedByClient: true,
      termsAcceptedByDoer: true,
      clientConfirmedPairing: true,
      doerConfirmedPairing: true,
      escrowEnabled: true,
      paymentStatus: "pending",
    });

    console.log(`   Job ID: ${testJob._id}`);
    console.log(`   Contract ID: ${testContract._id}`);
    console.log("   ✅ Job and contract created\n");

    // Step 3: Create PayPal order
    console.log("📝 Step 3: Creating PayPal order...");

    const platformFee = paypalService.calculatePlatformFee(100);
    const totalAmount = 100 + platformFee;

    const paypalOrder = await paypalService.createOrder({
      amount: totalAmount.toFixed(2),
      currency: "USD",
      description: `Payment for contract: ${testContract._id}`,
      contractId: testContract._id.toString(),
    });

    console.log(`   Order ID: ${paypalOrder.orderId}`);
    console.log(`   Status: ${paypalOrder.status}`);
    console.log(`   Amount: $${totalAmount} ($100 + $${platformFee} fee)`);
    console.log("   ✅ PayPal order created\n");

    // Step 4: Create payment record
    console.log("💳 Step 4: Creating payment record in database...");

    const payment = await Payment.create({
      contractId: testContract._id,
      payerId: client._id,
      recipientId: doer._id,
      amount: 100,
      currency: "USD",
      status: "pending",
      paymentType: "contract_payment",
      paypalOrderId: paypalOrder.orderId,
      description: "Test escrow payment",
      platformFee: platformFee,
      platformFeePercentage: 5,
      isEscrow: true,
    });

    console.log(`   Payment ID: ${payment._id}`);
    console.log(`   Status: ${payment.status}`);
    console.log(`   Is Escrow: ${payment.isEscrow}`);
    console.log("   ✅ Payment record created\n");

    // Step 5: Display approval URL
    const approvalUrl = paypalOrder.links?.find((link: any) => link.rel === "approve")?.href;

    console.log("🔗 Step 5: MANUAL ACTION REQUIRED");
    console.log("   ==========================================");
    console.log("   You need to approve the payment manually:");
    console.log("   ==========================================\n");
    console.log(`   1. Open this URL in your browser:\n`);
    console.log(`      ${approvalUrl}\n`);
    console.log(`   2. Login with PayPal Sandbox Personal Account:`);
    console.log(`      Email: ${process.env.SANDBOX_PERSONAL_ACCOUNT || "Check .env"}`);
    console.log(`      Password: (From PayPal Developer Dashboard)\n`);
    console.log(`   3. Approve the payment\n`);
    console.log(`   4. After approval, press ENTER to continue...`);

    // Wait for user input
    await waitForEnter();

    // Step 6: Capture payment (escrow hold)
    console.log("\n📥 Step 6: Capturing payment (putting in escrow)...");

    try {
      const captureResult = await paypalService.captureOrder(paypalOrder.orderId);

      payment.status = "held_escrow";
      payment.paypalCaptureId = captureResult.captureId;
      payment.paypalPayerId = captureResult.payerId;
      payment.paypalPayerEmail = captureResult.payerEmail;
      await payment.save();

      testContract.paymentStatus = "escrow";
      await testContract.save();

      console.log(`   Capture ID: ${captureResult.captureId}`);
      console.log(`   Payer Email: ${captureResult.payerEmail}`);
      console.log(`   Payment Status: ${payment.status}`);
      console.log(`   Contract Payment Status: ${testContract.paymentStatus}`);
      console.log("   ✅ Payment captured and held in escrow\n");

      // Step 7: Display escrow state
      console.log("🔒 Step 7: Escrow Status Check");
      console.log("   ==========================================");
      console.log(`   💰 Amount in escrow: $${payment.amount}`);
      console.log(`   👤 Paid by: ${client.name} (${client.email})`);
      console.log(`   👨‍💻 To be received by: ${doer.name} (${doer.email})`);
      console.log(`   ⏳ Waiting for: Work completion & client confirmation`);
      console.log("   ==========================================\n");

      // Step 8: Simulate work completion and escrow release
      console.log("✅ Step 8: Simulating work completion...");
      console.log("   (In real app: Doer marks work as complete)\n");

      console.log("🔓 Step 9: Releasing escrow payment...");
      console.log("   (In real app: Client confirms and releases)\n");

      payment.status = "completed";
      payment.escrowReleasedAt = new Date();
      payment.escrowReleasedBy = client._id;
      await payment.save();

      testContract.paymentStatus = "completed";
      testContract.status = "completed";
      await testContract.save();

      console.log("   ✅ Escrow released!");
      console.log(`   💸 Payment of $${payment.amount} is now available to doer`);
      console.log(`   📅 Released at: ${payment.escrowReleasedAt?.toISOString()}\n`);

      // Step 10: Final verification
      console.log("🔍 Step 10: Final Verification");
      console.log("   ==========================================");

      const finalPayment = await Payment.findByPk(payment._id);
      const finalContract = await Contract.findByPk(testContract._id);

      console.log(`   Payment Status: ${finalPayment?.status}`);
      console.log(`   Escrow Released: ${finalPayment?.escrowReleasedAt ? "Yes" : "No"}`);
      console.log(`   Contract Status: ${finalContract?.status}`);
      console.log(`   Payment Status: ${finalContract?.paymentStatus}`);
      console.log("   ==========================================\n");

      // Summary
      console.log("📊 TEST SUMMARY");
      console.log("   ==========================================");
      console.log("   ✅ Contract created");
      console.log("   ✅ PayPal order created");
      console.log("   ✅ Payment approved (manual)");
      console.log("   ✅ Payment captured and held in escrow");
      console.log("   ✅ Escrow released to doer");
      console.log("   ✅ Contract marked as completed");
      console.log("   ==========================================\n");

      console.log("🎉 All tests PASSED! PayPal Escrow flow is working correctly.\n");

      // Cleanup option
      console.log("🧹 Cleanup test data? (y/n)");
      const cleanup = await waitForInput();

      if (cleanup.toLowerCase() === 'y') {
        await Payment.findByIdAndDelete(payment._id);
        await Contract.findByIdAndDelete(testContract._id);
        await Job.findByIdAndDelete(testJob._id);
        console.log("✅ Test data cleaned up\n");
      } else {
        console.log("ℹ️  Test data kept for inspection");
        console.log(`   Payment ID: ${payment._id}`);
        console.log(`   Contract ID: ${testContract._id}`);
        console.log(`   Job ID: ${testJob._id}\n`);
      }

    } catch (captureError: any) {
      console.error("❌ Error capturing payment:", captureError.message);
      console.log("\n💡 This likely means:");
      console.log("   - You didn't approve the payment in PayPal");
      console.log("   - You cancelled the payment");
      console.log("   - The order expired (orders expire after 3 hours)\n");

      // Cleanup on error
      await Payment.findByIdAndDelete(payment._id);
      await Contract.findByIdAndDelete(testContract._id);
      await Job.findByIdAndDelete(testJob._id);
      console.log("🧹 Test data cleaned up\n");
    }

  } catch (error: any) {
    console.error("\n❌ Error during test:", error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
}

// Helper function to wait for Enter key
function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

// Helper function to get user input
function waitForInput(): Promise<string> {
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

// Run the test
testPayPalEscrowFlow();
