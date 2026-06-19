import { expect } from 'chai';
import hre from 'hardhat';

// 验证交易回滚并包含指定错误信息（不依赖 hardhat-chai-matchers）
async function expectRevert(promise, expectedMessage) {
  try {
    const tx = await promise;
    await tx.wait();
    expect.fail('Expected transaction to revert');
  } catch (error) {
    expect(error.message).to.include(expectedMessage);
  }
}

describe('VibeCard Ecosystem', function () {
  let vibePoints, vibeIdentity, vibeSocial;
  let owner, user1, user2, user3;
  let ethers;

  beforeEach(async function () {
    const connection = await hre.network.getOrCreate();
    ethers = connection.ethers;

    [owner, user1, user2, user3] = await ethers.getSigners();

    // 部署合约
    const VibePoints = await ethers.getContractFactory('VibePoints');
    vibePoints = await VibePoints.deploy();
    await vibePoints.waitForDeployment();

    const VibeIdentity = await ethers.getContractFactory('VibeIdentity');
    vibeIdentity = await VibeIdentity.deploy();
    await vibeIdentity.waitForDeployment();

    const VibeSocial = await ethers.getContractFactory('VibeSocial');
    vibeSocial = await VibeSocial.deploy(
      await vibePoints.getAddress(),
      await vibeIdentity.getAddress()
    );
    await vibeSocial.waitForDeployment();

    // 设置权限
    await vibePoints.addOperator(await vibeSocial.getAddress());
  });

  describe('VibePoints', function () {
    it('Should deploy with correct name and symbol', async function () {
      expect(await vibePoints.name()).to.equal('Vibe Points');
      expect(await vibePoints.symbol()).to.equal('POINTS');
      expect(Number(await vibePoints.decimals())).to.equal(18);
    });

    it('Should mint points with cooldown', async function () {
      const amount = ethers.parseEther('10');

      // 第一次铸造成功
      await vibePoints.mint(user1.address, amount, 'test', 60, 0);
      expect(await vibePoints.balanceOf(user1.address)).to.equal(amount);

      // 冷却期内铸造失败
      await expectRevert(
        vibePoints.mint(user1.address, amount, 'test', 60, 0),
        'Cooldown not passed'
      );
    });

    it('Should enforce daily limits', async function () {
      const amount = ethers.parseEther('5');

      // 第一次成功
      await vibePoints.mint(user1.address, amount, 'daily', 0, 2);
      expect(await vibePoints.balanceOf(user1.address)).to.equal(amount);

      // 第二次成功
      await vibePoints.mint(user1.address, amount, 'daily', 0, 2);
      expect(await vibePoints.balanceOf(user1.address)).to.equal(amount * 2n);

      // 第三次失败（超过每日限制）
      await expectRevert(
        vibePoints.mint(user1.address, amount, 'daily', 0, 2),
        'Daily limit reached'
      );
    });

    it('Should burn points correctly', async function () {
      const amount = ethers.parseEther('100');
      await vibePoints.mint(user1.address, amount, 'test', 0, 0);

      const burnAmount = ethers.parseEther('30');
      await vibePoints.burn(user1.address, burnAmount, 'consume');

      expect(await vibePoints.balanceOf(user1.address)).to.equal(amount - burnAmount);
    });

    it('Should record transaction history', async function () {
      const amount = ethers.parseEther('50');
      await vibePoints.mint(user1.address, amount, 'reward', 0, 0);
      await vibePoints.burn(user1.address, ethers.parseEther('10'), 'spend');

      const txs = await vibePoints.getUserTransactions(user1.address);
      expect(txs.length).to.equal(2);
      expect(txs[0].amount).to.be.gt(0); // 正数
      expect(txs[1].amount).to.be.lt(0); // 负数
    });
  });

  describe('VibeIdentity', function () {
    it('Should create identity with DID and SBT', async function () {
      const profileHash = 'QmTest123';
      const [did, tokenId] = await vibeIdentity.connect(user1).createIdentity.staticCall(profileHash);

      await vibeIdentity.connect(user1).createIdentity(profileHash);

      const identity = await vibeIdentity.getIdentity(user1.address);
      expect(identity.exists).to.be.true;
      expect(identity.currentProfileHash).to.equal(profileHash);
      expect(identity.sbtTokenId).to.equal(tokenId);

      // 验证 SBT 所有权
      expect(await vibeIdentity.ownerOf(tokenId)).to.equal(user1.address);
    });

    it('Should prevent duplicate identity creation', async function () {
      await vibeIdentity.connect(user1).createIdentity('QmHash1');

      await expectRevert(
        vibeIdentity.connect(user1).createIdentity('QmHash2'),
        'Identity exists'
      );
    });

    it('Should update profile and record history', async function () {
      await vibeIdentity.connect(user1).createIdentity('QmHash1');

      await vibeIdentity.connect(user1).updateProfile('QmHash2');
      await vibeIdentity.connect(user1).updateProfile('QmHash3');

      const history = await vibeIdentity.getProfileHistory(user1.address);
      expect(history.length).to.equal(3);
      expect(history[0]).to.equal('QmHash1');
      expect(history[1]).to.equal('QmHash2');
      expect(history[2]).to.equal('QmHash3');
    });
  });

  describe('VibeSocial - Profile Creation', function () {
    it('Should create profile and earn points', async function () {
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);

      const balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('50')); // POINTS_CREATE_PROFILE
    });

    it('Should handle referral rewards', async function () {
      // user1 创建名片
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);

      // user2 通过 user1 邀请创建名片
      await vibeSocial.connect(user2).createProfile(user1.address);

      // user1 应该获得邀请奖励
      const user1Balance = await vibePoints.balanceOf(user1.address);
      expect(user1Balance).to.equal(ethers.parseEther('150')); // 50 + 100
    });
  });

  describe('VibeSocial - Daily Signin', function () {
    beforeEach(async function () {
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);
    });

    it('Should earn points on daily signin', async function () {
      await vibeSocial.connect(user1).dailySignin();

      const balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('55')); // 50 + 5
    });

    it('Should enforce 24h cooldown on signin', async function () {
      await vibeSocial.connect(user1).dailySignin();

      await expectRevert(
        vibeSocial.connect(user1).dailySignin(),
        'Cooldown not passed'
      );
    });
  });

  describe('VibeSocial - Follow System', function () {
    beforeEach(async function () {
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);
      await vibeSocial.connect(user2).createProfile(ethers.ZeroAddress);
    });

    it('Should follow user and earn points', async function () {
      await vibeSocial.connect(user1).follow(user2.address);

      expect(await vibeSocial.isFollowing(user1.address, user2.address)).to.be.true;
      expect(Number(await vibeSocial.followingCount(user1.address))).to.equal(1);
      expect(Number(await vibeSocial.followersCount(user2.address))).to.equal(1);

      // 检查积分
      const balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('52')); // 50 + 2
    });

    it('Should unfollow user', async function () {
      await vibeSocial.connect(user1).follow(user2.address);
      await vibeSocial.connect(user1).unfollow(user2.address);

      expect(await vibeSocial.isFollowing(user1.address, user2.address)).to.be.false;
      expect(Number(await vibeSocial.followingCount(user1.address))).to.equal(0);
      expect(Number(await vibeSocial.followersCount(user2.address))).to.equal(0);
    });

    it('Should update reputation on follow', async function () {
      await vibeSocial.connect(user1).follow(user2.address);

      const rep = await vibeSocial.reputationScore(user2.address);
      expect(Number(rep)).to.equal(5); // 1 follower * 5
    });
  });

  describe('VibeSocial - UGC Cards', function () {
    beforeEach(async function () {
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);
      await vibeSocial.connect(user2).createProfile(ethers.ZeroAddress);
    });

    it('Should create card and earn points', async function () {
      const price = ethers.parseEther('20');
      await vibeSocial.connect(user1).createCard(
        'What is your favorite color?',
        'Icebreaker',
        price
      );

      const balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('70')); // 50 + 20
    });

    it('Should use card and distribute points', async function () {
      const price = ethers.parseEther('20');
      await vibeSocial.connect(user1).createCard(
        'What is your dream?',
        'Deep',
        price
      );

      // user2 使用卡牌
      await vibeSocial.connect(user2).useCard(0);

      // user1（创作者）获得 80% = 16 VIBE
      const user1Balance = await vibePoints.balanceOf(user1.address);
      expect(user1Balance).to.equal(ethers.parseEther('86')); // 50 + 20 + 16

      // user2 消费 20，获得 1
      const user2Balance = await vibePoints.balanceOf(user2.address);
      expect(user2Balance).to.equal(ethers.parseEther('31')); // 50 - 20 + 1
    });

    it('Should track card usage count', async function () {
      await vibeSocial.connect(user1).createCard('Question here?', 'Fun', ethers.parseEther('10'));

      await vibeSocial.connect(user2).useCard(0);

      const card = await vibeSocial.getCard(0);
      expect(Number(card.usageCount)).to.equal(1);
    });
  });

  describe('VibeSocial - Activities', function () {
    beforeEach(async function () {
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);
      await vibeSocial.connect(user2).createProfile(ethers.ZeroAddress);
      await vibeSocial.connect(user3).createProfile(ethers.ZeroAddress);
    });

    it('Should create activity and earn points', async function () {
      await vibeSocial.connect(user1).createActivity('Coffee Chat', 'Social', 5);

      const balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('80')); // 50 + 30
    });

    it('Should join activity and earn points', async function () {
      await vibeSocial.connect(user1).createActivity('Hiking', 'Sports', 3);

      await vibeSocial.connect(user2).joinActivity(0);

      const balance = await vibePoints.balanceOf(user2.address);
      expect(balance).to.equal(ethers.parseEther('65')); // 50 + 15
    });

    it('Should rate and settle activity', async function () {
      await vibeSocial.connect(user1).createActivity('Game Night', 'Fun', 3);
      await vibeSocial.connect(user2).joinActivity(0);
      await vibeSocial.connect(user3).joinActivity(0);

      // 评分
      await vibeSocial.connect(user1).rateActivity(0, 5);
      await vibeSocial.connect(user2).rateActivity(0, 4);
      await vibeSocial.connect(user3).rateActivity(0, 5);

      // 结算
      await vibeSocial.connect(user1).settleActivity(0);

      // 平均分 = (5+4+5)/3 = 4.67 ≈ 4，应该发放奖励
      const user1Balance = await vibePoints.balanceOf(user1.address);
      expect(user1Balance).to.equal(ethers.parseEther('100')); // 50 + 30 + 20

      const user2Balance = await vibePoints.balanceOf(user2.address);
      expect(user2Balance).to.equal(ethers.parseEther('85')); // 50 + 15 + 20
    });
  });

  describe('VibeSocial - Reputation System', function () {
    beforeEach(async function () {
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);
    });

    it('Should calculate reputation correctly', async function () {
      await vibeSocial.connect(user2).createProfile(ethers.ZeroAddress);
      await vibeSocial.connect(user3).createProfile(ethers.ZeroAddress);

      // 2 个粉丝
      await vibeSocial.connect(user2).follow(user1.address);
      await vibeSocial.connect(user3).follow(user1.address);

      // 3 次互动
      await vibeSocial.connect(user1).recordInteraction();
      await ethers.provider.send('evm_increaseTime', [11 * 60]); // 11分钟
      await ethers.provider.send('evm_mine', []);
      await vibeSocial.connect(user1).recordInteraction();
      await ethers.provider.send('evm_increaseTime', [11 * 60]);
      await ethers.provider.send('evm_mine', []);
      await vibeSocial.connect(user1).recordInteraction();

      // 1 次活动
      await vibeSocial.connect(user1).createActivity('Event', 'Work', 5);

      // 计算: 2*5 + 3*10 + 1*15 = 10 + 30 + 15 = 55
      const rep = await vibeSocial.reputationScore(user1.address);
      expect(Number(rep)).to.equal(55);

      const tier = await vibeSocial.getReputationTier(user1.address);
      expect(tier).to.equal('Bronze');
    });

    it('Should get correct reputation tier', async function () {
      // user1 的名片已在 beforeEach 中创建
      // 目标：达到 200 分进入 Silver
      // 10 次活动 (150 分) + 5 次互动 (50 分) = 200 分

      // 10 次活动（活动每日上限 10 次）
      for (let i = 0; i < 10; i++) {
        await vibeSocial.connect(user1).createActivity(`Event ${i}`, 'Work', 5);
      }

      // 5 次互动（互动间隔 10 分钟，每日上限 5 次）
      for (let i = 0; i < 5; i++) {
        await vibeSocial.connect(user1).recordInteraction();
        await ethers.provider.send('evm_increaseTime', [11 * 60]);
        await ethers.provider.send('evm_mine', []);
      }

      const rep = await vibeSocial.reputationScore(user1.address);
      expect(Number(rep)).to.equal(200); // 10*15 + 5*10

      const tier = await vibeSocial.getReputationTier(user1.address);
      expect(tier).to.equal('Silver');
    });
  });

  describe('Integration Tests', function () {
    it('Should handle complete user journey', async function () {
      // 1. user1 创建名片
      await vibeSocial.connect(user1).createProfile(ethers.ZeroAddress);
      let balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('50'));

      // 2. 每日签到
      await vibeSocial.connect(user1).dailySignin();
      balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('55'));

      // 3. 创建 UGC 卡牌
      await vibeSocial.connect(user1).createCard('Nice question', 'Fun', ethers.parseEther('15'));
      balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('75'));

      // 4. 发起活动
      await vibeSocial.connect(user1).createActivity('Meetup', 'Social', 10);
      balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('105'));

      // 5. 消费积分：解锁高级模板
      await vibeSocial.connect(user1).unlockPremiumTemplate();
      balance = await vibePoints.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('5'));
    });
  });
});
