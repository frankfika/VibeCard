#!/usr/bin/env node
/**
 * E2E 专用 Hardhat 启动脚本
 * 1. 启动 Hardhat 节点
 * 2. 等待 RPC 就绪
 * 3. 部署合约
 * 4. 保持运行
 */
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTRACTS_DIR = resolve(__dirname, '../../contracts');
const RPC_URL = 'http://127.0.0.1:8545';

function waitForRpc(timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (Date.now() - start > timeout) {
        reject(new Error('RPC 启动超时'));
        return;
      }
      try {
        const res = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' }),
        });
        if (res.ok) {
          resolve(true);
          return;
        }
      } catch {}
      setTimeout(check, 300);
    };
    check();
  });
}

async function deploy() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['hardhat', 'run', 'scripts/deploy.js', '--network', 'localhost'], {
      cwd: CONTRACTS_DIR,
      stdio: 'pipe',
      shell: true,
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    proc.stderr.on('data', (data) => process.stderr.write(data));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`部署失败，退出码 ${code}`));
        return;
      }
      const match = output.match(/deployed to:\s+(0x[0-9a-fA-F]{40})/);
      if (match) {
        resolve(match[1]);
      } else {
        reject(new Error('无法从部署输出中解析合约地址'));
      }
    });
  });
}

async function main() {
  const node = spawn('npx', ['hardhat', 'node', '--hostname', '127.0.0.1', '--port', '8545'], {
    cwd: CONTRACTS_DIR,
    stdio: 'inherit',
    shell: true,
  });

  try {
    await waitForRpc();
    console.log('Hardhat node ready, deploying contract...');
    const address = await deploy();
    console.log(`Contract deployed at ${address}`);
    console.log('E2E Hardhat environment ready');
  } catch (err) {
    console.error(err.message);
    node.kill();
    process.exit(1);
  }

  process.on('SIGINT', () => node.kill());
  process.on('SIGTERM', () => node.kill());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
