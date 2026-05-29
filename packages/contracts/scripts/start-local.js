/**
 * 一键启动本地开发环境
 * 用法: node scripts/start-local.js
 * 功能: 启动 Hardhat 节点 + 部署合约 + 输出 MetaMask 配置
 */
import hre from 'hardhat';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_ACCOUNTS = [
  {
    name: 'Deployer / Account 1',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    balance: '10000 ETH',
  },
  {
    name: 'Account 2',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    balance: '10000 ETH',
  },
];

async function main() {
  console.log('🚀 启动本地开发环境...\n');

  const connection = await hre.network.getOrCreate();
  const ethers = connection.ethers;

  const [deployer] = await ethers.getSigners();
  console.log('📋 部署账户:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 账户余额:', ethers.formatEther(balance), 'ETH');

  console.log('\n📦 部署合约中...');
  const vibecardRegistry = await ethers.getContractFactory('vibecardRegistry');
  const registry = await vibecardRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log('✅ 部署成功！');
  console.log('   合约地址:', address);
  console.log('   网络:', network.name);
  console.log('   Chain ID:', chainId);

  // 更新前端配置
  const webConfigPath = resolve(__dirname, '../../web/src/lib/web3/config.ts');
  let configContent = writeFileSync.readFileSync ? null : null; // placeholder
  try {
    const { readFileSync } = await import('fs');
    configContent = readFileSync(webConfigPath, 'utf-8');
    const regex = new RegExp(`\[${chainId}\]: '0x[0-9a-fA-F]{40}',?`);
    const replacement = `[${chainId}]: '${address}',`;
    if (regex.test(configContent)) {
      configContent = configContent.replace(regex, replacement);
      writeFileSync(webConfigPath, configContent);
      console.log('✅ 前端配置已更新');
    }
  } catch {}

  // 输出配置指南
  console.log('\n' + '='.repeat(60));
  console.log('🎉 本地开发环境已就绪！');
  console.log('='.repeat(60));

  console.log('\n📌 MetaMask 配置步骤:');
  console.log('   1. 打开 MetaMask → 添加网络 → 手动添加');
  console.log('   2. 网络名称: Hardhat Local');
  console.log('   3. RPC URL: http://127.0.0.1:8545');
  console.log('   4. Chain ID: 31337');
  console.log('   5. 货币符号: ETH');

  console.log('\n📌 导入测试账户到 MetaMask:');
  console.log('   1. MetaMask → 账户 → 导入账户');
  console.log('   2. 粘贴私钥: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  console.log('   3. 账户名称: vibecard Deployer');

  console.log('\n📌 本地测试账户列表:');
  TEST_ACCOUNTS.forEach(acc => {
    console.log(`   ${acc.name}`);
    console.log(`     地址: ${acc.address}`);
    console.log(`     私钥: ${acc.privateKey}`);
    console.log(`     余额: ${acc.balance}`);
    console.log();
  });

  console.log('\n📌 合约信息:');
  console.log(`   地址: ${address}`);
  console.log(`   网络: Hardhat Local (Chain ID: ${chainId})`);

  console.log('\n📌 启动前端开发服务器:');
  console.log('   cd packages/web && npm run dev');
  console.log('   打开 http://localhost:3000');
  console.log('   在 MetaMask 中切换到 "Hardhat Local" 网络');

  console.log('\n📌 注意:');
  console.log('   本地网络数据不会持久化，重启节点后合约需要重新部署');
  console.log('   如果需要持久化测试数据，请部署到测试网');

  console.log('\n' + '='.repeat(60));
  console.log('按 Ctrl+C 停止本地节点');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
