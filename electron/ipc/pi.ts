// electron/ipc/pi.ts
// Module IPC pour exposer les fonctionnalités de Pi au frontend

import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
const { ipcMain, BrowserWindow, dialog, app } = electron;
import { getModels, getSettings, updateSettings, isUsingUserConfig } from '../lib/pi/pi-manager.js';
import { getLogManager } from '../lib/logging/log-manager.js';
import { getSentryTelemetry } from '../lib/telemetry/sentry.js';
import {
  listHarnessCandidates,
  markActiveCandidateInSummaries,
  readActiveCandidate,
  readFrontier,
  triageCandidatesForBenchmark,
  triageAllCandidates,
} from '../meta-harness/archive.js';
import { buildDefaultBenchmark } from '../meta-harness/benchmark.js';
import { metaHarnessOptimizerRunner } from '../meta-harness/optimizer-runner.js';
import { getOptimizerAttemptsRoot } from '../meta-harness/optimizer-store.js';

function readJsonFileIfExists(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readTextFileIfExists(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Enregistre les handlers IPC pour Pi
 */
export function registerPiIpc() {
  const agentDir = path.join(app.getPath('userData'), '.pi', 'agent');
  // Récupère la liste des modèles disponibles
  ipcMain.handle('pi:getModels', () => {
    try {
      return getModels();
    } catch (error) {
      console.error('Erreur lors de la récupération des modèles:', error);
      return [];
    }
  });

  // Récupère les paramètres de l'utilisateur
  ipcMain.handle('pi:getSettings', () => {
    try {
      return getSettings();
    } catch (error) {
      console.error('Erreur lors de la récupération des paramètres:', error);
      return {};
    }
  });

  // Met à jour les paramètres de l'utilisateur
  ipcMain.handle('pi:updateSettings', (_, newSettings) => {
    try {
      updateSettings(newSettings);
      return getSettings();
    } catch (error) {
      console.error('Erreur lors de la mise à jour des paramètres:', error);
      return {};
    }
  });

  // Vérifie si la configuration de l'utilisateur est utilisée
  ipcMain.handle('pi:isUsingUserConfig', () => {
    try {
      return isUsingUserConfig();
    } catch (error) {
      console.error('Erreur lors de la vérification de la configuration:', error);
      return false;
    }
  });

  // Récupère les logs
  ipcMain.handle('logs:getLogs', async (_, limit: number = 100, conversationId?: string | null) => {
    try {
      const logManager = getLogManager();
      const logs = await logManager.getLogs(limit);
      if (!conversationId) {
        return logs;
      }
      return logs.filter((entry) => entry.conversationId === conversationId);
    } catch (error) {
      console.error('Erreur lors de la récupération des logs:', error);
      return [];
    }
  });

  // Efface les logs
  ipcMain.handle('logs:clearLogs', async () => {
    try {
      const logManager = getLogManager();
      return await logManager.clearLogs();
    } catch (error) {
      console.error('Erreur lors de l\'effacement des logs:', error);
      return false;
    }
  });

  // Récupère le chemin du fichier de log
  ipcMain.handle('logs:getLogFilePath', () => {
    try {
      const logManager = getLogManager();
      return logManager.getLogFilePath();
    } catch (error) {
      console.error('Erreur lors de la récupération du chemin du fichier de log:', error);
      return '';
    }
  });

  ipcMain.handle('logs:saveCopy', async () => {
    try {
      const logManager = getLogManager();
      const sourcePath = logManager.getLogFilePath();
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { ok: false as const, message: 'Aucun fichier de log disponible.' };
      }

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const result = await dialog.showSaveDialog(win, {
        title: 'Enregistrer une copie des logs',
        defaultPath: path.basename(sourcePath),
        filters: [{ name: 'Log files', extensions: ['log', 'txt'] }],
      });

      // @ts-ignore Electron typing mismatch
      if (result.canceled || !result.filePath) {
        return { ok: true as const, cancelled: true as const };
      }

      // @ts-ignore Electron typing mismatch
      fs.copyFileSync(sourcePath, result.filePath);
      return { ok: true as const, filePath: result.filePath };
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des logs:', error);
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('telemetry:log', (_event, level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => {
    console.log(`[Telemetry][frontend][${level.toUpperCase()}] ${message}`, data)
    const telemetry = getSentryTelemetry()
    telemetry?.send({
      timestamp: new Date().toISOString(),
      source: 'frontend',
      level,
      message,
      data,
    })
    return true
  })

  ipcMain.handle('telemetry:crash', (_event, payload: { message: string; stack?: string; context?: unknown }) => {
    const telemetry = getSentryTelemetry()
    telemetry?.send({
      timestamp: new Date().toISOString(),
      source: 'frontend',
      level: 'error',
      message: 'renderer_crash',
      data: payload,
    })
    return true
  })

  ipcMain.handle('meta-harness:listCandidates', (_event, benchmarkId?: string | null) => {
    const resolvedBenchmarkId = benchmarkId && benchmarkId.trim().length > 0
      ? benchmarkId.trim()
      : buildDefaultBenchmark().id
    return {
      benchmarkId: resolvedBenchmarkId,
      activeCandidateId: readActiveCandidate(agentDir) ?? 'baseline',
      candidates: markActiveCandidateInSummaries(
        agentDir,
        listHarnessCandidates(agentDir, resolvedBenchmarkId),
      ),
    }
  })

  ipcMain.handle('meta-harness:getFrontier', (_event, benchmarkId?: string | null) => {
    const resolvedBenchmarkId = benchmarkId && benchmarkId.trim().length > 0
      ? benchmarkId.trim()
      : buildDefaultBenchmark().id
    return {
      benchmarkId: resolvedBenchmarkId,
      frontier: readFrontier(agentDir, resolvedBenchmarkId),
    }
  })

  ipcMain.handle('meta-harness:getOptimizerState', () => {
    try {
      return metaHarnessOptimizerRunner.getState()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      getLogManager().log('error', 'electron', '[meta-harness optimizer] Failed to read optimizer state.', { error: message })
      console.error('Erreur lors de la récupération de l\'état de l\'optimiseur Meta-Harness:', error)
      throw error
    }
  })

  ipcMain.handle('meta-harness:listOptimizerAttempts', (_event, runId?: string | null) => {
    return metaHarnessOptimizerRunner.listAttempts(runId)
  })

  ipcMain.handle('meta-harness:getOptimizerAttemptResult', (_event, input: {
    runId?: string | null
    benchmarkId?: string | null
    attemptId?: string | null
    candidateId?: string | null
  }) => {
    const attemptId = typeof input?.attemptId === 'string' ? input.attemptId.trim() : ''
    const preferredCandidateId = typeof input?.candidateId === 'string' && input.candidateId.trim().length > 0
      ? input.candidateId.trim()
      : null
    const resolvedRunId = typeof input?.runId === 'string' && input.runId.trim().length > 0
      ? input.runId.trim()
      : metaHarnessOptimizerRunner.getState().runId

    if (!resolvedRunId) {
      throw new Error('No optimizer run available')
    }

    let attempt: Record<string, unknown> | null = null
    let benchmarkId = typeof input?.benchmarkId === 'string' && input.benchmarkId.trim().length > 0
      ? input.benchmarkId.trim()
      : ''
    let selectedCandidateId = preferredCandidateId ?? ''

    if (attemptId) {
      const attemptPath = path.join(getOptimizerAttemptsRoot(agentDir, resolvedRunId), `${attemptId}.json`)
      attempt = readJsonFileIfExists(attemptPath) as Record<string, unknown> | null
      if (!attempt) {
        throw new Error(`Attempt not found: ${attemptId}`)
      }

      const candidates = Array.isArray(attempt.candidates)
        ? (attempt.candidates as Array<Record<string, unknown>>)
        : []

      const selectedCandidateRecord =
        (preferredCandidateId
          ? candidates.find((entry) => {
              const candidate = entry.candidate
              return candidate && typeof candidate === 'object' && String((candidate as Record<string, unknown>).id ?? '') === preferredCandidateId
            })
          : null) ?? candidates[0] ?? null

      const selectedCandidate = selectedCandidateRecord?.candidate && typeof selectedCandidateRecord.candidate === 'object'
        ? (selectedCandidateRecord.candidate as Record<string, unknown>)
        : null
      selectedCandidateId = String(selectedCandidate?.id ?? preferredCandidateId ?? '')
      benchmarkId = typeof attempt.benchmarkId === 'string' && attempt.benchmarkId.trim().length > 0
        ? attempt.benchmarkId.trim()
        : benchmarkId
    }

    const resolvedBenchmarkId = benchmarkId || buildDefaultBenchmark().id

    if (!selectedCandidateId) {
      return {
        runId: resolvedRunId,
        attemptId: attemptId || null,
        attempt,
        selectedCandidateId: null,
        candidate: null,
        score: null,
        summary: null,
        promptText: null,
        envSnapshotText: null,
        traceText: null,
        diffPatch: null,
      }
    }

    const candidateRoot = path.join(agentDir, 'meta-harness', resolvedBenchmarkId, resolvedRunId, 'candidates', selectedCandidateId)

    return {
      runId: resolvedRunId,
      attemptId: attemptId || null,
      attempt,
      selectedCandidateId,
      candidate: readJsonFileIfExists(path.join(candidateRoot, 'candidate.json')),
      score: readJsonFileIfExists(path.join(candidateRoot, 'score.json')),
      summary: readJsonFileIfExists(path.join(candidateRoot, 'summary.json')),
      promptText: readTextFileIfExists(path.join(candidateRoot, 'prompt.txt')),
      envSnapshotText: readTextFileIfExists(path.join(candidateRoot, 'env-snapshot.txt')),
      traceText: readTextFileIfExists(path.join(candidateRoot, 'trace.jsonl')),
      diffPatch: readTextFileIfExists(path.join(candidateRoot, 'diff.patch')),
    }
  })

  ipcMain.handle('meta-harness:startOptimizer', async (_event, config: {
    benchmarkId?: string
    optimizerModelProvider: string
    optimizerModelId: string
    optimizerThinkingLevel?: string | null
    autoPromote?: boolean
    loop?: boolean
    maxIterations?: number | null
    maxVariantsPerIteration?: number
    minScoreDelta?: number
    sleepMs?: number
    validationModelProvider?: string | null
    validationModelId?: string | null
    validationThinkingLevel?: string | null
  }) => {
    try {
      getLogManager().log('info', 'electron', '[meta-harness optimizer] IPC start requested.', {
        benchmarkId: config.benchmarkId,
        optimizerModelProvider: config.optimizerModelProvider,
        optimizerModelId: config.optimizerModelId,
      })
      return await metaHarnessOptimizerRunner.start({
        benchmarkId: config.benchmarkId,
        optimizerModelProvider: config.optimizerModelProvider,
        optimizerModelId: config.optimizerModelId,
        optimizerThinkingLevel: config.optimizerThinkingLevel,
        autoPromote: config.autoPromote,
        loop: config.loop,
        maxIterations: config.maxIterations,
        maxVariantsPerIteration: config.maxVariantsPerIteration,
        minScoreDelta: config.minScoreDelta,
        sleepMs: config.sleepMs,
        validationModelProvider: config.validationModelProvider,
        validationModelId: config.validationModelId,
        validationThinkingLevel: config.validationThinkingLevel,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      getLogManager().log('error', 'electron', '[meta-harness optimizer] Failed to start.', {
        error: message,
        benchmarkId: config.benchmarkId,
        optimizerModelProvider: config.optimizerModelProvider,
        optimizerModelId: config.optimizerModelId,
      })
      console.error('Erreur lors du démarrage de l\'optimiseur Meta-Harness:', error)
      throw error
    }
  })

  ipcMain.handle('meta-harness:stopOptimizer', () => {
    try {
      return metaHarnessOptimizerRunner.stop()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      getLogManager().log('error', 'electron', '[meta-harness optimizer] Failed to stop.', { error: message })
      console.error('Erreur lors de l\'arrêt de l\'optimiseur Meta-Harness:', error)
      throw error
    }
  })

  ipcMain.handle('meta-harness:triageCandidates', (_event, benchmarkId?: string | null) => {
    try {
      const resolvedBenchmarkId = benchmarkId && benchmarkId.trim().length > 0
        ? benchmarkId.trim()
        : null

      if (resolvedBenchmarkId) {
        const result = triageCandidatesForBenchmark(agentDir, resolvedBenchmarkId)
        getLogManager().log('info', 'electron', '[meta-harness] Triaged candidates for benchmark.', {
          benchmarkId: resolvedBenchmarkId,
          kept: result.kept.length,
          removed: result.removed.length,
        })
        return { benchmarkId: resolvedBenchmarkId, ...result }
      }

      // If no benchmark specified, triage all benchmarks
      const results = triageAllCandidates(agentDir)
      const summary = Object.fromEntries(results)
      const totalKept = Array.from(results.values()).reduce((sum, r) => sum + r.kept.length, 0)
      const totalRemoved = Array.from(results.values()).reduce((sum, r) => sum + r.removed.length, 0)
      getLogManager().log('info', 'electron', '[meta-harness] Triaged candidates for all benchmarks.', {
        benchmarks: results.size,
        totalKept,
        totalRemoved,
      })
      return { all: true, summary, totalKept, totalRemoved }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      getLogManager().log('error', 'electron', '[meta-harness] Failed to triage candidates.', { error: message })
      console.error('Erreur lors du tri des candidats Meta-Harness:', error)
      throw error
    }
  })
}
