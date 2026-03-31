declare module 'ws' {
  import type { Server as HttpServer, IncomingMessage } from 'node:http'
  import type { EventEmitter } from 'node:events'

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number
    readonly OPEN: number
    readyState: number
    send(data: string | Buffer): void
    close(code?: number, reason?: string): void
    on(event: 'close', listener: () => void): this
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { server: HttpServer; path?: string })
    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this
    close(callback?: () => void): void
  }
}
