import type {
  CloudBootstrapResponse,
  ConnectInstanceRequest,
  HealthResponse,
  RealtimeTokenResponse,
  RealtimeServerEvent,
} from '../protocol/index.js'

type HeadersInitLike = Record<string, string>

export class CloudApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken?: string,
  ) {}

  private buildHeaders(extra?: HeadersInitLike): HeadersInitLike {
    return {
      ...(this.accessToken
        ? {
            authorization: `Bearer ${this.accessToken}`,
          }
        : {}),
      ...(extra ?? {}),
    }
  }

  async getHealth(): Promise<HealthResponse> {
    const response = await fetch(new URL('/healthz', this.baseUrl), {
      headers: this.buildHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Health request failed with status ${response.status}`)
    }
    return (await response.json()) as HealthResponse
  }

  async getBootstrap(): Promise<CloudBootstrapResponse> {
    const response = await fetch(new URL('/v1/bootstrap', this.baseUrl), {
      headers: this.buildHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Bootstrap request failed with status ${response.status}`)
    }
    return (await response.json()) as CloudBootstrapResponse
  }

  async connectInstance(body: ConnectInstanceRequest): Promise<{ ok: true }> {
    const response = await fetch(new URL('/v1/cloud-instances', this.baseUrl), {
      method: 'POST',
      headers: this.buildHeaders({
        'content-type': 'application/json',
      }),
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`Connect instance request failed with status ${response.status}`)
    }
    return { ok: true }
  }

  async getRealtimeToken(): Promise<RealtimeTokenResponse> {
    const response = await fetch(new URL('/v1/realtime/token', this.baseUrl), {
      headers: this.buildHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Realtime token request failed with status ${response.status}`)
    }
    return (await response.json()) as RealtimeTokenResponse
  }
}

export type RealtimeListener = (event: RealtimeServerEvent) => void
