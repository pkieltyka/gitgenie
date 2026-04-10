import type { CommitInfo, CommitWithDiff } from "./git.js";

// ---------------------------------------------------------------------------
// Release Notes prompts
// ---------------------------------------------------------------------------

export const RELEASE_NOTES_SYSTEM_PROMPT = `You are a technical writer producing public-facing release notes.
Write clean, concise markdown release notes that describe what changed
from the user's perspective.

Guidelines:
- Do NOT include a title or header — one will be added automatically
- Focus on user-visible changes: features, fixes, improvements, breaking changes
- Group changes into logical sections using ## headings (e.g. ## Features, ## Fixes, ## Improvements, ## Breaking Changes)
- Only include sections that have content — omit empty sections
- Omit internal refactors, CI changes, and dependency bumps unless they affect users
- Be specific but concise — one line per change
- Use present tense ("Add", "Fix", "Remove", not "Added", "Fixed", "Removed")
- Do not invent changes that aren't evidenced in the data provided
- Start directly with the first section heading`;

export function buildReleaseNotesUserMessage(
  fromRef: string,
  toRef: string,
  commits: CommitInfo[]
): string {
  const commitLog = commits
    .map((c) => {
      const body = c.body ? `\n${c.body}` : "";
      return `- ${c.shortHash} ${c.subject} (${c.author}, ${c.date})${body}`;
    })
    .join("\n");

  return `Here are the git commits from ${fromRef} to ${toRef} (${commits.length} commits):

${commitLog}

Write release notes summarizing these changes.`;
}

export function buildDeepReleaseNotesUserMessage(
  fromRef: string,
  toRef: string,
  commits: CommitWithDiff[]
): string {
  const sections = commits
    .map((c) => {
      const body = c.body ? `\n${c.body}` : "";
      const truncationNote = c.truncated
        ? "\n\n> Note: This diff was truncated due to size limits."
        : "";

      return `## Commit ${c.shortHash}: ${c.subject}
Author: ${c.author}
Date: ${c.date}
${body}
### Changes:
\`\`\`
${c.stat}
\`\`\`

\`\`\`diff
${c.patch}
\`\`\`
${truncationNote}`;
    })
    .join("\n\n---\n\n");

  return `Here are the git commits from ${fromRef} to ${toRef}, with source diffs (${commits.length} commits):

${sections}

Write release notes based on the commit messages and the actual code changes.
Prioritize what you can see in the source diffs over what commit messages claim.`;
}

// ---------------------------------------------------------------------------
// Code Review prompts
// ---------------------------------------------------------------------------

export const CODE_REVIEW_SYSTEM_PROMPT = `You are a senior software engineer performing a thorough code review.
Analyze the provided git diffs and produce a detailed review in markdown.

Review criteria:
- Bugs and logic errors
- Security vulnerabilities (injection, auth issues, data exposure, etc.)
- Performance concerns (unnecessary allocations, N+1 queries, blocking calls, etc.)
- Error handling gaps (uncaught exceptions, missing validation, etc.)
- Code clarity and maintainability
- Suggestions for improvement

Format:
- Do NOT include a title or header — one will be added automatically
- Start with a brief summary of what the changes do overall
- Group findings by severity using ## headings: ## Critical, ## Warnings, ## Suggestions
- Only include severity sections that have findings — omit empty sections
- For each finding, reference the specific file and code involved
- Be constructive — explain why something is an issue and how to fix it
- If the code looks good, say so. Don't invent problems.`;

export const CODE_REVIEW_CHUNK_SYSTEM_PROMPT = `You are a senior software engineer performing a thorough code review.
Analyze the provided git diffs for this SUBSET of files and produce a detailed review in markdown.
Note: This is a partial review — other files in the changeset will be reviewed separately.

Review criteria:
- Bugs and logic errors
- Security vulnerabilities (injection, auth issues, data exposure, etc.)
- Performance concerns (unnecessary allocations, N+1 queries, blocking calls, etc.)
- Error handling gaps (uncaught exceptions, missing validation, etc.)
- Code clarity and maintainability
- Suggestions for improvement

Format:
- Do NOT include a title or header
- Start with a brief summary of what the changes in these files do
- Group findings by severity using ## headings: ## Critical, ## Warnings, ## Suggestions
- Only include severity sections that have findings — omit empty sections
- For each finding, reference the specific file and code involved
- Be constructive — explain why something is an issue and how to fix it
- If the code looks good, say so. Don't invent problems.`;

export const CODE_REVIEW_MERGE_SYSTEM_PROMPT = `You are a senior software engineer merging multiple partial code review reports into a single cohesive review.
You will receive individual reviews of different file groups from the same changeset.

Your job:
- Combine all findings into a single unified review
- Deduplicate any repeated observations
- Look for cross-file issues that individual reviews may have missed (e.g. an interface change in one file that breaks usage in another)
- Maintain the severity groupings: ## Critical, ## Warnings, ## Suggestions

Format:
- Do NOT include a title or header — one will be added automatically
- Start with a brief overall summary of the entire changeset
- Group findings by severity using ## headings: ## Critical, ## Warnings, ## Suggestions
- Only include severity sections that have findings — omit empty sections
- For each finding, reference the specific file and code involved
- If the code looks good overall, say so. Don't invent problems.`;

export function buildChunkedReviewMergeMessage(
  partialReviews: { chunkIndex: number; fileList: string[]; review: string }[]
): string {
  const sections = partialReviews
    .map((r) => {
      const files = r.fileList.map((f) => `  - ${f}`).join("\n");
      return `## Partial Review ${r.chunkIndex + 1} (files:\n${files}\n)\n\n${r.review}`;
    })
    .join("\n\n---\n\n");

  return `Merge the following ${partialReviews.length} partial code reviews into a single cohesive review:

${sections}

Produce a single unified code review.`;
}

// ---------------------------------------------------------------------------
// Work Summary prompts
// ---------------------------------------------------------------------------

export const WORK_SUMMARY_SYSTEM_PROMPT = `You are a technical writer producing a work summary report.
Summarize the engineering work completed and in-progress for the given time period.

Output format — use exactly this markdown structure:

## Done
- Bullet points of completed work (merged to default branch)
- Group related commits into a single bullet when they're part of the same effort
- Reference PR numbers when available (e.g. "Add OpenRouter support (#2)")

## In Progress
- Bullet points of open PRs / work in progress
- Include the PR number and a brief description

## Releases
- Only include this section if there is release branch activity
- Note the releases that were performed

Guidelines:
- Do NOT include a title or header — one will be added automatically
- Start directly with "## Done"
- Be concise — one line per item
- Use present tense for completed work ("Add", "Fix", "Remove")
- Do NOT include author names — focus only on what was done
- Do not invent work that isn't evidenced in the data provided
- If a section has no items, omit it entirely`;

export interface WorkSummaryData {
  sinceDate: string;
  defaultBranch: string;
  masterCommits: CommitInfo[];
  releaseCommits: CommitInfo[];
  openPrs: Array<{
    number: number;
    title: string;
    author: string;
    url: string;
    state: string;
    createdAt: string;
    headRefName: string;
    baseRefName: string;
    body: string;
  }>;
  mergedPrs: Array<{
    number: number;
    title: string;
    author: string;
    url: string;
    state: string;
    createdAt: string;
    headRefName: string;
    baseRefName: string;
    body: string;
  }>;
}

export function buildWorkSummaryUserMessage(data: WorkSummaryData): string {
  const sections: string[] = [];

  sections.push(`Work summary from ${data.sinceDate} to today.`);

  // Master commits
  if (data.masterCommits.length > 0) {
    const commitLog = data.masterCommits
      .map((c) => {
        const body = c.body ? `\n  ${c.body}` : "";
        return `- ${c.shortHash} ${c.subject} (${c.date})${body}`;
      })
      .join("\n");

    sections.push(`## Commits on ${data.defaultBranch} (${data.masterCommits.length}):\n\n${commitLog}`);
  }

  // Merged PRs
  if (data.mergedPrs.length > 0) {
    const prList = data.mergedPrs
      .map((pr) => {
        const desc = pr.body
          ? `\n  Description: ${pr.body.substring(0, 200)}${pr.body.length > 200 ? "..." : ""}`
          : "";
        return `- PR #${pr.number}: ${pr.title} (${pr.headRefName} → ${pr.baseRefName})${desc}`;
      })
      .join("\n");

    sections.push(`## Merged PRs (${data.mergedPrs.length}):\n\n${prList}`);
  }

  // Open PRs
  if (data.openPrs.length > 0) {
    const prList = data.openPrs
      .map((pr) => {
        const desc = pr.body
          ? `\n  Description: ${pr.body.substring(0, 200)}${pr.body.length > 200 ? "..." : ""}`
          : "";
        return `- PR #${pr.number}: ${pr.title} (created ${pr.createdAt}, ${pr.headRefName} → ${pr.baseRefName})${desc}`;
      })
      .join("\n");

    sections.push(`## Open PRs — In Progress (${data.openPrs.length}):\n\n${prList}`);
  }

  // Release branch activity
  if (data.releaseCommits.length > 0) {
    const commitLog = data.releaseCommits
      .map((c) => `- ${c.shortHash} ${c.subject} (${c.date})`)
      .join("\n");

    sections.push(`## Release branch activity (${data.releaseCommits.length} commits):\n\n${commitLog}`);
  }

  sections.push("Write a concise work summary report covering all the activity above.");

  return sections.join("\n\n");
}

export function buildCodeReviewUserMessage(
  commits: CommitWithDiff[]
): string {
  const sections = commits
    .map((c) => {
      const body = c.body ? `\n${c.body}` : "";

      return `## Commit ${c.shortHash}: ${c.subject}
Author: ${c.author}
Date: ${c.date}
${body}
### Diff:
\`\`\`
${c.stat}
\`\`\`

\`\`\`diff
${c.patch}
\`\`\``;
    })
    .join("\n\n---\n\n");

  return `Review the following commit(s) (${commits.length} total):

${sections}

Provide a thorough code review.`;
}
