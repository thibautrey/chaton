// src/types/global.d.ts
// Déclarations de types globaux pour l'application

import { PiModel, PiSettings } from './pi-types';

declare global {
  interface Window {
    pi: {
      getModels: () => Promise<PiModel[]>;
      getSettings: () => Promise<PiSettings>;
      updateSettings: (newSettings: Partial<PiSettings>) => Promise<PiSettings>;
      isUsingUserConfig: () => Promise<boolean>;
    };
  }
}

export {};
