import process from "node:process";
import * as Sentry from "@sentry/electron/main";

const DEFAULT_SENTRY_DSN =
  "https://f37db36c86a80d6f1c60005680864d75@o4510992005005312.ingest.de.sentry.io/4510992008151120";

type TelemetryLevel = "info" | "warn" | "error" | "debug";
type TelemetrySource = "electron" | "pi" | "frontend";

export type TelemetryEvent = {
  timestamp: string;
  level: TelemetryLevel;
  source: TelemetrySource;
  message: string;
  data?: unknown;
};

type SentryTelemetryOptions = {
  dsn?: string;
  appVersion: string;
  environment?: string;
  isEnabled: () => boolean;
};

class SentryTelemetry {
  private readonly isEnabled: () => boolean;
  private readonly isReady: boolean;

  constructor(options: SentryTelemetryOptions) {
    this.isEnabled = options.isEnabled;
    const dsn = (options.dsn ?? process.env.SENTRY_DSN ?? DEFAULT_SENTRY_DSN).trim();
    if (!dsn) {
      this.isReady = false;
      return;
    }

    Sentry.init({
      dsn,
      release: options.appVersion,
      environment: options.environment ?? process.env.NODE_ENV ?? "production",
      sendDefaultPii: false,
      beforeSend: (event) => (this.isEnabled() ? event : null),
    });
    this.isReady = true;
  }

  send(event: TelemetryEvent) {
    if (!this.isReady || !this.isEnabled()) return;

    const level: Sentry.SeverityLevel =
      event.level === "debug"
        ? "debug"
        : event.level === "warn"
          ? "warning"
          : event.level === "error"
            ? "error"
            : "info";

    Sentry.withScope((scope) => {
      scope.setLevel(level);
      scope.setTag("source", event.source);
      scope.setExtra("timestamp", event.timestamp);
      if (event.data !== undefined) {
        scope.setExtra("data", event.data);
      }
      Sentry.captureMessage(event.message);
    });
  }

  captureException(error: unknown, context?: Record<string, unknown>) {
    if (!this.isReady || !this.isEnabled()) return;
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  }
}

let globalTelemetry: SentryTelemetry | null = null;

export function initSentryTelemetry(options: SentryTelemetryOptions) {
  globalTelemetry = new SentryTelemetry(options);
  return globalTelemetry;
}

export function getSentryTelemetry() {
  return globalTelemetry;
}
