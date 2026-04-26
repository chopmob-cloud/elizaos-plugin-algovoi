import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  algovoiPlugin,
  AlgoVoiClient,
  resolveAlgoVoiConfig,
  SUPPORTED_NETWORKS,
} from "../src/index.js";

const ENV_KEYS = [
  "ALGOVOI_API_KEY",
  "ALGOVOI_API_BASE",
  "ALGOVOI_DEFAULT_NETWORK",
  "ALGOVOI_DEFAULT_CURRENCY",
];

function mockRuntime(settings: Record<string, string>) {
  return {
    getSetting: (k: string) => settings[k] ?? undefined,
  } as unknown as Parameters<typeof resolveAlgoVoiConfig>[0];
}

describe("algovoiPlugin shape", () => {
  it("exposes name, description, and three actions", () => {
    expect(algovoiPlugin.name).toBe("algovoi");
    expect(algovoiPlugin.description).toMatch(/payments/i);
    expect(algovoiPlugin.actions?.length).toBe(3);
    const names = algovoiPlugin.actions!.map((a) => a.name).sort();
    expect(names).toEqual([
      "CHECK_PAYMENT_STATUS",
      "CREATE_PAYMENT_REQUEST",
      "VERIFY_PAYMENT",
    ]);
  });

  it("exposes one provider", () => {
    expect(algovoiPlugin.providers?.length).toBe(1);
    expect(algovoiPlugin.providers![0].name).toBe("algovoi");
  });
});

describe("resolveAlgoVoiConfig", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      originalEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalEnv[k];
      }
    }
  });

  it("requires ALGOVOI_API_KEY", () => {
    const rt = mockRuntime({});
    expect(() => resolveAlgoVoiConfig(rt)).toThrow();
  });

  it("reads from runtime settings first", () => {
    const rt = mockRuntime({
      ALGOVOI_API_KEY: "algvk_live_test_runtime_value_long_enough",
    });
    const config = resolveAlgoVoiConfig(rt);
    expect(config.ALGOVOI_API_KEY).toBe("algvk_live_test_runtime_value_long_enough");
    expect(config.ALGOVOI_API_BASE).toBe("https://api1.ilovechicken.co.uk");
    expect(config.ALGOVOI_DEFAULT_NETWORK).toBe("algorand_mainnet");
    expect(config.ALGOVOI_DEFAULT_CURRENCY).toBe("GBP");
  });

  it("falls back to process.env", () => {
    process.env.ALGOVOI_API_KEY = "algvk_live_env_test_value_long_enough";
    process.env.ALGOVOI_API_BASE = "https://api.example.com";
    process.env.ALGOVOI_DEFAULT_NETWORK = "solana_mainnet";
    process.env.ALGOVOI_DEFAULT_CURRENCY = "USD";
    const rt = mockRuntime({});
    const config = resolveAlgoVoiConfig(rt);
    expect(config.ALGOVOI_API_BASE).toBe("https://api.example.com");
    expect(config.ALGOVOI_DEFAULT_NETWORK).toBe("solana_mainnet");
    expect(config.ALGOVOI_DEFAULT_CURRENCY).toBe("USD");
  });
});

describe("AlgoVoiClient", () => {
  const baseConfig = {
    ALGOVOI_API_KEY: "algvk_live_test_value_long_enough",
    ALGOVOI_API_BASE: "https://api.test",
    ALGOVOI_DEFAULT_NETWORK: "algorand_mainnet",
    ALGOVOI_DEFAULT_CURRENCY: "GBP",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /message:send with correct body and auth header for createCheckout", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      return new Response(
        JSON.stringify({
          task: {
            id: "task_1",
            status: { state: "completed" },
            artifacts: [
              {
                parts: [
                  {
                    kind: "data",
                    data: {
                      token: "uW9MJN-abc123",
                      checkout_url: "https://api.test/p/uW9MJN-abc123",
                      status: "active",
                    },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AlgoVoiClient(baseConfig);
    const result = await client.createCheckout({ amount: 9.99, currency: "GBP" });

    expect(result.token).toBe("uW9MJN-abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/message:send");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer algvk_live_test_value_long_enough",
    );
    const body = JSON.parse(init.body as string);
    expect(body.message.parts[0].kind).toBe("data");
    expect(body.message.parts[0].data.skill).toBe("create-checkout");
    expect(body.message.parts[0].data.amount).toBe(9.99);
    expect(body.message.parts[0].data.currency).toBe("GBP");
  });

  it("translates failed task into thrown error", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          task: {
            id: "task_2",
            status: {
              state: "failed",
              message: {
                role: "agent",
                parts: [{ kind: "text", text: "amount is required" }],
              },
            },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AlgoVoiClient(baseConfig);
    await expect(
      client.createCheckout({ amount: 0 as unknown as number }),
    ).rejects.toThrow(/amount is required/);
  });

  it("translates HTTP non-2xx into thrown error", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Unauthorized", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AlgoVoiClient(baseConfig);
    await expect(
      client.checkStatus({ token: "uW9MJN-abc123" }),
    ).rejects.toThrow(/AlgoVoi API 401/);
  });

  it("verifyPayment forwards optional fields", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.message.parts[0].data.skill).toBe("verify-payment");
      expect(body.message.parts[0].data.network).toBe("solana_mainnet");
      expect(body.message.parts[0].data.tx_id).toBe("5Hg111M4");
      expect(body.message.parts[0].data.token).toBe("uW9MJN-abc123");
      expect(body.message.parts[0].data.protocol).toBe("ap2");
      return new Response(
        JSON.stringify({
          task: {
            id: "t",
            status: { state: "completed" },
            artifacts: [
              {
                parts: [{ kind: "data", data: { verified: true, access_token: "jwt..." } }],
              },
            ],
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AlgoVoiClient(baseConfig);
    const result = await client.verifyPayment({
      network: "solana_mainnet",
      tx_id: "5Hg111M4",
      token: "uW9MJN-abc123",
      protocol: "ap2",
    });
    expect(result.verified).toBe(true);
    expect(result.access_token).toBe("jwt...");
  });
});

describe("supported networks", () => {
  it("includes all 7 mainnets", () => {
    const mainnets = SUPPORTED_NETWORKS.filter((n) => n.endsWith("_mainnet"));
    expect(mainnets).toEqual([
      "algorand_mainnet",
      "voi_mainnet",
      "hedera_mainnet",
      "stellar_mainnet",
      "base_mainnet",
      "solana_mainnet",
      "tempo_mainnet",
    ]);
  });
});
