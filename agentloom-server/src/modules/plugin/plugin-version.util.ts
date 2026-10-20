/**
 * 插件 manifest 版本号比较（semver 2.0 优先级规则）。
 *
 * manifest 在注册时已经过 SDK 的 semver 校验，这里只需要比较：
 * 主/次/修订号按数值比，带预发布标识的版本低于同号正式版，
 * 预发布标识逐段比较（纯数字段按数值、数字段低于字母段、其余按 ASCII），
 * 构建元数据（`+...`）不参与比较。
 */
const SEMVER_PATTERN =
  /^[=v]*(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

type ParsedSemver = {
  core: [bigint, bigint, bigint];
  prerelease: string[];
};

function parseSemver(version: string): ParsedSemver {
  const match = SEMVER_PATTERN.exec(version.trim());

  if (!match) {
    throw new Error(`不是合法的 semver 版本号: ${version}`);
  }

  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    const diff = BigInt(left) - BigInt(right);
    return diff === 0n ? 0 : diff > 0n ? 1 : -1;
  }

  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }

  return left === right ? 0 : left > right ? 1 : -1;
}

/** 返回 1 / 0 / -1，分别表示 left 高于、等于、低于 right。 */
export function comparePluginVersions(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);

  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) {
      return a.core[index] > b.core[index] ? 1 : -1;
    }
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length
      ? 0
      : a.prerelease.length === 0
        ? 1
        : -1;
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length);

  for (let index = 0; index < length; index += 1) {
    const leftId = a.prerelease[index];
    const rightId = b.prerelease[index];

    if (leftId === undefined) return -1;
    if (rightId === undefined) return 1;

    const result = compareIdentifier(leftId, rightId);
    if (result !== 0) return result;
  }

  return 0;
}
