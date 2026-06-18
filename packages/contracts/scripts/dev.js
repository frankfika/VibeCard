/**
 * 本地一键开发环境
 * 用法: npm run dev （在 packages/contracts 目录下）
 * 功能: 启动 Hardhat 节点 → 部署合约 → 更新前端配置 → 保持节点运行
 */
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_CHAIN_ID = 31337;
const LOCAL_RPC = 'http://127.0.0.1:8545';

function waitForRpc(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (Date.now() - start > timeout) {
        reject(new Error('RPC 启动超时'));
        return;
      }
      try {
        const res = await fetch(url, {
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

function updateWebConfig(address) {
  const webConfigPath = resolve(__dirname, '../../web/src/lib/web3/config.ts');
  let configContent = readFileSync(webConfigPath, 'utf-8');
  const regex = new RegExp(`\\[(?:${LOCAL_CHAIN_ID}|hardhat\\.id)\\]: ['\"]0x[0-9a-fA-F]{40}['\"],?`);
  const replacement = `[hardhat.id]: '${address}',`;
  if (regex.test(configContent)) {
    configContent = configContent.replace(regex, replacement);
    writeFileSync(webConfigPath, configContent);
    console.log('✅ 前端配置已更新:', webConfigPath);
  } else {
    console.warn('⚠️ 未在 web 配置中找到本地网络地址槽位');
  }
}

async function deploy() {
  console.log('📦 部署合约到本地网络...');
  const deploy = spawn('npx', ['hardhat', 'run', 'scripts/deploy.js', '--network', 'localhost'], {
    cwd: resolve(__dirname, '..'),
    stdio: 'pipe',
    shell: true,
  });

  let output = '';
  deploy.stdout.on('data', (data) => {
    output += data.toString();
    process.stdout.write(data);
  });
  deploy.stderr.on('data', (data) => process.stderr.write(data));

  return new Promise((resolve, reject) => {
    deploy.on('close', (code) => {
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
  console.log('🚀 启动本地 Hardhat 节点...\n');

  const node = spawn('npx', ['hardhat', 'node', '--hostname', '127.0.0.1', '--port', '8545'], {
    cwd: resolve(__dirname, '..'),
    stdio: 'pipe',
    shell: true,
  });

  node.stdout.on('data', (data) => process.stdout.write(data));
  node.stderr.on('data', (data) => process.stderr.write(data));

  try {
    await waitForRpc(LOCAL_RPC);
    console.log('✅ 本地节点已就绪\n');

    const address = await deploy();
    updateWebConfig(address);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 本地开发环境已就绪');
    console.log('='.repeat(60));
    console.log(`\n合约地址: ${address}`);
    console.log(`RPC: ${LOCAL_RPC}`);
    console.log(`Chain ID: ${LOCAL_CHAIN_ID}`);
    console.log('\n下一步: cd packages/web && npm run dev');
    console.log('按 Ctrl+C 停止本地节点');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('\n❌ 启动失败:', err.message);
    node.kill();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
