/**
 * 一键部署到测试网并自动更新前端配置
 * 用法: npx hardhat run scripts/deploy-and-update.js --network <网络名>
 * 网络名: baseSepolia | sepolia | arbitrumSepolia | amoy
 * 示例: npx hardhat run scripts/deploy-and-update.js --network baseSepolia
 */
import hre from 'hardhat';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('🚀 开始部署流程...\n');

  const connection = await hre.network.getOrCreate();
  const ethers = connection.ethers;

  const networkName = connection.networkName;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log('🌐 当前网络:', networkName);
  console.log('🔗 Chain ID:', chainId);

  const [deployer] = await ethers.getSigners();
  console.log('📋 部署账户:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 账户余额:', ethers.formatEther(balance), 'ETH');

  if (balance === 0n) {
    console.error('\n❌ 账户余额为零，无法部署！');
    console.error('请先领取测试币:');
    console.error('  Base Sepolia: https://www.coinbase.com/faucets/base-sepolia-faucet');
    console.error('  Sepolia: https://sepoliafaucet.com/');
    console.error('  Arbitrum Sepolia: https://faucet.quicknode.com/arbitrum/sepolia');
    console.error('  Polygon Amoy: https://faucet.polygon.technology/');
    process.exit(1);
  }

  console.log('\n📦 部署合约中...');
  const DappCardRegistry = await ethers.getContractFactory('DappCardRegistry');
  const registry = await DappCardRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();

  console.log('✅ 部署成功！');
  console.log('   合约地址:', address);
  console.log('   网络:', networkName);
  console.log('   Chain ID:', chainId);

  // 自动更新前端配置
  console.log('\n📝 正在更新前端配置...');
  const webConfigPath = resolve(__dirname, '../../web/src/lib/web3/config.ts');

  try {
    let configContent = readFileSync(webConfigPath, 'utf-8');

    // 查找并替换对应 chainId 的合约地址
    const regex = new RegExp(`\\[${chainId}\\]: '0x[0-9a-fA-F]{40}',?`);
    const replacement = `[${chainId}]: '${address}',`;

    if (regex.test(configContent)) {
      configContent = configContent.replace(regex, replacement);
      writeFileSync(webConfigPath, configContent);
      console.log('✅ 前端配置已更新:', webConfigPath);
    } else {
      // 如果没有找到，追加到 CONTRACT_ADDRESS 对象中
      const contractAddressRegex = /export const CONTRACT_ADDRESS: Record<number, `0x\${string}`> = \{/;
      configContent = configContent.replace(
        contractAddressRegex,
        `export const CONTRACT_ADDRESS: Record<number, \`0x\${string}\`> = {\n  [${chainId}]: '${address}',`
      );
      writeFileSync(webConfigPath, configContent);
      console.log('✅ 前端配置已追加新地址');
    }
  } catch (err) {
    console.error('⚠️ 更新前端配置失败:', err.message);
    console.log(`   请手动将 [${chainId}]: '${address}' 添加到 CONTRACT_ADDRESS 中`);
  }

  // 自动更新小程序端配置
  console.log('\n📝 正在更新小程序端配置...');
  const mpWeb3Path = resolve(__dirname, '../../miniprogram/miniprogram/utils/web3.js');

  try {
    let mpContent = readFileSync(mpWeb3Path, 'utf-8');
    const regex = new RegExp(`(${chainId}): '0x[0-9a-fA-F]{40}',?`);
    const replacement = `${chainId}: '${address}',`;

    if (regex.test(mpContent)) {
      mpContent = mpContent.replace(regex, replacement);
      writeFileSync(mpWeb3Path, mpContent);
      console.log('✅ 小程序端配置已更新');
    } else {
      console.log('⚠️ 未找到对应 chainId 的配置，请手动更新');
    }
  } catch (err) {
    console.error('⚠️ 更新小程序端配置失败:', err.message);
  }

  // 保存部署信息
  const deploymentInfo = {
    contract: 'DappCardRegistry',
    address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    network: networkName,
    chainId,
  };
  console.log('\n📄 部署信息:', JSON.stringify(deploymentInfo, null, 2));

  console.log('\n🎉 全部完成！下一步:');
  console.log('   1. cd packages/web && npm run build');
  console.log('   2. 配置 Pinata JWT (VITE_PINATA_JWT=xxx)');
  console.log('   3. 重新构建并部署前端');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
