import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_OUTPUT_PATH = resolve("release-notes.md");
const CATEGORY_ORDER = Object.freeze(["features", "fixes", "refactors", "maintenance"]);
const CATEGORY_LABELS = Object.freeze({
  features: "新功能",
  fixes: "问题修复",
  refactors: "重构与性能",
  maintenance: "维护与其他变更",
});
const COMMIT_TYPE_TO_CATEGORY = Object.freeze({
  feat: "features",
  fix: "fixes",
  perf: "refactors",
  refactor: "refactors",
  build: "maintenance",
  chore: "maintenance",
  ci: "maintenance",
  docs: "maintenance",
  revert: "maintenance",
  style: "maintenance",
  test: "maintenance",
});

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`不支持的位置参数：${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`缺少参数值：--${key}`);
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function readRequiredOption(value, label) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error(`缺少必填参数：${label}`);
  }
  return normalizedValue;
}

function resolveOptions() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  return {
    outputPath: resolve(cliArgs.output ?? process.env.RELEASE_NOTES_OUTPUT ?? DEFAULT_OUTPUT_PATH),
    repository: readRequiredOption(cliArgs.repo ?? process.env.GITHUB_REPOSITORY, "repo / GITHUB_REPOSITORY"),
    tag: readRequiredOption(cliArgs.tag ?? process.env.RELEASE_TAG, "tag / RELEASE_TAG"),
    sha: readRequiredOption(cliArgs.sha ?? process.env.RELEASE_SHA, "sha / RELEASE_SHA"),
  };
}

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  }).trim();
}

function tryRunGit(args) {
  try {
    return runGit(args);
  } catch {
    return null;
  }
}

function findPreviousTag(currentSha) {
  return tryRunGit(["describe", "--tags", "--abbrev=0", `${currentSha}^`]);
}

function buildCommitRange(previousTag, currentSha) {
  return previousTag ? `${previousTag}..${currentSha}` : currentSha;
}

function readCommits(previousTag, currentSha) {
  const range = buildCommitRange(previousTag, currentSha);
  const output = runGit(["log", "--no-merges", "--reverse", "--pretty=format:%H%x09%h%x09%s", range]);
  if (!output) {
    throw new Error(`在范围 ${range} 内没有找到可发布的提交。`);
  }

  return output.split("\n").map((line) => {
    const [sha, shortSha, subject] = line.split("\t");
    return {
      sha,
      shortSha,
      subject,
      summary: normalizeCommitSubject(subject),
      category: categorizeCommit(subject),
    };
  });
}

function normalizeCommitSubject(subject) {
  const conventionalCommitMatch = /^(?<type>[a-z]+)(?:\([^)]+\))?!?:\s*(?<summary>.+)$/i.exec(subject);
  return conventionalCommitMatch?.groups?.summary?.trim() || subject.trim();
}

function categorizeCommit(subject) {
  const conventionalCommitMatch = /^(?<type>[a-z]+)(?:\([^)]+\))?!?:/.exec(subject);
  const type = conventionalCommitMatch?.groups?.type?.toLowerCase();
  return COMMIT_TYPE_TO_CATEGORY[type] ?? "maintenance";
}

function groupCommitsByCategory(commits) {
  return commits.reduce(
    (groups, commit) => ({
      ...groups,
      [commit.category]: [...groups[commit.category], commit],
    }),
    Object.freeze({
      features: [],
      fixes: [],
      refactors: [],
      maintenance: [],
    }),
  );
}

function formatCommitLine(commit, repository) {
  return `- ${commit.summary} ([\`${commit.shortSha}\`](https://github.com/${repository}/commit/${commit.sha}))`;
}

function formatCategorySections(groups, repository) {
  return CATEGORY_ORDER.flatMap((category) => {
    const commits = groups[category];
    if (commits.length === 0) {
      return [];
    }

    const lines = commits.map((commit) => formatCommitLine(commit, repository));
    return [`## ${CATEGORY_LABELS[category]}`, "", ...lines, ""];
  });
}

function buildComparisonSection(previousTag, tag, repository) {
  if (!previousTag) {
    return [
      "## 完整变更范围",
      "",
      "这是首次基于当前仓库历史自动生成的发布说明，暂无上一版本可供 compare。",
      "",
    ];
  }

  return [
    "## 完整变更范围",
    "",
    `- Compare: [${previousTag}...${tag}](https://github.com/${repository}/compare/${previousTag}...${tag})`,
    "",
  ];
}

function buildMarkdown(options, previousTag, commits) {
  const headerLines = [
    "# 更新日志 / Changelog",
    "",
    "## 发布信息",
    "",
    `- 当前版本：\`${options.tag}\``,
    `- 发布提交：\`${commits.at(-1)?.shortSha ?? options.sha.slice(0, 7)}\``,
    previousTag ? `- 对比基线：\`${previousTag}\`` : "- 对比基线：首次发布",
    "",
  ];
  const categoryLines = formatCategorySections(groupCommitsByCategory(commits), options.repository);
  const comparisonLines = buildComparisonSection(previousTag, options.tag, options.repository);

  return [...headerLines, ...categoryLines, ...comparisonLines].join("\n");
}

function main() {
  const options = resolveOptions();
  const previousTag = findPreviousTag(options.sha);
  const commits = readCommits(previousTag, options.sha);
  const markdown = buildMarkdown(options, previousTag, commits);

  writeFileSync(options.outputPath, markdown, "utf8");
  console.log(`Wrote ${options.outputPath}`);
}

main();
