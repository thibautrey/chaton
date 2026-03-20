import type {
  CloudBootstrapResponse,
  ConnectInstanceRequest,
  HealthResponse,
  RealtimeServerEvent,
} from '../protocol/index.js'

export class CloudApiClient {
  constructor(private readonly baseUrl: string) {}

  async getHealth(): Promise<HealthResponse> {
    const response = await fetch(new URL('/healthz', this.baseUrl))
    if (!response.ok) {
      throw new Error(`Health request failed with status ${response.status}`)
    }
    return (await response.json()) as HealthResponse
  }

  async getBootstrap(): Promise<CloudBootstrapResponse> {
    const response = await fetch(new URL('/v1/bootstrap', this.baseUrl))
    if (!response.ok) {
      throw new Error(`Bootstrap request failed with status ${response.status}`)
    }
    return (await response.json()) as CloudBootstrapResponse
  }

  async connectInstance(body: ConnectInstanceRequest): Promise<{ ok: true }> {
    const response = await fetch(new URL('/v1/cloud-instances', this.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`Connect instance request failed with status ${response.status}`)
    }
    return { ok: true }
  }
}

export type RealtimeListener = (event: RealtimeServerEvent) => void
