/**
 * AlgoVoi provider — surfaces the agent's capabilities and configured
 * defaults into the runtime context so the LLM understands what
 * AlgoVoi can do without needing the user to spell it out.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
} from "@elizaos/core";

import { resolveAlgoVoiConfig, SUPPORTED_NETWORKS } from "../environment.js";

export const algovoiProvider: Provider = {
  name: "algovoi",
  description:
    "Provides context on AlgoVoi payment capabilities — supported chains, default network, agent endpoint.",

  get: async (runtime: IAgentRuntime, _message: Memory): Promise<ProviderResult> => {
    let config: ReturnType<typeof resolveAlgoVoiConfig>;
    try {
      config = resolveAlgoVoiConfig(runtime);
    } catch (err) {
      return {
        text: `AlgoVoi is not configured. Set ALGOVOI_API_KEY in environment or runtime settings. (${(err as Error).message})`,
        values: { configured: false },
      };
    }

    const text =
      `AlgoVoi payment capabilities are available on this agent.\n` +
      `Endpoint: ${config.ALGOVOI_API_BASE}\n` +
      `Default network: ${config.ALGOVOI_DEFAULT_NETWORK}\n` +
      `Default currency: ${config.ALGOVOI_DEFAULT_CURRENCY}\n` +
      `Supported networks: ${SUPPORTED_NETWORKS.filter((n) => n.endsWith("_mainnet")).join(", ")}\n` +
      `Available actions:\n` +
      `  - CREATE_PAYMENT_REQUEST: ask for a fiat-denominated payment, returns a checkout URL\n` +
      `  - VERIFY_PAYMENT: confirm an on-chain tx satisfies a payment\n` +
      `  - CHECK_PAYMENT_STATUS: poll an outstanding checkout token\n`;

    return {
      text,
      values: {
        configured: true,
        api_base: config.ALGOVOI_API_BASE,
        default_network: config.ALGOVOI_DEFAULT_NETWORK,
        default_currency: config.ALGOVOI_DEFAULT_CURRENCY,
        supported_networks: SUPPORTED_NETWORKS.filter((n) => n.endsWith("_mainnet")),
      },
    };
  },
};
