import { expect } from 'chai';
import hre from 'hardhat';

describe('DappCardRegistry', function () {
  let registry;
  let owner;
  let addr1;
  let ethers;

  beforeEach(async function () {
    const connection = await hre.network.getOrCreate();
    ethers = connection.ethers;

    [owner, addr1] = await ethers.getSigners();
    const DappCardRegistryFactory = await ethers.getContractFactory('DappCardRegistry');
    registry = await DappCardRegistryFactory.deploy();
    await registry.waitForDeployment();
  });

  describe('Publish', function () {
    it('Should publish a profile entry', async function () {
      const contentType = 'profile';
      const ipfsHash = 'QmTest123456789';
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes('test content'));

      const tx = await registry.publish(contentType, ipfsHash, contentHash);
      const receipt = await tx.wait();
      expect(receipt.logs.length).to.be.greaterThan(0);
    });

    it('Should update latest profile for profile type', async function () {
      const ipfsHash = 'QmProfile123';
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes('profile data'));

      await registry.publish('profile', ipfsHash, contentHash);

      const latest = await registry.getLatestProfile(owner.address);
      expect(latest).to.equal(ipfsHash);
    });

    it('Should not allow duplicate IPFS hash', async function () {
      const ipfsHash = 'QmDuplicate';
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes('data'));

      await registry.publish('profile', ipfsHash, contentHash);

      try {
        await registry.publish('activity', ipfsHash, contentHash);
        expect.fail('Should have reverted');
      } catch (error) {
        expect(error.message).to.include('Entry already exists');
      }
    });

    it('Should store entry with correct data', async function () {
      const ipfsHash = 'QmTestData';
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await registry.publish('game', ipfsHash, contentHash);

      const entry = await registry.getEntry(ipfsHash);
      expect(entry.contentType).to.equal('game');
      expect(entry.ipfsHash).to.equal(ipfsHash);
      expect(entry.contentHash).to.equal(contentHash);
    });
  });

  describe('Batch Publish', function () {
    it('Should publish multiple entries', async function () {
      const types = ['profile', 'activity'];
      const hashes = ['QmProfile1', 'QmActivity1'];
      const contentHashes = [
        ethers.keccak256(ethers.toUtf8Bytes('profile')),
        ethers.keccak256(ethers.toUtf8Bytes('activity')),
      ];

      await registry.publishBatch(types, hashes, contentHashes);

      const entries = await registry.getUserEntries(owner.address);
      expect(entries.length).to.equal(2);
    });
  });

  describe('Query', function () {
    it('Should return user entries by type', async function () {
      const hashes = ['QmProfile', 'QmActivity1', 'QmActivity2'];
      const contentHashes = hashes.map(h =>
        ethers.keccak256(ethers.toUtf8Bytes(h))
      );

      await registry.publish('profile', hashes[0], contentHashes[0]);
      await registry.publish('activity', hashes[1], contentHashes[1]);
      await registry.publish('activity', hashes[2], contentHashes[2]);

      const activities = await registry.getUserEntriesByType(owner.address, 'activity');
      expect(activities.length).to.equal(2);

      const profiles = await registry.getUserEntriesByType(owner.address, 'profile');
      expect(profiles.length).to.equal(1);
    });

    it('Should return all user entries', async function () {
      await registry.publish('profile', 'Qm1', ethers.keccak256(ethers.toUtf8Bytes('1')));
      await registry.publish('game', 'Qm2', ethers.keccak256(ethers.toUtf8Bytes('2')));

      const entries = await registry.getUserEntries(owner.address);
      expect(entries.length).to.equal(2);
    });
  });
});
