/**
 * Environment configuration for the AlgoVoi ElizaOS plugin.
 *
 * The plugin authenticates against the AlgoVoi A2A endpoint using a
 * tenant API key. Tenants are issued at https://dash.algovoi.co.uk/signup
 * (free tier; testnet by default).
 */

import { z } from "zod";
import type { IAgentRuntime } from "@elizaos/core";

export const algovoiEnvSchema = z.object({
  ALGOVOI_API_KEY: z
    .string({ required_error: "ALGOVOI_API_KEY is required" })
    .min(8, "ALGOVOI_API_KEY looks too short"),
  ALGOVOI_API_BASE: z
    .string()
    .url()
    .default("https://api1.ilovechicken.co.uk"),
  ALGOVOI_DEFAULT_NETWORK: z
    .string()
    .default("algorand_mainnet"),
  ALGOVOI_DEFAULT_CURRENCY: z
    .string()
    .length(3)
    .default("GBP"),
});

export type AlgoVoiConfig = z.infer<typeof algovoiEnvSchema>;

/**
 * Resolve config from the runtime's settings (preferred) with fallback to
 * `process.env`. Throws a clear message if required values are missing.
 */
export function resolveAlgoVoiConfig(runtime: IAgentRuntime): AlgoVoiConfig {
  const fromRuntime = (key: string): string | undefined => {
    try {
      const v = runtime.getSetting(key);
      return typeof v === "string" && v.length > 0 ? v : undefined;
    } catch {
      return undefined;
    }
  };
  const env = (key: string): string | undefined => {
    if (typeof process === "undefined" || !process.env) return undefined;
    const v = process.env[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };

  const merged = {
    ALGOVOI_API_KEY: fromRuntime("ALGOVOI_API_KEY") ?? env("ALGOVOI_API_KEY"),
    ALGOVOI_API_BASE: fromRuntime("ALGOVOI_API_BASE") ?? env("ALGOVOI_API_BASE"),
    ALGOVOI_DEFAULT_NETWORK:
      fromRuntime("ALGOVOI_DEFAULT_NETWORK") ?? env("ALGOVOI_DEFAULT_NETWORK"),
    ALGOVOI_DEFAULT_CURRENCY:
      fromRuntime("ALGOVOI_DEFAULT_CURRENCY") ?? env("ALGOVOI_DEFAULT_CURRENCY"),
  };

  const cleaned = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined),
  );

  return algovoiEnvSchema.parse(cleaned);
}

/**
 * The 7 mainnet networks AlgoVoi currently supports. Used for validation
 * and for the agent's available_networks introspection.
 */
export const SUPPORTED_NETWORKS = [
  "algorand_mainnet",
  "voi_mainnet",
  "hedera_mainnet",
  "stellar_mainnet",
  "base_mainnet",
  "solana_mainnet",
  "tempo_mainnet",
  // Testnets — useful for development
  "algorand_testnet",
  "voi_testnet",
  "hedera_testnet",
  "stellar_testnet",
  "base_sepolia",
  "solana_devnet",
  "tempo_testnet",
] as const;

export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];
