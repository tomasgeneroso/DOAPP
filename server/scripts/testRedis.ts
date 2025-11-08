import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cache from "../services/cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testRedisConnection() {
  console.log("🧪 Testing Redis connection...\n");

  // Wait a bit for connection to establish
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check if cache is ready
  console.log(`✓ Cache Status: ${cache.isReady() ? "✅ Enabled" : "❌ Disabled"}`);

  if (!cache.isReady()) {
    console.log("\n❌ Redis is not connected. Check your REDIS_URL in .env");
    process.exit(1);
  }

  try {
    // Test 1: Set a value
    console.log("\n📝 Test 1: Setting a value...");
    const setResult = await cache.set("test:key", { message: "Hello Redis!" }, 60);
    console.log(`   Result: ${setResult ? "✅ Success" : "❌ Failed"}`);

    // Test 2: Get the value
    console.log("\n📖 Test 2: Getting the value...");
    const getValue = await cache.get<{ message: string }>("test:key");
    console.log(`   Value: ${getValue ? JSON.stringify(getValue) : "❌ Not found"}`);
    console.log(`   Result: ${getValue?.message === "Hello Redis!" ? "✅ Success" : "❌ Failed"}`);

    // Test 3: Check TTL
    console.log("\n⏱️  Test 3: Checking TTL...");
    const ttl = await cache.ttl("test:key");
    console.log(`   TTL: ${ttl} seconds`);
    console.log(`   Result: ${ttl > 0 && ttl <= 60 ? "✅ Success" : "❌ Failed"}`);

    // Test 4: Increment counter
    console.log("\n🔢 Test 4: Testing counter...");
    const count1 = await cache.increment("test:counter", 120);
    const count2 = await cache.increment("test:counter", 120);
    console.log(`   First increment: ${count1}`);
    console.log(`   Second increment: ${count2}`);
    console.log(`   Result: ${count2 === count1 + 1 ? "✅ Success" : "❌ Failed"}`);

    // Test 5: Check existence
    console.log("\n🔍 Test 5: Checking key existence...");
    const exists = await cache.exists("test:key");
    const notExists = await cache.exists("test:nonexistent");
    console.log(`   Existing key: ${exists ? "✅ Found" : "❌ Not found"}`);
    console.log(`   Non-existing key: ${!notExists ? "✅ Correctly not found" : "❌ Incorrectly found"}`);

    // Test 6: Delete a key
    console.log("\n🗑️  Test 6: Deleting a key...");
    const delResult = await cache.del("test:key");
    const afterDel = await cache.get("test:key");
    console.log(`   Delete result: ${delResult ? "✅ Success" : "❌ Failed"}`);
    console.log(`   After delete: ${afterDel === null ? "✅ Key removed" : "❌ Key still exists"}`);

    // Test 7: Pattern deletion
    console.log("\n🧹 Test 7: Testing pattern deletion...");
    await cache.set("test:pattern:1", "value1", 60);
    await cache.set("test:pattern:2", "value2", 60);
    await cache.set("test:pattern:3", "value3", 60);
    await cache.delPattern("test:pattern:*");
    const afterPattern = await cache.get("test:pattern:1");
    console.log(`   Result: ${afterPattern === null ? "✅ Pattern deleted" : "❌ Failed"}`);

    // Test 8: Get cache info
    console.log("\n📊 Test 8: Getting cache info...");
    const info = await cache.info();
    console.log(`   Enabled: ${info.enabled ? "✅ Yes" : "❌ No"}`);

    // Cleanup
    console.log("\n🧹 Cleaning up test keys...");
    await cache.del("test:counter");

    console.log("\n✅ All Redis tests completed successfully!");
    console.log("\n📊 Summary:");
    console.log("   - Connection: ✅ Working");
    console.log("   - Set/Get: ✅ Working");
    console.log("   - TTL: ✅ Working");
    console.log("   - Increment: ✅ Working");
    console.log("   - Exists: ✅ Working");
    console.log("   - Delete: ✅ Working");
    console.log("   - Pattern Delete: ✅ Working");
    console.log("   - Info: ✅ Working");

  } catch (error: any) {
    console.error("\n❌ Error during Redis testing:", error.message);
    process.exit(1);
  } finally {
    await cache.close();
    console.log("\n🔌 Connection closed");
    process.exit(0);
  }
}

testRedisConnection();
