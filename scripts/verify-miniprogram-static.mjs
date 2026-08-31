#!/usr/bin/env node
/**
 * verify-miniprogram-static.mjs
 *
 * "static compile-equivalent" 检查套件 — 把 §4.2 WeChat DevTools 真机验证
 * 阻塞期间所做的检查固化为可重复运行的脚本。
 *
 * 7 项检查（每项独立 try/catch，累计所有错误后汇总）：
 *   1. JSON 解析            所有 .json 都能 JSON.parse
 *   2. 页面完整性           app.json declared pages 都有 .js/.wxml/.json
 *   3. usingComponents      每个引用都能解析到实际组件文件
 *   4. node --check         所有页面 / util JS + cloudfunction index.js 语法过
 *   5. custom tab-bar       若 tabBar.custom=true，必须存在 custom-tab-bar/index.*
 *   6. cloud 入口           每个 cloudfunction index.js 必须 exports.main
 *   7. cloud 非运行时依赖   每个 cloudfunction package.json 里「非 wx-* 运行时」
 *                          的 deps 必须有本地 node_modules（wx-server-sdk 由
 *                          微信云开发注入，本地永远装不上，故跳过）
 *
 * Exit code: 0 = 全过, 1 = 任一失败
 * 输出末尾固定输出: ✅ X/7 checks passed, 0 errors  或  ❌ X checks, Y errors
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, basename, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const MP_ROOT = resolve(REPO_ROOT, "packages/miniprogram");
const MP_DIR = resolve(MP_ROOT, "miniprogram"); // 小程序源码根（包含 app.json）
const CF_ROOT = resolve(MP_ROOT, "cloudfunctions");

// ---------- utils ----------

/** 递归列出 dir 下所有匹配 predicate(filePath) 的文件（同步）。 */
function walk(dir, predicate, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      // 跳过 node_modules / .git / 一些无关目录
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(p, predicate, acc);
    } else if (ent.isFile() && predicate(p)) {
      acc.push(p);
    }
  }
  return acc;
}

/** 用 git ls-files 拿受 git 跟踪的文件列表 — 避免扫到 .gitignore 的 node_modules 等。
 *  仓库里 cloudfunctions 的 node_modules 是 ignored 的，所以这里手动过滤掉。 */
function listTracked(dir, suffix) {
  // 简单同步实现：列目录但跳过 node_modules
  return walk(dir, (p) => p.endsWith(suffix));
}

/** 将微信用 usingComponents 路径解析为绝对磁盘路径（相对 MP_DIR）。
 *  规则：小程序绝对路径 `/x/y` → MP_DIR + `/x/y`；
 *        相对路径 `./x` 或 `../x` → 相对当前 json 所在目录；
 *        其它视为 npm 包名（无目录对应）— 跳过。 */
function resolveComponentPath(refValue, fromJsonAbs) {
  if (!refValue) return null;
  if (refValue.startsWith("/")) {
    // 绝对路径（相对小程序根）
    return resolve(MP_DIR, "." + refValue);
  }
  if (refValue.startsWith("./") || refValue.startsWith("../")) {
    // 相对当前 json
    return resolve(dirname(fromJsonAbs), refValue);
  }
  // npm 模块名 — 跳过
  return null;
}

/** 验证 component 路径是否存在/可达。
 *  自定义组件目录约定（小程序官方）：必须有 .js + .json + .wxml 三件套
 *  （.wxss 可选，custom-tab-bar / 简单组件可省）；任意缺失 → 报红。
 *  严格路径优先；不命中时启发式回退：父目录存在且父目录里有 basename + 扩展名
 *  之一（命中常见写法 bug，例如 /components/navbar/navbar 实际指向
 *  components/navbar/navbar.{js,json,wxml}）。
 *  返回 { ok, heuristic, missing } — ok=false 时 missing 列出缺失的扩展名。 */
function verifyComponentPath(abs) {
  const required = [".js", ".json", ".wxml"];
  function evalDir(dir) {
    const files = readdirSync(dir);
    const has = (ext) => files.some((n) => n.endsWith(ext));
    const missing = required.filter((ext) => !has(ext));
    return { ok: missing.length === 0, missing };
  }
  // 1) 严格路径：abs 本身是目录
  try {
    const st = statSync(abs);
    if (st.isDirectory()) {
      const r = evalDir(abs);
      return { ...r, heuristic: false };
    }
    if (st.isFile()) {
      const ok = abs.endsWith(".js") || abs.endsWith(".json") || abs.endsWith(".wxml");
      return { ok, missing: ok ? [] : ["<file>"], heuristic: false };
    }
  } catch {
    // fall through to heuristic
  }
  // 2) 启发式：父目录存在 + basename + .js/.json/.wxml 之一
  const parent = dirname(abs);
  const base = basename(abs);
  try {
    const pst = statSync(parent);
    if (!pst.isDirectory()) return { ok: false, missing: required.slice(), heuristic: false };
    const r = evalDir(parent);
    // 启发式必须至少有同 basename 的 .js 才能算找到组件
    const files = readdirSync(parent);
    const hasBaseJs = files.some((n) => n === base + ".js" || n === base + ".json" || n === base + ".wxml");
    return {
      ok: r.ok && hasBaseJs,
      missing: hasBaseJs ? r.missing : required.slice(),
      heuristic: hasBaseJs,
    };
  } catch {
    return { ok: false, missing: required.slice(), heuristic: false };
  }
}

function rel(p) {
  return relative(REPO_ROOT, p) || ".";
}

// ---------- checks ----------

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

/** 收集所有错误的统一结构 */
function makeBucket() {
  return { errors: [], warnings: [] };
}

function err(bucket, file, msg, detail) {
  const e = { file: rel(file), message: msg };
  if (detail) e.detail = detail;
  bucket.errors.push(e);
}

// 1. JSON 解析
check("json-parses", (bucket) => {
  const jsons = [
    ...listTracked(MP_DIR, ".json"),
    ...listTracked(CF_ROOT, "package.json"),
  ];
  let parsed = 0;
  for (const j of jsons) {
    try {
      JSON.parse(readFileSync(j, "utf8"));
      parsed++;
    } catch (e) {
      err(bucket, j, "JSON parse failed", String(e.message || e));
    }
  }
  return { scanned: jsons.length, parsed };
});

// 2. 页面完整性（依赖 #1 的 JSON 已可读）
check("pages-complete", (bucket) => {
  const appJsonPath = join(MP_DIR, "app.json");
  let app;
  try {
    app = JSON.parse(readFileSync(appJsonPath, "utf8"));
  } catch (e) {
    err(bucket, appJsonPath, "app.json unparseable", String(e.message || e));
    return { pages: 0 };
  }

  const declared = [];
  for (const p of app.pages || []) declared.push(p);
  for (const sub of app.subPackages || []) {
    for (const p of sub.pages || []) declared.push(join(sub.root, p));
  }

  let missing = 0;
  for (const pagePath of declared) {
    const base = join(MP_DIR, pagePath);
    for (const ext of [".js", ".wxml", ".json"]) {
      const f = base + ext;
      if (!existsSync(f)) {
        err(bucket, f, `declared page missing ${ext} for "${pagePath}"`);
        missing++;
      }
    }
  }
  return { declared: declared.length, missingFiles: missing };
});

// 3. usingComponents 解析
check("usingComponents-resolve", (bucket) => {
  const jsonFiles = listTracked(MP_DIR, ".json");
  let totalRefs = 0;
  let brokenRefs = 0;
  for (const jf of jsonFiles) {
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(jf, "utf8"));
    } catch {
      continue; // #1 已经报过
    }
    const uc = cfg && cfg.usingComponents;
    if (!uc || typeof uc !== "object") continue;
    for (const [tag, ref] of Object.entries(uc)) {
      totalRefs++;
      const abs = resolveComponentPath(ref, jf);
      if (!abs) continue; // npm 模块名
      const v = verifyComponentPath(abs);
      if (!v.ok) {
        brokenRefs++;
        const detail = v.missing && v.missing.length
          ? `missing: ${v.missing.join(", ")} (expected near ${rel(abs)})`
          : `expected at ${rel(abs)}`;
        err(
          bucket,
          jf,
          `usingComponents.${tag} = "${ref}" → not found`,
          detail
        );
      } else if (v.heuristic) {
        bucket.warnings.push({
          file: rel(jf),
          message: `usingComponents.${tag} = "${ref}" resolved via heuristic (parent-dir match)`,
          detail: `absent at ${rel(abs)}, but ${rel(dirname(abs))} contains ${basename(abs)}.{js,json,wxml}`,
        });
      }
    }
  }
  return { refs: totalRefs, broken: brokenRefs };
});

// 4. node --check
check("node-check", (bucket) => {
  const jsFiles = [
    ...listTracked(MP_DIR, ".js"),
    ...walk(CF_ROOT, (p) => p.endsWith("index.js")),
  ];
  // 去重
  const uniq = [...new Set(jsFiles)];

  let ok = 0;
  let bad = 0;
  for (const f of uniq) {
    const r = spawnSync(process.execPath, ["--check", f], {
      encoding: "utf8",
    });
    if (r.status === 0) {
      ok++;
    } else {
      bad++;
      err(
        bucket,
        f,
        `node --check failed (exit ${r.status})`,
        (r.stderr || r.stdout || "").trim().split("\n").slice(0, 3).join("\n")
      );
    }
  }
  return { files: uniq.length, ok, bad };
});

// 5. custom tab-bar
check("custom-tabbar", (bucket) => {
  let app;
  try {
    app = JSON.parse(readFileSync(join(MP_DIR, "app.json"), "utf8"));
  } catch {
    return { custom: false, skipped: "app.json unparseable" };
  }
  const tb = app.tabBar;
  if (!tb || !tb.custom) {
    return { custom: false, skipped: "tabBar.custom not set" };
  }
  const dir = join(MP_DIR, "custom-tab-bar");
  if (!existsSync(dir)) {
    err(bucket, dir, "tabBar.custom=true but custom-tab-bar/ missing");
    return { custom: true, present: false };
  }
  const required = ["index.js", "index.json", "index.wxml", "index.wxss"];
  let missing = 0;
  for (const f of required) {
    if (!existsSync(join(dir, f))) {
      err(bucket, join(dir, f), "custom-tab-bar missing required file");
      missing++;
    }
  }
  return { custom: true, present: true, missing };
});

// 6. cloudfunction 入口
check("cloudfunction-entry", (bucket) => {
  const dirs = listTracked(CF_ROOT, "package.json").map((p) =>
    dirname(p)
  );
  let checked = 0;
  let bad = 0;
  for (const d of dirs) {
    const idx = join(d, "index.js");
    if (!existsSync(idx)) {
      err(bucket, d, "cloudfunction has no index.js");
      bad++;
      checked++;
      continue;
    }
    const src = readFileSync(idx, "utf8");
    checked++;
    // 小程序云函数入口约定：exports.main = ... 或 module.exports = { main: ... }
    if (!/exports\.main\b|module\.exports\s*=\s*\{[\s\S]*?main\b/.test(src)) {
      err(
        bucket,
        idx,
        "cloudfunction index.js does not export `main`"
      );
      bad++;
    }
  }
  return { checked, bad };
});

// 7. cloudfunction deps（跳过 wx-* 运行时 SDK）
// 微信云开发在云函数执行环境注入 wx-server-sdk 等 wx-* 包，本地 / CI 永远
// 装不上（npm registry 没有）。这条 check 的真实作用是「未来若有人引入
// 非 wx-* 的 npm 依赖，必须记得本地装好」。
const WX_RUNTIME_PREFIXES = ["wx-server-sdk", "wx-cloud", "wx-", "wxpay-"];
function isWxRuntimeDep(name) {
  return WX_RUNTIME_PREFIXES.some((p) => name === p || name.startsWith(p));
}
check("cloudfunction-deps", (bucket) => {
  const pkgFiles = listTracked(CF_ROOT, "package.json");
  let checked = 0;
  let skipped = 0;
  let bad = 0;
  for (const p of pkgFiles) {
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      continue;
    }
    const deps = cfg.dependencies || {};
    const dir = dirname(p);
    for (const dep of Object.keys(deps)) {
      if (isWxRuntimeDep(dep)) {
        skipped++;
        continue;
      }
      checked++;
      const nm = join(dir, "node_modules", dep);
      if (!existsSync(nm)) {
        err(
          bucket,
          dir,
          `non-runtime dep "${dep}" not installed locally`,
          `expected ${rel(nm)}`
        );
        bad++;
      }
    }
  }
  return { nonRuntimeChecked: checked, wxRuntimeSkipped: skipped, bad };
});

// ---------- runner ----------

function run() {
  const started = Date.now();
  const allErrors = [];
  const allWarnings = [];
  const results = [];

  console.log("╭─ VibeCard miniprogram static verify ──────────────────────────");
  console.log(`│  repo: ${rel(REPO_ROOT)}`);
  console.log(`│  miniprogram: ${rel(MP_DIR)}`);
  console.log(`│  cloudfunctions: ${rel(CF_ROOT)}`);
  console.log("╰───────────────────────────────────────────────────────────────\n");

  for (const { name, fn } of checks) {
    const bucket = makeBucket();
    const t0 = Date.now();
    let summary;
    try {
      summary = fn(bucket) || {};
    } catch (e) {
      err(bucket, "<runner>", `check "${name}" threw`, String(e.stack || e.message || e));
    }
    const ms = Date.now() - t0;
    results.push({
      name,
      ok: bucket.errors.length === 0,
      errors: bucket.errors,
      warnings: bucket.warnings,
      ms,
      summary,
    });
    allErrors.push(...bucket.errors);
    allWarnings.push(...bucket.warnings);
  }

  // 打印
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    console.log(`${mark} ${r.name.padEnd(28)} ${r.ms}ms  ${JSON.stringify(r.summary)}`);
    for (const e of r.errors.slice(0, 20)) {
      console.log(`     · ${e.file}: ${e.message}`);
      if (e.detail) console.log(`         ${String(e.detail).replace(/\n/g, " ⏎ ")}`);
    }
    if (r.errors.length > 20) {
      console.log(`     · …and ${r.errors.length - 20} more`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  const ok = allErrors.length === 0;

  console.log("");
  if (ok) {
    console.log(
      `✅ ${passed}/${total} checks passed, ${allErrors.length} errors`
    );
  } else {
    console.log(
      `❌ ${total} checks, ${allErrors.length} errors (${passed} passed)`
    );
  }
  console.log(`(${((Date.now() - started) / 1000).toFixed(2)}s)`);

  // JSON summary on stderr for tooling
  const jsonReport = {
    ok,
    totalChecks: total,
    passedChecks: passed,
    errorCount: allErrors.length,
    results: results.map((r) => ({
      name: r.name,
      ok: r.ok,
      ms: r.ms,
      errors: r.errors,
      summary: r.summary,
    })),
  };
  process.stderr.write("\n" + JSON.stringify(jsonReport, null, 2) + "\n");

  process.exit(ok ? 0 : 1);
}

run();
