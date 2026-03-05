import crypto from "node:crypto";
import os from "node:os";
import process from "node:process";

type TelemetryLevel = "info" | "warn" | "error" | "debug";
type TelemetrySource = "electron" | "pi" | "frontend";

export type TelemetryEvent = {
  timestamp: string;
  level: TelemetryLevel;
  source: TelemetrySource;
  message: string;
  data?: unknown;
};

type HyperdxTelemetryOptions = {
  ingestionUrl?: string;
  apiKey?: string;
  appVersion: string;
  isEnabled: () => boolean;
};

class HyperdxTelemetry {
  private readonly ingestionUrl: string | null;
  private readonly apiKey: string | null;
  private readonly appVersion: string;
  private readonly isEnabled: () => boolean;
  private readonly sessionId: string;

  constructor(options: HyperdxTelemetryOptions) {
    const url = (options.ingestionUrl ?? process.env.HYPERDX_INGESTION_URL ?? "").trim();
    const apiKey = (options.apiKey ?? process.env.HYPERDX_API_KEY ?? "").trim();
    this.ingestionUrl = url.length > 0 ? url : null;
    this.apiKey = apiKey.length > 0 ? apiKey : null;
    this.appVersion = options.appVersion;
    this.isEnabled = options.isEnabled;
    this.sessionId = crypto.randomUUID();
  }

  send(event: TelemetryEvent) {
    if (!this.ingestionUrl || !this.isEnabled()) return;

    const payload = {
      timestamp: event.timestamp,
      level: event.level,
      source: event.source,
      message: event.message,
      data: event.data ?? null,
      app: {
        name: "Chatons",
        version: this.appVersion,
      },
      runtime: {
        platform: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
        nodeVersion: process.version,
      },
      session: {
        id: this.sessionId,
      },
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
      headers["x-api-key"] = this.apiKey;
    }

    void fetch(this.ingestionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  }
}

let globalTelemetry: HyperdxTelemetry | null = null;

export function initHyperdxTelemetry(options: HyperdxTelemetryOptions) {
  globalTelemetry = new HyperdxTelemetry(options);
  return globalTelemetry;
}

export function getHyperdxTelemetry() {
  return globalTelemetry;
}
