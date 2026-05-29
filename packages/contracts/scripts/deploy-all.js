import { ethers } from 'hardhat';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const NETWORKS = [
  { name: 'sepolia', chainId: 11155111 },
  { name: 'baseSepolia', chainId: 84532 },
  { name: 'arbitrumSepolia', chainId: 421614 },
  { name: 'amoy', chainId: 80002 },
];

async function main() {
  console.log('=== vibecard Multi-Network Deployment ===\n');

  const allDeployments: Record<string, { address: string; chainId: number; timestamp: string }> = {};

  for (const net of NETWORKS) {
    try {
      console.log(`\n--- Deploying to ${net.name} (Chain ID: ${net.chainId}) ---`);

      // Check if network is configured
      const networkConfig = (await import('hardhat')).default.networks[net.name];
      if (!networkConfig) {
        console.log(`Skipping ${net.name}: not configured in hardhat.config.ts`);
        continue;
      }

      const { run } = await import('hardhat');
      await run('compile');

      // This would need to be run with --network flag for each network
      // For now, just log what would happen
      console.log(`To deploy to ${net.name}, run:`);
      console.log(`  npx hardhat run scripts/deploy.ts --network ${net.name}`);
    } catch (error) {
      console.error(`Failed to deploy to ${net.name}:`, error);
    }
  }

  console.log('\n=== Deployment Summary ===');
  console.log('Run individual deployments with:');
  for (const net of NETWORKS) {
    console.log(`  npx hardhat run scripts/deploy.ts --network ${net.name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
