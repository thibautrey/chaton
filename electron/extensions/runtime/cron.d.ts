declare module 'cron' {
  export interface CronJobParams {
    cronTime: string | Date;
    onTick: () => void | Promise<void>;
    onComplete?: (() => void) | null;
    start?: boolean;
    timeZone?: string;
    context?: any;
    runOnInit?: boolean;
  }

  export class CronJob {
    constructor(
      cronTime: string | Date,
      onTick: () => void | Promise<void>,
      onComplete?: (() => void) | null,
      start?: boolean,
      timeZone?: string,
      context?: any,
      runOnInit?: boolean,
      utcOffset?: string | number,
    );

    start(): void;
    stop(): void;
    setTime(time: Date): void;
    lastDate(): Date | null;
    nextDate(): moment.Moment | null;
    addCallback(callback: () => void): void;
    removeCallback(callback: () => void): void;
    removeAllListeners(): void;
    running: boolean;
    status(): string;
  }

  export namespace cron {
    export class CronJob {
      constructor(
        cronTime: string | Date,
        onTick: () => void | Promise<void>,
        onComplete?: (() => void) | null,
        start?: boolean,
        timeZone?: string,
        context?: any,
        runOnInit?: boolean,
        utcOffset?: string | number,
      );

      start(): void;
      stop(): void;
      setTime(time: Date): void;
      lastDate(): Date | null;
      nextDate(): any;
      addCallback(callback: () => void): void;
      removeCallback(callback: () => void): void;
      removeAllListeners(): void;
      running: boolean;
      status(): string;
    }
  }
}

declare namespace moment {
  interface Moment {
    toDate(): Date;
  }
}
