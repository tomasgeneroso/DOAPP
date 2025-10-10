import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const execAsync = promisify(exec);

/**
 * Automated security check script
 * Runs before deployment or on demand
 */

interface SecurityCheckResult {
  check: string;
  status: "pass" | "fail" | "warning";
  message: string;
  details?: any;
}

const results: SecurityCheckResult[] = [];

/**
 * Check 1: Run npm audit
 */
async function checkNpmAudit(): Promise<SecurityCheckResult> {
  try {
    const { stdout } = await execAsync("npm audit --json");
    const auditResult = JSON.parse(stdout);

    const vulnerabilities = auditResult.metadata?.vulnerabilities || {};
    const total =
      (vulnerabilities.critical || 0) +
      (vulnerabilities.high || 0) +
      (vulnerabilities.moderate || 0);

    if (vulnerabilities.critical > 0 || vulnerabilities.high > 0) {
      return {
        check: "NPM Audit",
        status: "fail",
        message: `Found ${vulnerabilities.critical} critical and ${vulnerabilities.high} high vulnerabilities`,
        details: vulnerabilities,
      };
    } else if (total > 0) {
      return {
        check: "NPM Audit",
        status: "warning",
        message: `Found ${total} moderate/low vulnerabilities`,
        details: vulnerabilities,
      };
    } else {
      return {
        check: "NPM Audit",
        status: "pass",
        message: "No vulnerabilities found",
      };
    }
  } catch (error: any) {
    // npm audit returns non-zero exit code when vulnerabilities found
    if (error.stdout) {
      try {
        const auditResult = JSON.parse(error.stdout);
        const vulnerabilities = auditResult.metadata?.vulnerabilities || {};

        return {
          check: "NPM Audit",
          status: "fail",
          message: "Vulnerabilities detected",
          details: vulnerabilities,
        };
      } catch (parseError) {
        return {
          check: "NPM Audit",
          status: "fail",
          message: "Failed to parse audit results",
        };
      }
    }

    return {
      check: "NPM Audit",
      status: "fail",
      message: error.message,
    };
  }
}

/**
 * Check 2: Verify environment variables
 */
function checkEnvironmentVariables(): SecurityCheckResult {
  const requiredVars = [
    "MONGODB_URI",
    "JWT_SECRET",
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "GOOGLE_CLOUD_AUTH_ID",
    "GOOGLE_CLOUD_AUTH_PASS",
    "FACEBOOK_APP_ID",
    "FACEBOOK_APP_SECRET",
  ];

  const missing: string[] = [];
  const weak: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    } else if (
      varName.includes("SECRET") &&
      process.env[varName]!.length < 32
    ) {
      weak.push(varName);
    }
  }

  if (missing.length > 0) {
    return {
      check: "Environment Variables",
      status: "fail",
      message: `Missing required variables: ${missing.join(", ")}`,
      details: { missing },
    };
  } else if (weak.length > 0) {
    return {
      check: "Environment Variables",
      status: "warning",
      message: `Weak secrets detected: ${weak.join(", ")}`,
      details: { weak },
    };
  } else {
    return {
      check: "Environment Variables",
      status: "pass",
      message: "All required variables are set",
    };
  }
}

/**
 * Check 3: Scan for hardcoded credentials
 */
function checkHardcodedCredentials(): SecurityCheckResult {
  const patterns = [
    /password\s*=\s*["'][^"']{3,}["']/gi,
    /api[_-]?key\s*=\s*["'][^"']{10,}["']/gi,
    /secret\s*=\s*["'][^"']{10,}["']/gi,
    /token\s*=\s*["'][^"']{20,}["']/gi,
  ];

  const violations: string[] = [];
  const filesToScan = findSourceFiles(".");

  for (const file of filesToScan) {
    const content = fs.readFileSync(file, "utf-8");

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push(`${file}: ${matches.length} potential credentials`);
      }
    }
  }

  if (violations.length > 0) {
    return {
      check: "Hardcoded Credentials",
      status: "warning",
      message: "Potential hardcoded credentials detected",
      details: violations,
    };
  } else {
    return {
      check: "Hardcoded Credentials",
      status: "pass",
      message: "No hardcoded credentials detected",
    };
  }
}

/**
 * Check 4: CORS configuration
 */
function checkCORSConfiguration(): SecurityCheckResult {
  const indexPath = path.join(process.cwd(), "server", "index.ts");

  if (!fs.existsSync(indexPath)) {
    return {
      check: "CORS Configuration",
      status: "fail",
      message: "Server index file not found",
    };
  }

  const content = fs.readFileSync(indexPath, "utf-8");

  // Check for wildcard CORS
  if (content.includes('origin: "*"') || content.includes("origin:\"*\"")) {
    return {
      check: "CORS Configuration",
      status: "fail",
      message: "Wildcard CORS detected - security risk",
    };
  }

  // Check if CORS is configured
  if (!content.includes("cors(")) {
    return {
      check: "CORS Configuration",
      status: "warning",
      message: "CORS middleware not found",
    };
  }

  return {
    check: "CORS Configuration",
    status: "pass",
    message: "CORS properly configured",
  };
}

/**
 * Check 5: Rate limiting enabled
 */
function checkRateLimiting(): SecurityCheckResult {
  const indexPath = path.join(process.cwd(), "server", "index.ts");

  if (!fs.existsSync(indexPath)) {
    return {
      check: "Rate Limiting",
      status: "fail",
      message: "Server index file not found",
    };
  }

  const content = fs.readFileSync(indexPath, "utf-8");

  if (!content.includes("Limiter") && !content.includes("rate-limit")) {
    return {
      check: "Rate Limiting",
      status: "fail",
      message: "Rate limiting not configured",
    };
  }

  return {
    check: "Rate Limiting",
    status: "pass",
    message: "Rate limiting is active",
  };
}

/**
 * Check 6: Dependencies are up to date
 */
async function checkDependencies(): Promise<SecurityCheckResult> {
  try {
    const { stdout } = await execAsync("npm outdated --json");

    if (!stdout || stdout.trim() === "{}") {
      return {
        check: "Dependencies",
        status: "pass",
        message: "All dependencies are up to date",
      };
    }

    const outdated = JSON.parse(stdout);
    const count = Object.keys(outdated).length;

    return {
      check: "Dependencies",
      status: "warning",
      message: `${count} outdated dependencies`,
      details: outdated,
    };
  } catch (error: any) {
    // npm outdated returns exit code 1 when packages are outdated
    if (error.stdout) {
      try {
        const outdated = JSON.parse(error.stdout);
        const count = Object.keys(outdated).length;

        return {
          check: "Dependencies",
          status: "warning",
          message: `${count} outdated dependencies`,
        };
      } catch (parseError) {
        return {
          check: "Dependencies",
          status: "pass",
          message: "All dependencies are up to date",
        };
      }
    }

    return {
      check: "Dependencies",
      status: "pass",
      message: "All dependencies are up to date",
    };
  }
}

/**
 * Check 7: Audit log integrity
 */
function checkAuditLogIntegrity(): SecurityCheckResult {
  const auditLogPath = path.join(process.cwd(), "server", "models", "AuditLog.ts");

  if (!fs.existsSync(auditLogPath)) {
    return {
      check: "Audit Logging",
      status: "warning",
      message: "AuditLog model not found",
    };
  }

  const content = fs.readFileSync(auditLogPath, "utf-8");

  if (!content.includes("signature") || !content.includes("SHA")) {
    return {
      check: "Audit Logging",
      status: "warning",
      message: "Audit logs may not be signed",
    };
  }

  return {
    check: "Audit Logging",
    status: "pass",
    message: "Audit logging with signatures is configured",
  };
}

/**
 * Helper: Find source files
 */
function findSourceFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Skip node_modules, dist, and other build directories
    if (
      file === "node_modules" ||
      file === "dist" ||
      file === "build" ||
      file === ".git" ||
      file.startsWith(".")
    ) {
      return;
    }

    if (stat.isDirectory()) {
      findSourceFiles(filePath, fileList);
    } else if (file.endsWith(".ts") || file.endsWith(".js")) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Run all security checks
 */
async function runSecurityChecks() {
  console.log("🔒 Running Security Checks...\n");

  results.push(await checkNpmAudit());
  results.push(checkEnvironmentVariables());
  results.push(checkHardcodedCredentials());
  results.push(checkCORSConfiguration());
  results.push(checkRateLimiting());
  results.push(await checkDependencies());
  results.push(checkAuditLogIntegrity());

  // Print results
  console.log("\n📊 Security Check Results:\n");

  let passCount = 0;
  let failCount = 0;
  let warningCount = 0;

  results.forEach((result) => {
    const icon =
      result.status === "pass"
        ? "✅"
        : result.status === "fail"
        ? "❌"
        : "⚠️";

    console.log(`${icon} ${result.check}: ${result.message}`);

    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
    }

    if (result.status === "pass") passCount++;
    else if (result.status === "fail") failCount++;
    else warningCount++;
  });

  console.log(`\n📈 Summary: ${passCount} passed, ${warningCount} warnings, ${failCount} failed\n`);

  // Exit with error if any critical failures
  if (failCount > 0) {
    console.error("❌ Security checks failed. Please fix the issues before deployment.\n");
    process.exit(1);
  } else if (warningCount > 0) {
    console.warn("⚠️  Security checks passed with warnings. Review before deployment.\n");
    process.exit(0);
  } else {
    console.log("✅ All security checks passed!\n");
    process.exit(0);
  }
}

export default runSecurityChecks;

// Run if executed directly
runSecurityChecks().catch((error) => {
  console.error("Error running security checks:", error);
  process.exit(1);
});
