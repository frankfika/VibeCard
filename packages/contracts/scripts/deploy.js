import hre from 'hardhat';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const connection = await hre.network.getOrCreate();
  const ethers = connection.ethers;

  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with the account:', deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', balance.toString());

  if (balance === 0n) {
    console.warn('WARNING: Account has zero balance. Deployment may fail without test ETH.');
  }

  const DappCardRegistry = await ethers.getContractFactory('DappCardRegistry');
  const registry = await DappCardRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const network = await ethers.provider.getNetwork();
  console.log('DappCardRegistry deployed to:', address);
  console.log('Network:', network.name);
  console.log('Chain ID:', network.chainId.toString());

  const deploymentInfo = {
    contract: 'DappCardRegistry',
    address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    network: network.name,
    chainId: Number(network.chainId),
  };

  const deploymentsDir = resolve(__dirname, '../deployments');
  if (!existsSync(deploymentsDir)) {
    mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `deployment-${network.name}-${Date.now()}.json`;
  writeFileSync(
    resolve(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`Deployment info saved to deployments/${filename}`);
  console.log('\n=== NEXT STEPS ===');
  console.log(`1. Update CONTRACT_ADDRESS in packages/web/src/lib/web3/config.ts`);
  console.log(`   [${Number(network.chainId)}]: '${address}',`);
  console.log('2. Run npm run build to rebuild the web app');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
