/**
 * 一键部署全部云函数到微信云开发
 *
 * 用法：
 *   1. 在 mp.weixin.qq.com → 开发管理 → 开发设置 → 小程序代码上传密钥
 *      下载 .key 文件保存到本地
 *   2. 设置环境变量：
 *        export MP_PRIVATE_KEY=/path/to/your/private.key
 *      （可选）如多个云环境，设置：
 *        export MP_CLOUD_ENV=your-cloud-env-id
 *   3. 在 packages/miniprogram 目录下运行：
 *        node deploy/deploy-cloud.js
 *
 * 依赖：
 *   npm install miniprogram-ci    # 一次性安装
 */

const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

const APPID = 'wxa79d41c8255ff90d';
const PRIVATE_KEY_PATH = process.env.MP_PRIVATE_KEY;

if (!PRIVATE_KEY_PATH || !fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('❌ 未找到小程序代码上传密钥。');
  console.error('   请设置环境变量：');
  console.error('   export MP_PRIVATE_KEY=/path/to/your/private.key');
  console.error('   密钥下载位置：mp.weixin.qq.com → 开发管理 → 开发设置 → 小程序代码上传密钥');
  process.exit(1);
}

const project = new ci.Project({
  appid: APPID,
  type: 'miniProgram',
  projectPath: path.join(__dirname, '..'),
  privateKeyPath: PRIVATE_KEY_PATH,
  ignores: ['node_modules/**/*'],
});

// 全部需要部署的云函数（按依赖顺序：先基础后业务）
const FUNCTIONS = [
  // 基础设施（登录、审核、举报）
  'login',
  'content-check',
  'report',
  // 用户档案
  'user',
  // 核心数据层
  'memory',
  'now',
  'card',
  'requests',
  // AI 层（依赖 memory 和 now）
  'agent',
];

(async () => {
  console.log(`\n🚀 开始部署 ${FUNCTIONS.length} 个云函数到 AppID ${APPID}\n`);

  let success = 0;
  let failed = [];

  for (const name of FUNCTIONS) {
    const fnPath = path.join(__dirname, '..', 'cloudfunctions', name);
    if (!fs.existsSync(fnPath)) {
      console.warn(`⚠️  跳过 ${name}：目录不存在`);
      failed.push({ name, reason: 'directory not found' });
      continue;
    }

    console.log(`\n=== 上传云函数 ${name} ===`);
    try {
      await ci.cloud.deployFunction({
        project,
        name,
        path: fnPath,
        remoteNpmInstall: true,
        force: true,
      });
      console.log(`✅ ${name} 上传成功`);
      success++;
    } catch (err) {
      console.error(`❌ ${name} 上传失败：`, err.message || err);
      failed.push({ name, reason: err.message || String(err) });
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 部署结果：成功 ${success} / 总计 ${FUNCTIONS.length}`);

  if (failed.length > 0) {
    console.log(`\n❌ 失败列表：`);
    failed.forEach((f) => console.log(`   - ${f.name}: ${f.reason}`));
    console.log(`\n💡 常见失败原因：`);
    console.log(`   - 未配置云开发环境 → 在 DevTools 中开通云开发`);
    console.log(`   - 密钥过期 → 重新下载 .key 文件`);
    console.log(`   - 云函数包名重复 → 改一下 package.json 的 name 字段`);
    process.exit(1);
  } else {
    console.log(`\n🎉 全部云函数部署完成！`);
    console.log(`\n下一步：`);
    console.log(`   1. 在云开发控制台 → 云函数 → 给每个函数配置环境变量：`);
    console.log(`      AI_API_BASE / AI_API_KEY / AI_MODEL（仅 agent 函数需要）`);
    console.log(`   2. 按 LAUNCH_KIT.md 第 4 节创建数据库集合和索引`);
    console.log(`   3. 在 DevTools 中编译一次，确保无报错`);
  }
})();
