import hre from 'hardhat';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WEB_CONFIG_PATH = resolve(__dirname, '../../web/src/lib/web3/config.ts');
const WIDGET_CONFIG_PATH = resolve(__dirname, '../../web/public/widget-config.json');

async function main() {
  const connection = await hre.network.getOrCreate();
  const ethers = connection.ethers;

  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with the account:', deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'ETH');

  if (balance === 0n) {
    console.warn('WARNING: Account has zero balance. Deployment may fail without test ETH.');
  }

  const DappCardRegistry = await ethers.getContractFactory('DappCardRegistry');
  const registry = await DappCardRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log('DappCardRegistry deployed to:', address);
  console.log('Network:', network.name);
  console.log('Chain ID:', chainId);

  const deploymentInfo = {
    contract: 'DappCardRegistry',
    address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    network: network.name,
    chainId,
  };

  const deploymentsDir = resolve(__dirname, '../deployments');
  if (!existsSync(deploymentsDir)) {
    mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save timestamped history
  const historyFilename = `deployment-${network.name}-${Date.now()}.json`;
  writeFileSync(
    resolve(deploymentsDir, historyFilename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  // Save canonical per-network file
  const canonicalFilename = `${network.name}.json`;
  writeFileSync(
    resolve(deploymentsDir, canonicalFilename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`Deployment history saved to deployments/${historyFilename}`);
  console.log(`Canonical deployment saved to deployments/${canonicalFilename}`);

  // Try to update web config automatically
  if (existsSync(WEB_CONFIG_PATH)) {
    try {
      let config = readFileSync(WEB_CONFIG_PATH, 'utf8');
      const pattern = new RegExp(`\\[${chainId}\\]:\\s*'0x[0]{40}'`);
      if (pattern.test(config)) {
        config = config.replace(pattern, `[${chainId}]: '${address}'`);
        writeFileSync(WEB_CONFIG_PATH, config);
        console.log(`\n✅ Auto-updated CONTRACT_ADDRESS for chain ${chainId} in web config.`);
      } else {
        console.log(`\n⚠️ Could not auto-update web config (address already set or chain not found).`);
        console.log(`   Add this line to packages/web/src/lib/web3/config.ts CONTRACT_ADDRESS:`);
        console.log(`   [${chainId}]: '${address}',`);
      }
    } catch (err) {
      console.warn('Failed to auto-update web config:', err.message);
    }
  } else {
    console.log(`\n=== NEXT STEPS ===`);
    console.log(`1. Update CONTRACT_ADDRESS in packages/web/src/lib/web3/config.ts`);
    console.log(`   [${chainId}]: '${address}',`);
    console.log('2. Run npm run build to rebuild the web app');
  }

  // Try to update widget config automatically
  if (existsSync(WIDGET_CONFIG_PATH)) {
    try {
      const widgetConfig = JSON.parse(readFileSync(WIDGET_CONFIG_PATH, 'utf8'));
      const key = String(chainId);
      if (widgetConfig.chains?.[key] && widgetConfig.chains[key].contractAddress === '0x0000000000000000000000000000000000000000') {
        widgetConfig.chains[key].contractAddress = address;
        writeFileSync(WIDGET_CONFIG_PATH, JSON.stringify(widgetConfig, null, 2) + '\n');
        console.log(`✅ Auto-updated widget-config.json for chain ${chainId}.`);
      } else {
        console.log(`⚠️ Could not auto-update widget-config.json (address already set or chain not found).`);
      }
    } catch (err) {
      console.warn('Failed to auto-update widget config:', err.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
