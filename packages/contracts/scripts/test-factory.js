import hre from 'hardhat';

async function main() {
  const connection = await hre.network.getOrCreate();
  const ethers = connection.ethers;
  
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);
  
  const DappCardRegistry = await ethers.getContractFactory('DappCardRegistry');
  console.log('Factory created');
  
  const registry = await DappCardRegistry.deploy();
  console.log('Deploy tx sent');
  
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log('Deployed to:', address);
}

main().catch(console.error);
