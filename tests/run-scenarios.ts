/**
 * DOAPP - Executable Test Scenarios
 *
 * Run against a live server:
 * npx tsx tests/run-scenarios.ts
 *
 * Make sure the server is running on port 3001
 */

import fetch from 'node-fetch';
import https from 'https';

// Allow self-signed certificates in development
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Try HTTPS first (if SSL certs exist), fallback to HTTP
const API_BASE = process.env.API_BASE || 'https://localhost:3001/api';
const API_BASE_HTTP = 'http://localhost:3001/api';
let useHttps = true;

interface TestResult {
  scenario: string;
  passed: boolean;
  duration: number;
  details: string;
  status?: number;
  error?: string;
}

const results: TestResult[] = [];

// Test credentials
let clientToken: string = '';
let workerToken: string = '';
let adminToken: string = '';
let testJobId: string = '';
let testProposalId: string = '';

// Helper function to make API calls
async function apiCall(
  method: string,
  endpoint: string,
  token: string,
  body?: any
): Promise<{ status: number; data: any; duration: number }> {
  const start = Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const baseUrl = useHttps ? API_BASE : API_BASE_HTTP;

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    agent: useHttps ? httpsAgent : undefined,
  } as any);

  const duration = Date.now() - start;

  let data;
  try {
    data = await response.json();
  } catch {
    data = { message: 'No JSON response' };
  }

  return { status: response.status, data, duration };
}

// Record test result
function recordResult(
  scenario: string,
  passed: boolean,
  duration: number,
  details: string,
  status?: number,
  error?: string
) {
  results.push({ scenario, passed, duration, details, status, error });
  const icon = passed ? '✅' : '❌';
  const statusStr = status ? ` [${status}]` : '';
  console.log(`${icon} [${duration}ms]${statusStr} ${scenario}: ${details}`);
  if (error) {
    console.log(`   └─ Error: ${error}`);
  }
}

// ============================================
// TEST FUNCTIONS
// ============================================

async function loginUsers() {
  console.log('\n🔐 AUTHENTICATING TEST USERS...\n');

  // Login as client
  const clientLogin = await apiCall('POST', '/auth/login', '', {
    email: 'testclient@doapp.com',
    password: 'Test123!',
  });

  if (clientLogin.status === 200 && clientLogin.data.token) {
    clientToken = clientLogin.data.token;
    recordResult('Login as client', true, clientLogin.duration, 'Client authenticated', clientLogin.status);
  } else {
    // Try to register
    console.log('   Attempting to register test client...');
    const register = await apiCall('POST', '/auth/register', '', {
      name: 'Test Client',
      username: 'testclient_' + Date.now(),
      email: 'testclient@doapp.com',
      password: 'Test123!',
      dni: '12345678',
      termsAccepted: true,
    });
    if (register.status === 201 || register.status === 200) {
      clientToken = register.data.token;
      recordResult('Register client', true, register.duration, 'Client registered and logged in', register.status);
    } else {
      console.log('   Register response:', JSON.stringify(register.data, null, 2));
      recordResult('Register client', false, register.duration, 'Failed to register', register.status, register.data.message || register.data.error || register.data.errors?.[0]?.msg);
    }
  }

  // Login as worker
  const workerLogin = await apiCall('POST', '/auth/login', '', {
    email: 'testworker@doapp.com',
    password: 'Test123!',
  });

  if (workerLogin.status === 200 && workerLogin.data.token) {
    workerToken = workerLogin.data.token;
    recordResult('Login as worker', true, workerLogin.duration, 'Worker authenticated', workerLogin.status);
  } else {
    console.log('   Attempting to register test worker...');
    const register = await apiCall('POST', '/auth/register', '', {
      name: 'Test Worker',
      username: 'testworker_' + Date.now(),
      email: 'testworker@doapp.com',
      password: 'Test123!',
      dni: '87654321',
      termsAccepted: true,
    });
    if (register.status === 201 || register.status === 200) {
      workerToken = register.data.token;
      recordResult('Register worker', true, register.duration, 'Worker registered and logged in', register.status);
    } else {
      console.log('   Register response:', JSON.stringify(register.data, null, 2));
      recordResult('Register worker', false, register.duration, 'Failed to register', register.status, register.data.message || register.data.error || register.data.errors?.[0]?.msg);
    }
  }

  // Login as admin (if exists)
  const adminLogin = await apiCall('POST', '/auth/login', '', {
    email: 'admin@doapp.com',
    password: 'Admin123!',
  });

  if (adminLogin.status === 200 && adminLogin.data.token) {
    adminToken = adminLogin.data.token;
    recordResult('Login as admin', true, adminLogin.duration, 'Admin authenticated', adminLogin.status);
  } else {
    recordResult('Login as admin', false, adminLogin.duration, 'Admin not available (expected in test env)', adminLogin.status);
  }
}

async function testJobCreation() {
  console.log('\n📋 TESTING JOB CREATION...\n');

  if (!clientToken) {
    console.log('⚠️  Skipping - no client token');
    return;
  }

  // Test 1.1: Create job >12hr
  const startDate = new Date(Date.now() + 14 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 16 * 60 * 60 * 1000);

  const job1 = await apiCall('POST', '/jobs', clientToken, {
    title: 'Test Job >12hr - ' + Date.now(),
    summary: 'Test job created by automated test',
    description: 'This is a test job with start date more than 12 hours from now',
    price: 10000,
    category: 'Limpieza',
    location: 'Buenos Aires, Argentina',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const job1Passed = job1.status === 201 || job1.status === 200;
  testJobId = job1.data?.job?.id || job1.data?.id;
  const jobStatus = job1.data?.job?.status || job1.data?.status;

  recordResult(
    '1.1 Create job >12hr',
    job1Passed,
    job1.duration,
    job1Passed ? `Job created: ${testJobId} (status: ${jobStatus})` : 'Failed',
    job1.status,
    !job1Passed ? job1.data?.message : undefined
  );

  // Test 1.1b: Check job status and force to open if needed
  if (testJobId && jobStatus !== 'open') {
    console.log(`   Job status is "${jobStatus}", attempting to publish...`);

    // Try to publish the job (simulate payment completion)
    const publishResult = await apiCall('PUT', `/jobs/${testJobId}/publish`, clientToken, {});

    if (publishResult.status === 200) {
      recordResult(
        '1.1b Publish job',
        true,
        publishResult.duration,
        'Job published successfully',
        publishResult.status
      );
    } else {
      // If publish endpoint doesn't exist, try to update status directly
      const updateResult = await apiCall('PUT', `/jobs/${testJobId}`, clientToken, {
        status: 'open',
        publicationPaid: true,
      });

      recordResult(
        '1.1b Force job to open',
        updateResult.status === 200,
        updateResult.duration,
        updateResult.status === 200 ? 'Job forced to open' : 'Could not open job',
        updateResult.status,
        updateResult.status !== 200 ? updateResult.data?.message : undefined
      );
    }
  }

  // Test 1.2: Create urgent job <12hr
  const urgentStart = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const urgentEnd = new Date(Date.now() + 8 * 60 * 60 * 1000);

  const job2 = await apiCall('POST', '/jobs', clientToken, {
    title: 'Urgent Test Job <12hr - ' + Date.now(),
    summary: 'Urgent job for testing',
    description: 'This is an urgent test job with start date less than 12 hours from now',
    price: 15000,
    category: 'Mudanzas',
    location: 'Córdoba, Argentina',
    startDate: urgentStart.toISOString(),
    endDate: urgentEnd.toISOString(),
    urgency: 'high',
  });

  const job2Passed = job2.status === 201 || job2.status === 200;
  recordResult(
    '1.2 Create job <12hr (urgent)',
    job2Passed,
    job2.duration,
    job2Passed ? `Urgent job created` : 'Failed',
    job2.status,
    !job2Passed ? job2.data?.message : undefined
  );
}

// Store contract ID for later tests
let testContractId: string = '';

async function testProposals() {
  console.log('\n💼 TESTING PROPOSALS...\n');

  if (!workerToken || !testJobId) {
    console.log('⚠️  Skipping - no worker token or job ID');
    return;
  }

  // First, verify job is open
  const jobCheck = await apiCall('GET', `/jobs/${testJobId}`, clientToken);
  const currentStatus = jobCheck.data?.job?.status || jobCheck.data?.status;
  console.log(`   Job ${testJobId} current status: ${currentStatus}`);

  if (currentStatus !== 'open') {
    console.log('   ⚠️  Job is not open for proposals. Trying to check if it can receive proposals anyway...');
  }

  // Test 3.1: Worker submits proposal
  const proposal = await apiCall('POST', '/proposals', workerToken, {
    job: testJobId,
    proposedPrice: 9000,
    coverLetter: 'I am the perfect worker for this job. Automated test proposal.',
    estimatedDuration: 5,
  });

  const propPassed = proposal.status === 201 || proposal.status === 200;
  testProposalId = proposal.data?.proposal?.id || proposal.data?.id;

  if (!propPassed && proposal.data?.message?.includes('no está abierto')) {
    recordResult(
      '3.1 Worker submits proposal',
      false,
      proposal.duration,
      `Job not open for proposals (status: ${currentStatus}). This is expected if user has no free contracts.`,
      proposal.status,
      proposal.data?.message
    );
    return; // Can't continue proposal tests without a proposal
  }

  recordResult(
    '3.1 Worker submits proposal',
    propPassed,
    proposal.duration,
    propPassed ? `Proposal created: ${testProposalId}` : 'Failed',
    proposal.status,
    !propPassed ? proposal.data?.message : undefined
  );

  if (!clientToken || !testProposalId) return;

  // Test 3.2: Client accepts with custom allocation
  const accept = await apiCall('PUT', `/proposals/${testProposalId}/approve`, clientToken, {
    allocatedAmount: 10000,
  });

  const acceptPassed = accept.status === 200;
  testContractId = accept.data?.contract?.id || '';

  recordResult(
    '3.2 Accept with custom allocation',
    acceptPassed,
    accept.duration,
    acceptPassed ? `Proposal accepted, contract created: ${testContractId}` : 'Failed',
    accept.status,
    !acceptPassed ? accept.data?.message : undefined
  );

  // Test 3.3: Verify contract was created
  if (testContractId) {
    const contractCheck = await apiCall('GET', `/contracts/${testContractId}`, clientToken);
    const contractPassed = contractCheck.status === 200;

    recordResult(
      '3.3 Verify contract created',
      contractPassed,
      contractCheck.duration,
      contractPassed ? `Contract verified: ${contractCheck.data?.contract?.status || 'unknown status'}` : 'Failed',
      contractCheck.status,
      !contractPassed ? contractCheck.data?.message : undefined
    );
  }
}

async function testWorkerAllocations() {
  console.log('\n👥 TESTING WORKER ALLOCATIONS...\n');

  if (!clientToken || !testJobId) {
    console.log('⚠️  Skipping - no client token or job ID');
    return;
  }

  // Test 4.2: View worker allocations
  const allocations = await apiCall('GET', `/jobs/${testJobId}/worker-allocations`, clientToken);

  const allocPassed = allocations.status === 200;
  recordResult(
    '4.2 View worker allocations',
    allocPassed,
    allocations.duration,
    allocPassed ? `Found ${allocations.data?.allocations?.length || 0} allocations` : 'Failed',
    allocations.status,
    !allocPassed ? allocations.data?.message : undefined
  );
}

async function testTaskManagement() {
  console.log('\n📝 TESTING TASK MANAGEMENT...\n');

  if (!clientToken || !testJobId) {
    console.log('⚠️  Skipping - no client token or job ID');
    return;
  }

  // Test 5.1: Add tasks - endpoint is /api/jobs/:jobId/tasks
  const task1 = await apiCall('POST', `/jobs/${testJobId}/tasks`, clientToken, {
    title: 'Task 1: Setup',
    description: 'Initial setup task',
  });

  const task1Passed = task1.status === 201 || task1.status === 200;
  const taskId = task1.data?.task?.id || task1.data?.id;
  recordResult(
    '5.1 Add task to job',
    task1Passed,
    task1.duration,
    task1Passed ? `Task created: ${taskId}` : 'Failed',
    task1.status,
    !task1Passed ? task1.data?.message : undefined
  );

  if (!workerToken || !taskId) return;

  // Test 5.2: Worker updates task status - only works if worker is assigned to job
  // First check if there's a contract
  if (!testContractId) {
    console.log('   ⚠️  No contract exists, skipping worker task update (worker not assigned)');
    recordResult(
      '5.2 Worker updates task status',
      false,
      0,
      'Skipped - no contract (worker not assigned to job)',
      0,
      'Worker must be assigned via contract to update tasks'
    );
    return;
  }

  // Test 5.2: Worker updates task status - endpoint is /api/jobs/:jobId/tasks/:taskId
  const updateTask = await apiCall('PUT', `/jobs/${testJobId}/tasks/${taskId}`, workerToken, {
    status: 'in_progress',
  });

  const updatePassed = updateTask.status === 200;
  recordResult(
    '5.2 Worker updates task status',
    updatePassed,
    updateTask.duration,
    updatePassed ? `Task status updated to in_progress` : 'Failed',
    updateTask.status,
    !updatePassed ? updateTask.data?.message : undefined
  );
}

async function testReports() {
  console.log('\n🚨 TESTING REPORTS/TICKETS...\n');

  if (!workerToken) {
    console.log('⚠️  Skipping - no worker token');
    return;
  }

  // Test 6.1: Worker reports client
  const report = await apiCall('POST', '/tickets', workerToken, {
    category: 'report_user',
    subject: 'Test report - automated',
    message: 'This is an automated test report. Please ignore.',
    priority: 'low',
  });

  const reportPassed = report.status === 201 || report.status === 200;
  recordResult(
    '6.1 Worker creates report',
    reportPassed,
    report.duration,
    reportPassed ? `Report/ticket created` : 'Failed',
    report.status,
    !reportPassed ? report.data?.message : undefined
  );
}

async function testExpiredJobsCheck() {
  console.log('\n⏰ TESTING EXPIRED JOBS CHECK...\n');

  if (!clientToken) {
    console.log('⚠️  Skipping - no client token');
    return;
  }

  // Call the check-expired endpoint
  const check = await apiCall('POST', '/jobs/check-expired', clientToken);

  const checkPassed = check.status === 200;
  recordResult(
    'E.1 Check expired jobs',
    checkPassed,
    check.duration,
    checkPassed ? `Processed ${check.data?.expiredJobsProcessed || 0} expired jobs` : 'Failed',
    check.status,
    !checkPassed ? check.data?.message : undefined
  );
}

async function testMultiWorkerJob() {
  console.log('\n👥 TESTING MULTI-WORKER JOB...\n');

  if (!clientToken) {
    console.log('⚠️  Skipping - no client token');
    return;
  }

  // Create multi-worker job
  const startDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 52 * 60 * 60 * 1000);

  const multiJob = await apiCall('POST', '/jobs', clientToken, {
    title: 'Multi-Worker Test Job - ' + Date.now(),
    summary: 'Testing multiple workers',
    description: 'This job needs 3 workers',
    price: 45000,
    maxWorkers: 3,
    category: 'Construcción',
    location: 'Buenos Aires, Argentina',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const multiJobPassed = multiJob.status === 201 || multiJob.status === 200;
  recordResult(
    '4.0 Create multi-worker job',
    multiJobPassed,
    multiJob.duration,
    multiJobPassed ? `Multi-worker job created with maxWorkers=3` : 'Failed',
    multiJob.status,
    !multiJobPassed ? multiJob.data?.message : undefined
  );
}

// ============================================
// MAIN EXECUTION
// ============================================

// Detect which protocol the server is using
async function detectProtocol(): Promise<void> {
  try {
    // Try HTTPS first
    const response = await fetch(`${API_BASE}/health`, {
      agent: httpsAgent,
    } as any);
    if (response.ok) {
      useHttps = true;
      console.log('🔒 Server detected on HTTPS');
      return;
    }
  } catch (e) {
    // HTTPS failed, try HTTP
  }

  try {
    const response = await fetch(`${API_BASE_HTTP}/health`);
    if (response.ok) {
      useHttps = false;
      console.log('🌐 Server detected on HTTP');
      return;
    }
  } catch (e) {
    // HTTP also failed
  }

  throw new Error('Could not connect to server on port 3001. Make sure the server is running.');
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           DOAPP COMPREHENSIVE TEST SCENARIOS                    ║');
  console.log('║                    Running against live server                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\nTime: ${new Date().toISOString()}\n`);

  try {
    // Detect server protocol
    await detectProtocol();
    const baseUrl = useHttps ? API_BASE : API_BASE_HTTP;
    console.log(`API Base: ${baseUrl}\n`);

    await loginUsers();
    await testJobCreation();
    await testProposals();
    await testWorkerAllocations();
    await testTaskManagement();
    await testReports();
    await testExpiredJobsCheck();
    await testMultiWorkerJob();
  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
  }

  // Print summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS SUMMARY                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  const avgTime = totalTime / results.length || 0;

  console.log(`\n📊 Results:`);
  console.log(`   Total tests: ${results.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Pass rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log(`\n⏱️  Timing:`);
  console.log(`   Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log(`   Average per test: ${avgTime.toFixed(0)}ms`);

  if (failed > 0) {
    console.log(`\n❌ FAILED TESTS:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.scenario}`);
      if (r.error) console.log(`     └─ ${r.error}`);
    });
  }

  // Performance warnings
  const slowTests = results.filter(r => r.duration > 2000);
  if (slowTests.length > 0) {
    console.log(`\n⚠️  SLOW TESTS (>2s):`);
    slowTests.forEach(r => {
      console.log(`   - ${r.scenario}: ${r.duration}ms`);
    });
  }

  console.log('\n✨ Test run complete!\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(console.error);
