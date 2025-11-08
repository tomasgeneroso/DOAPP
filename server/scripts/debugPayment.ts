/**
 * Debug PayPal Payment - Herramienta de diagnóstico
 *
 * Uso:
 *   npx tsx server/scripts/debugPayment.ts [paymentId o orderId]
 */

import mongoose from "mongoose";
import { config } from "../config/env.js";
import Payment from "../models/Payment.js";
import Contract from "../models/Contract.js";
import paypalService from "../services/paypal.js";

async function debugPayment(identifier: string) {
  try {
    console.log("🔍 ===== PAYMENT DEBUGGING TOOL =====");
    console.log("🔍 Looking for:", identifier);
    console.log("");

    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    console.log("✅ Connected to MongoDB");
    console.log("");

    // Try to find payment by ID or PayPal Order ID
    let payment = null;

    // First try as MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      payment = await Payment.findByPk(identifier);
      if (payment) {
        console.log("✅ Payment found by MongoDB ID");
      }
    }

    // If not found, try as PayPal Order ID
    if (!payment) {
      payment = await Payment.findOne({ paypalOrderId: identifier });
      if (payment) {
        console.log("✅ Payment found by PayPal Order ID");
      }
    }

    if (!payment) {
      console.error("❌ Payment not found in database");
      console.log("");
      console.log("💡 Tips:");
      console.log("  - Check if the identifier is correct");
      console.log("  - Try using the MongoDB _id or PayPal orderId");
      console.log("  - Run: npm run seed:mockup to create test data");
      return;
    }

    console.log("");
    console.log("📄 ===== PAYMENT DETAILS =====");
    console.log("MongoDB ID:", payment._id.toString());
    console.log("Status:", payment.status);
    console.log("Payment Type:", payment.paymentType);
    console.log("Amount:", payment.amount, payment.currency);
    console.log("Platform Fee:", payment.platformFee);
    console.log("Is Escrow:", payment.isEscrow);
    console.log("");

    console.log("👤 ===== PARTIES =====");
    console.log("Payer ID:", payment.payerId);
    console.log("Recipient ID:", payment.recipientId);
    console.log("");

    console.log("💳 ===== PAYPAL DETAILS =====");
    console.log("PayPal Order ID:", payment.paypalOrderId || "N/A");
    console.log("PayPal Capture ID:", payment.paypalCaptureId || "N/A");
    console.log("PayPal Payer ID:", payment.paypalPayerId || "N/A");
    console.log("PayPal Payer Email:", payment.paypalPayerEmail || "N/A");
    console.log("");

    // If we have a PayPal Order ID, try to get order details from PayPal
    if (payment.paypalOrderId) {
      console.log("🔄 Fetching PayPal order details...");
      try {
        const orderDetails = await paypalService.getOrderDetails(payment.paypalOrderId);
        console.log("");
        console.log("🌐 ===== PAYPAL ORDER STATUS =====");
        console.log("PayPal Order Status:", orderDetails.status);
        console.log("Create Time:", orderDetails.create_time);
        console.log("Update Time:", orderDetails.update_time);

        if (orderDetails.purchase_units && orderDetails.purchase_units[0]) {
          const unit = orderDetails.purchase_units[0];
          console.log("Amount:", unit.amount.value, unit.amount.currency_code);
          console.log("Description:", unit.description);

          if (unit.payments) {
            console.log("");
            console.log("💰 ===== PAYPAL CAPTURES =====");
            if (unit.payments.captures && unit.payments.captures.length > 0) {
              unit.payments.captures.forEach((capture: any, index: number) => {
                console.log(`\nCapture ${index + 1}:`);
                console.log("  ID:", capture.id);
                console.log("  Status:", capture.status);
                console.log("  Amount:", capture.amount.value, capture.amount.currency_code);
                console.log("  Create Time:", capture.create_time);
                console.log("  Update Time:", capture.update_time);
              });
            } else {
              console.log("⚠️  No captures found - Payment may not have been captured yet");
            }
          }
        }

        if (orderDetails.payer) {
          console.log("");
          console.log("👤 ===== PAYER INFO FROM PAYPAL =====");
          console.log("Payer ID:", orderDetails.payer.payer_id);
          console.log("Email:", orderDetails.payer.email_address);
          console.log("Name:", orderDetails.payer.name?.given_name, orderDetails.payer.name?.surname);
        }
      } catch (error: any) {
        console.error("❌ Failed to fetch PayPal order details:", error.message);
      }
    }

    // If payment is linked to a contract, show contract details
    if (payment.contractId) {
      console.log("");
      console.log("📋 ===== CONTRACT DETAILS =====");
      const contract = await Contract.findByPk(payment.contractId);
      if (contract) {
        console.log("Contract ID:", contract._id.toString());
        console.log("Contract Status:", contract.status);
        console.log("Payment Status:", contract.paymentStatus);
        console.log("Price:", contract.price);
        console.log("Commission:", contract.commission);
        console.log("Total Price:", contract.totalPrice);
      } else {
        console.log("⚠️  Contract not found");
      }
    }

    console.log("");
    console.log("⏰ ===== TIMESTAMPS =====");
    console.log("Created At:", payment.createdAt);
    console.log("Updated At:", payment.updatedAt);
    if (payment.escrowReleasedAt) {
      console.log("Escrow Released At:", payment.escrowReleasedAt);
    }
    if (payment.refundedAt) {
      console.log("Refunded At:", payment.refundedAt);
    }

    console.log("");
    console.log("🔍 ===== DIAGNOSIS =====");

    // Analyze payment status and provide recommendations
    if (payment.status === "pending" && !payment.paypalCaptureId) {
      console.log("⚠️  Status: Payment is pending and has not been captured");
      console.log("💡 Action: User needs to approve the payment in PayPal");
      console.log("💡 Or: The capture may have failed - check logs above");
    } else if (payment.status === "held_escrow") {
      console.log("✅ Status: Payment captured and held in escrow");
      console.log("💡 Action: Waiting for work completion and confirmation");
    } else if (payment.status === "completed") {
      console.log("✅ Status: Payment completed successfully");
    } else if (payment.status === "processing") {
      console.log("⚠️  Status: Payment is being processed");
      console.log("💡 Action: Wait for PayPal to complete processing");
    } else if (payment.status === "failed") {
      console.log("❌ Status: Payment failed");
      console.log("💡 Action: Check error logs and try again");
    } else if (payment.status === "refunded") {
      console.log("💸 Status: Payment has been refunded");
      console.log("Refund Reason:", payment.refundReason || "N/A");
    }

    console.log("");
    console.log("✅ ===== DEBUGGING COMPLETE =====");

  } catch (error: any) {
    console.error("❌ Error during debugging:", error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 MongoDB connection closed");
  }
}

// Get identifier from command line arguments
const identifier = process.argv[2];

if (!identifier) {
  console.error("❌ Error: Missing payment identifier");
  console.log("");
  console.log("Usage:");
  console.log("  npx tsx server/scripts/debugPayment.ts [paymentId or orderId]");
  console.log("");
  console.log("Examples:");
  console.log("  npx tsx server/scripts/debugPayment.ts 507f1f77bcf86cd799439011");
  console.log("  npx tsx server/scripts/debugPayment.ts 5O190127TN364715T");
  process.exit(1);
}

debugPayment(identifier);
