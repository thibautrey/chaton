// src/types/pi-types.ts
// Types et interfaces pour Pi Coding Agent

export interface PiModel {
  id: string;
  name: string;
  provider: string;
  capabilities: string[];
}

export interface PiSettings {
  enabledModels: string[];
  defaultModel?: string;
  theme?: string;
  editor?: string;
  [key: string]: any;
}

export interface PiConfig {
  configPath: string;
  isUsingUserConfig: boolean;
}
