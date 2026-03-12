# gitgenie

LLM-powered release notes and code reviews from git history.

## Install

```bash
# npm
npm install -g @pkieltyka/gitgenie

# bun
bun install -g @pkieltyka/gitgenie
```

This installs the `gitgenie` command globally.

Or run directly without installing:

```bash
npx @pkieltyka/gitgenie --help
bunx @pkieltyka/gitgenie --help
```

## Quick start

```bash
# Authenticate with an LLM provider
gitgenie login anthropic

# Generate release notes between two tags
gitgenie release-notes v1.0 v1.1

# Deep mode: analyze source diffs, not just commit messages
gitgenie release-notes v1.0 v1.1 --deep --save

# Code review a commit
gitgenie review abc123

# Code review a range of commits
gitgenie review abc123 def456 --save
```

## Commands

```
gitgenie release-notes <from> <to>    Generate release notes between two refs
gitgenie review <commit> [end]        Code review of one or more commits
gitgenie login <provider>             OAuth login to an LLM provider
gitgenie logout [provider]            Remove stored credentials
gitgenie auth-status                  Show authentication status
gitgenie list-providers               List available LLM providers
gitgenie list-models [provider]       List available models
gitgenie config                       Show current configuration
gitgenie config set-model <p> <m>     Set default model for a provider
gitgenie config set-provider <p>      Set default provider
```

## Configuration

Default provider is `anthropic` with `claude-opus-4-5`. Override per-provider defaults:

```bash
gitgenie config set-model anthropic claude-sonnet-4-5
gitgenie config set-provider anthropic
```

Or per-invocation:

```bash
gitgenie release-notes v1.0 v1.1 --provider anthropic --model claude-sonnet-4-5
```

Config is stored at `~/.gitgenie/config.json`. Auth credentials at `~/.gitgenie/auth.json`.

## Supported providers

| Provider | OAuth ID | What you need |
|----------|----------|---------------|
| Anthropic | `anthropic` | Claude Pro or Max subscription |
| OpenAI | `openai-codex` | ChatGPT Plus or Pro subscription |
| GitHub Copilot | `github-copilot` | Copilot subscription |
| Google Gemini | `google-gemini-cli` | Free tier or Cloud Code Assist |
| Antigravity | `google-antigravity` | Free |

## License

MIT
