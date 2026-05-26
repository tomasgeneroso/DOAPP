import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Kill all processes by name (node.exe, tsx.exe, etc.)
 */
async function killProcessesByName(processNames: string[]): Promise<void> {
  const currentPid = process.pid.toString();
  const allPids = new Set<string>();

  for (const processName of processNames) {
    try {
      const { stdout } = await execPromise(`tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`);

      if (!stdout || stdout.trim() === '') continue;

      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const match = line.match(/"[^"]+","(\d+)"/);
        if (match && match[1] !== currentPid) {
          allPids.add(match[1]);
        }
      }
    } catch (error: any) {
      // Process not found, continue
    }
  }

  if (allPids.size === 0) {
    console.log('✅ No hay procesos adicionales de desarrollo');
    return;
  }

  console.log(`📋 Encontrados ${allPids.size} procesos de desarrollo`);

  // Kill all processes with children, aggressively
  for (const pid of allPids) {
    try {
      // First attempt: normal taskkill with tree
      await execPromise(`cmd /c "taskkill /F /PID ${pid} /T 2>nul" 2>&1 || exit 0`);
      console.log(`✅ Proceso ${pid} terminado`);
    } catch (error1) {
      try {
        // Second attempt: more aggressive with cmd wrapper
        await execPromise(`cmd /c "taskkill /F /PID ${pid} /T 2>nul" 2>&1 || exit 0`);
        console.log(`✅ Proceso ${pid} terminado (2do intento)`);
      } catch (error2) {
        // Process might already be dead
      }
    }
  }

  // Wait for processes to finish
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Kill all Node.js and related development processes
 */
async function killAllNodeProcesses(): Promise<void> {
  try {
    console.log('🔍 Buscando procesos de desarrollo (Node.js, TSX, Nodemon)...');

    await killProcessesByName([
      'node.exe',
      'tsx.exe',
      'nodemon.exe',
      'vite.exe',
      'npm.exe'
    ]);

  } catch (error: any) {
    if (error.message && !error.message.includes('INFO: No tasks')) {
      console.log('⚠️  Error buscando procesos:', error.message);
    }
  }
}

/**
 * Kill process using a specific port on Windows
 */
async function killPort(port: number): Promise<void> {
  try {
    console.log(`🔍 Buscando proceso en puerto ${port}...`);

    // Find PID using the port (try multiple times)
    let stdout = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await execPromise(`netstat -ano | findstr :${port}`);
        stdout = result.stdout;
        if (stdout) break;
      } catch {
        // Port might be free
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!stdout || !stdout.trim()) {
      console.log(`✅ Puerto ${port} está libre`);
      return;
    }

    // Extract PID from netstat output
    const lines = stdout.trim().split('\n');
    const pids = new Set<string>();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(Number(pid))) {
        pids.add(pid);
      }
    }

    if (pids.size === 0) {
      console.log(`✅ Puerto ${port} está libre`);
      return;
    }

    console.log(`📋 Encontrados ${pids.size} procesos en puerto ${port}: ${Array.from(pids).join(', ')}`);

    // Kill all processes aggressively (multiple attempts)
    for (const pid of pids) {
      let killed = false;

      // Attempt 1: Normal force kill with tree
      try {
        await execPromise(`cmd /c "taskkill /F /PID ${pid} /T 2>nul" 2>&1 || exit 0`);
        killed = true;
        console.log(`✅ Proceso ${pid} terminado (intento 1)`);
      } catch {}

      // Attempt 2: With cmd wrapper (all redirection inside cmd /c to avoid bash creating a 'nul' file)
      if (!killed) {
        try {
          await execPromise(`cmd /c "taskkill /F /PID ${pid} /T 2>nul"`);
          killed = true;
          console.log(`✅ Proceso ${pid} terminado (intento 2)`);
        } catch {}
      }

      // Attempt 3: Using WMIC (Windows Management Instrumentation)
      if (!killed) {
        try {
          await execPromise(`cmd /c "wmic process where ProcessId=${pid} delete 2>nul"`);
          killed = true;
          console.log(`✅ Proceso ${pid} terminado (intento 3 - WMIC)`);
        } catch {}
      }

      if (!killed) {
        console.log(`⚠️  Proceso ${pid} resistió todos los intentos de cierre`);
      }
    }

    // Wait for processes to finish
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Verify port is actually free now (multiple checks)
    let portFree = false;
    for (let check = 0; check < 3; check++) {
      try {
        const { stdout: checkStdout } = await execPromise(`netstat -ano | findstr :${port}`);
        if (!checkStdout || !checkStdout.trim()) {
          portFree = true;
          break;
        }
      } catch {
        portFree = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!portFree) {
      console.log(`⚠️  Puerto ${port} aún está ocupado después de múltiples intentos`);
      console.log(`🔄 Ejecutando limpieza ULTRA-AGRESIVA...`);

      // Nuclear option: kill ALL development processes
      await killAllNodeProcesses();

      // Final wait and check
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const { stdout: finalCheck } = await execPromise(`netstat -ano | findstr :${port}`);
        if (finalCheck && finalCheck.trim()) {
          console.log(`❌ Puerto ${port} SIGUE OCUPADO - Se requiere:`);
          console.log(`   1. Ejecutar como Administrador`);
          console.log(`   2. O reiniciar el sistema`);
          console.log(`   3. O usar: npx kill-port ${port}`);
        } else {
          console.log(`✅ Puerto ${port} liberado después de limpieza ultra-agresiva`);
        }
      } catch {
        console.log(`✅ Puerto ${port} liberado después de limpieza ultra-agresiva`);
      }
    } else {
      console.log(`✅ Puerto ${port} liberado correctamente`);
    }

  } catch (error) {
    // If netstat fails, the port is probably free
    console.log(`✅ Puerto ${port} está libre`);
  }
}

/**
 * Kill multiple ports
 */
async function killPorts(ports: number[]): Promise<void> {
  console.log('🧹 Limpiando puertos...\n');

  for (const port of ports) {
    await killPort(port);
  }

  console.log('\n✅ Limpieza de puertos completada');
}

/**
 * Comprehensive cleanup: kill ports AND all Node.js processes
 */
async function killAll(): Promise<void> {
  console.log('🧹🧹🧹 LIMPIEZA COMPLETA 🧹🧹🧹\n');

  // First, kill specific ports
  console.log('📍 PASO 1: Liberando puertos específicos\n');
  await killPorts([5000, 5173]);

  console.log('\n📍 PASO 2: Cerrando todos los procesos Node.js\n');
  await killAllNodeProcesses();

  console.log('\n✅✅✅ LIMPIEZA COMPLETA FINALIZADA ✅✅✅');
  console.log('💡 Tip: Espera 2-3 segundos antes de iniciar el servidor nuevamente\n');
}

// If run directly
const isMainModule = process.argv[1]?.includes('killPort');

if (isMainModule) {
  const args = process.argv.slice(2);

  // Check for --all flag
  if (args.includes('--all') || args.includes('-a')) {
    killAll().catch(console.error);
  } else {
    const ports = args.map(Number).filter(n => !isNaN(n));

    if (ports.length === 0) {
      // Default: kill ports AND all Node processes
      killAll().catch(console.error);
    } else {
      // Only kill specific ports
      killPorts(ports).catch(console.error);
    }
  }
}

export { killPort, killPorts, killAllNodeProcesses, killAll };
