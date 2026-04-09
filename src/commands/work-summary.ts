import { execSync } from "child_process";
import {
  ensureGitRepo,
  type CommitInfo,
} from "../git.js";
import { WORK_SUMMARY_SYSTEM_PROMPT, buildWorkSummaryUserMessage } from "../prompt.js";
import { callLlm, type LlmOptions } from "../llm.js";
import { writeOutputFile } from "../output.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkSummaryOptions extends LlmOptions {
  sinceDate: string; // ISO date string (YYYY-MM-DD)
  save?: boolean;
  output?: string;
}

interface PrInfo {
  number: number;
  title: string;
  author: string;
  url: string;
  state: string;
  createdAt: string;
  headRefName: string;
  baseRefName: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(args: string): string {
  try {
    return execSync(`git ${args}`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim() || err.message;
    throw new Error(`git ${args.split(" ")[0]} failed: ${stderr}`);
  }
}

function gh(args: string): string {
  try {
    return execSync(`gh ${args}`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim() || err.message;
    throw new Error(`gh ${args.split(" ")[0]} failed: ${stderr}`);
  }
}

/**
 * Parse a date string (YYYY-MM-DD) and return an ISO string at 00:00:00 local time.
 */
function parseSinceDate(dateStr: string): Date {
  // Parse as local date at midnight
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(
      `Invalid date format '${dateStr}'. Expected YYYY-MM-DD (e.g. 2026-04-01).`
    );
  }
  const [, year, month, day] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0, 0);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date '${dateStr}'.`);
  }
  return date;
}

/**
 * Get the default branch name (master or main).
 */
function getDefaultBranch(): string {
  try {
    // Check if master exists
    git("rev-parse --verify master");
    return "master";
  } catch {
    try {
      git("rev-parse --verify main");
      return "main";
    } catch {
      throw new Error("Cannot find default branch (master or main).");
    }
  }
}

/**
 * Get commits on a branch since a given date.
 */
function getCommitsSince(branch: string, sinceDate: Date): CommitInfo[] {
  const isoDate = sinceDate.toISOString();
  const format = "%H%n%an%n%ad%n%s%n%b---GIT-GENIE-SEP---";

  let output: string;
  try {
    output = git(
      `log "${branch}" --format="${format}" --no-merges --since="${isoDate}"`
    );
  } catch {
    return [];
  }

  if (!output) return [];

  const entries = output
    .split("---GIT-GENIE-SEP---")
    .map((s) => s.trim())
    .filter(Boolean);

  return entries.map((entry) => {
    const lines = entry.split("\n");
    const hash = lines[0] || "";
    return {
      hash,
      shortHash: hash.substring(0, 6),
      author: lines[1] || "",
      date: lines[2] || "",
      subject: lines[3] || "",
      body: lines.slice(4).join("\n").trim(),
    };
  });
}

/**
 * Check if a local branch exists.
 */
function branchExists(branch: string): boolean {
  try {
    git(`rev-parse --verify "${branch}"`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch open PRs that were created or had activity since the given date.
 */
function getOpenPrsSince(sinceDate: Date): PrInfo[] {
  try {
    const json = gh(
      `pr list --state open --json number,title,author,url,state,createdAt,updatedAt,headRefName,baseRefName,body --limit 100`
    );
    const prs = JSON.parse(json) as Array<{
      number: number;
      title: string;
      author: { login: string };
      url: string;
      state: string;
      createdAt: string;
      updatedAt: string;
      headRefName: string;
      baseRefName: string;
      body: string;
    }>;
    const sinceMs = sinceDate.getTime();
    return prs
      .filter((pr) => {
        const created = new Date(pr.createdAt).getTime();
        const updated = new Date(pr.updatedAt).getTime();
        return created >= sinceMs || updated >= sinceMs;
      })
      .map((pr) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author?.login ?? "unknown",
        url: pr.url,
        state: pr.state,
        createdAt: pr.createdAt,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        body: pr.body || "",
      }));
  } catch {
    // gh not available or not in a GitHub repo
    return [];
  }
}

/**
 * Fetch recently merged PRs in the date window via gh CLI.
 */
function getMergedPrsSince(sinceDate: Date): PrInfo[] {
  try {
    const isoDate = sinceDate.toISOString().split("T")[0];
    const json = gh(
      `pr list --state merged --search "merged:>=${isoDate}" --json number,title,author,url,state,createdAt,headRefName,baseRefName,body --limit 100`
    );
    const prs = JSON.parse(json) as Array<{
      number: number;
      title: string;
      author: { login: string };
      url: string;
      state: string;
      createdAt: string;
      headRefName: string;
      baseRefName: string;
      body: string;
    }>;
    return prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author?.login ?? "unknown",
      url: pr.url,
      state: "MERGED",
      createdAt: pr.createdAt,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      body: pr.body || "",
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function workSummaryCommand(
  options: WorkSummaryOptions
): Promise<void> {
  ensureGitRepo();

  const sinceDate = parseSinceDate(options.sinceDate);
  const defaultBranch = getDefaultBranch();

  if (options.verbose) {
    console.error(`Since: ${sinceDate.toLocaleString()}`);
    console.error(`Default branch: ${defaultBranch}`);
    console.error("");
  }

  // 1. Get commits on default branch since the date
  const masterCommits = getCommitsSince(defaultBranch, sinceDate);

  if (options.verbose) {
    console.error(`Commits on ${defaultBranch}: ${masterCommits.length}`);
  }

  // 2. Check for release branch activity
  let releaseCommits: CommitInfo[] = [];
  if (branchExists("release")) {
    releaseCommits = getCommitsSince("release", sinceDate);
    if (options.verbose) {
      console.error(`Commits on release: ${releaseCommits.length}`);
    }
  }

  // 3. Get open PRs with activity in the window
  const openPrs = getOpenPrsSince(sinceDate);

  if (options.verbose) {
    console.error(`Open PRs: ${openPrs.length}`);
  }

  // 4. Get merged PRs in window (for PR metadata context)
  const mergedPrs = getMergedPrsSince(sinceDate);

  if (options.verbose) {
    console.error(`Merged PRs in window: ${mergedPrs.length}`);
    console.error("");
  }

  if (masterCommits.length === 0 && openPrs.length === 0 && releaseCommits.length === 0 && mergedPrs.length === 0) {
    console.error(`No activity found since ${options.sinceDate}.`);
    process.exit(1);
  }

  // Build header
  const today = new Date().toISOString().split("T")[0];
  const header = `# Work Summary: ${options.sinceDate} → ${today}

> Since ${options.sinceDate} (${masterCommits.length} commits on ${defaultBranch}, ${openPrs.length} open PRs, ${mergedPrs.length} merged PRs)
> Generated by git-genie on ${today}

`;

  // Build user message for LLM
  const userMessage = buildWorkSummaryUserMessage({
    sinceDate: options.sinceDate,
    defaultBranch,
    masterCommits,
    releaseCommits,
    openPrs,
    mergedPrs,
  });

  // Determine output path
  let outputPath: string | null = null;
  if (options.output) {
    outputPath = options.output;
  } else if (options.save) {
    outputPath = `notes/work-summary-${options.sinceDate}-to-${today}.md`;
  }

  // Print header
  process.stdout.write(header);

  // Call LLM
  const result = await callLlm(WORK_SUMMARY_SYSTEM_PROMPT, userMessage, options);

  // Save if requested
  if (outputPath) {
    writeOutputFile(outputPath, header + result.content);
  }
}
