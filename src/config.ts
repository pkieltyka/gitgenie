import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { getModels, getProviders, type KnownProvider } from "@mariozechner/pi-ai";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), ".gitgenie");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Built-in defaults (per provider)
// ---------------------------------------------------------------------------

/** Built-in default model for each provider when no config is set. */
const BUILTIN_DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-opus-4-5",
  openai: "gpt-4o",
  "openai-codex": "gpt-4o",
  google: "gemini-2.5-pro",
  "google-gemini-cli": "gemini-2.5-pro",
  "google-antigravity": "gemini-2.5-pro",
  "github-copilot": "gpt-4o",
  openrouter: "anthropic/claude-sonnet-4",
};

const BUILTIN_DEFAULT_PROVIDER = "anthropic";

// ---------------------------------------------------------------------------
// Config data
// ---------------------------------------------------------------------------

export interface GitGenieConfig {
  defaults: {
    provider: string;
    models: Record<string, string>;
  };
}

function emptyConfig(): GitGenieConfig {
  return {
    defaults: {
      provider: BUILTIN_DEFAULT_PROVIDER,
      models: {},
    },
  };
}

export function loadConfig(): GitGenieConfig {
  if (!existsSync(CONFIG_FILE)) {
    return emptyConfig();
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    return {
      defaults: {
        provider: raw?.defaults?.provider ?? BUILTIN_DEFAULT_PROVIDER,
        models: raw?.defaults?.models ?? {},
      },
    };
  } catch {
    return emptyConfig();
  }
}

function saveConfig(config: GitGenieConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // chmod may fail on Windows
  }
}

// ---------------------------------------------------------------------------
// Resolve defaults
// ---------------------------------------------------------------------------

/**
 * Get the default provider from config (or built-in fallback).
 */
export function getDefaultProvider(): string {
  const config = loadConfig();
  return config.defaults.provider;
}

/**
 * Get the default model for a given provider.
 * Resolution: config > built-in > first model from pi-ai.
 */
export function getDefaultModel(provider: string): string {
  const config = loadConfig();

  // 1. User-configured default for this provider
  if (config.defaults.models[provider]) {
    return config.defaults.models[provider];
  }

  // 2. Built-in default for this provider
  if (BUILTIN_DEFAULT_MODELS[provider]) {
    return BUILTIN_DEFAULT_MODELS[provider];
  }

  // 3. Fall back to first available model
  try {
    const models = getModels(provider as KnownProvider);
    if (models.length > 0) {
      return models[0].id;
    }
  } catch {
    // Unknown provider
  }

  return "claude-opus-4-5";
}

// ---------------------------------------------------------------------------
// Config subcommands
// ---------------------------------------------------------------------------

export function showConfig(): void {
  const config = loadConfig();

  console.log("Current configuration:\n");
  console.log(`  Default provider: ${config.defaults.provider}`);

  const modelEntries = Object.entries(config.defaults.models);
  if (modelEntries.length > 0) {
    console.log("\n  Default models:");
    for (const [provider, model] of modelEntries) {
      console.log(`    ${provider.padEnd(22)} ${model}`);
    }
  } else {
    console.log("\n  No custom model defaults set (using built-in defaults).");
  }

  console.log("\n  Built-in defaults:");
  for (const [provider, model] of Object.entries(BUILTIN_DEFAULT_MODELS)) {
    const overridden = config.defaults.models[provider];
    const suffix = overridden ? ` (overridden: ${overridden})` : "";
    console.log(`    ${provider.padEnd(22)} ${model}${suffix}`);
  }

  console.log(`\n  Config file: ${CONFIG_FILE}`);
}

export function setDefaultModel(provider: string, modelId: string): void {
  // Validate the provider exists in pi-ai
  const allProviders = getProviders() as string[];
  if (!allProviders.includes(provider)) {
    console.error(`Unknown provider: ${provider}`);
    console.error(`Available providers: ${allProviders.join(", ")}`);
    process.exit(1);
  }

  // Validate the model exists for this provider
  const models = getModels(provider as KnownProvider);
  const found = models.find((m) => m.id === modelId);
  if (!found) {
    console.error(`Unknown model '${modelId}' for provider '${provider}'.`);
    console.error(`\nAvailable models for ${provider}:`);
    for (const m of models) {
      console.log(`  ${m.id}`);
    }
    process.exit(1);
  }

  const config = loadConfig();
  config.defaults.models[provider] = modelId;
  saveConfig(config);

  console.log(`Default model for ${provider} set to: ${modelId}`);
}

export function setDefaultProvider(provider: string): void {
  // Validate the provider exists in pi-ai
  const allProviders = getProviders() as string[];
  if (!allProviders.includes(provider)) {
    console.error(`Unknown provider: ${provider}`);
    console.error(`Available providers: ${allProviders.join(", ")}`);
    process.exit(1);
  }

  const config = loadConfig();
  config.defaults.provider = provider;
  saveConfig(config);

  console.log(`Default provider set to: ${provider}`);
}
