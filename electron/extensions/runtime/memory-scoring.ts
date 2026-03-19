/**
 * Memory Scoring Module - Chetna-inspired psychological memory system
 * 
 * Implements multi-factor recall scoring based on:
 * - Similarity (semantic matching)
 * - Importance (intrinsic value)
 * - Recency (Ebbinghaus forgetting curve)
 * - Access Boost (memory reinforcement through access)
 * - Emotion (valence + arousal)
 * 
 * Reference: https://github.com/vineetkishore01/Chetna
 */

// ── Stability periods by memory type (inspired by Chetna) ────────────────────
// Hours before a memory starts decaying

export const MEMORY_STABILITY_PERIODS: Record<string, number> = {
  'system': 10000,           // Core system prompts - essentially permanent
  'skill_learned': 336,      // "Agent knows Python" - 2 weeks
  'preference': 720,         // "User prefers dark mode" - 30 days
  'fact': 168,              // "User's name is Vineet" - 1 week
  'rule': 240,              // "Never share passwords" - 10 days
  'experience': 24,         // "Had a great meeting" - 1 day
  'conversation-summary': 168, // Default for summaries - 1 week
};

// ── Default importance by memory type ─────────────────────────────────────────

export const MEMORY_DEFAULT_IMPORTANCE: Record<string, number> = {
  'system': 0.95,
  'skill_learned': 0.7,
  'preference': 0.75,
  'fact': 0.6,
  'rule': 0.8,
  'experience': 0.3,
  'conversation-summary': 0.5,
};

// ── Default emotion by memory type ───────────────────────────────────────────

export const MEMORY_DEFAULT_EMOTION: Record<string, { valence: number; arousal: number }> = {
  'system': { valence: 0.0, arousal: 0.0 },      // Neutral
  'skill_learned': { valence: 0.2, arousal: 0.3 }, // Mildly positive, calm
  'preference': { valence: 0.0, arousal: 0.1 },   // Neutral
  'fact': { valence: 0.0, arousal: 0.1 },          // Neutral
  'rule': { valence: -0.1, arousal: 0.2 },         // Slightly negative (constraint)
  'experience': { valence: 0.3, arousal: 0.5 },    // Positive, moderately exciting
  'conversation-summary': { valence: 0.0, arousal: 0.1 }, // Neutral
};

// ── Recall scoring weights (inspired by Chetna) ───────────────────────────────

export const RECALL_WEIGHTS = {
  similarity: 0.40,    // Semantic similarity score
  importance: 0.25,   // Intrinsic importance
  recency: 0.15,      // Time since last update
  accessBoost: 0.10,  // Frequency of access reinforcement
  emotion: 0.10,       // Emotional salience
} as const;

// ── Constants ────────────────────────────────────────────────────────────────

const RECENCY_TAU_HOURS = 168; // ~1 week, Ebbinghaus constant
const ACCESS_BOOST_RATE = 0.02; // Chetna: access_boost = min(access_count * 0.02, 0.5)
const MAX_ACCESS_BOOST = 0.5;
const DECAY_THRESHOLD = 0.15; // Archive if decay * importance < threshold

// ── Scoring Functions ───────────────────────────────────────────────────────

export interface RecallScoreParams {
  similarity: number;     // 0-1, cosine similarity score
  importance: number;     // 0-1, intrinsic importance
  recency: number;       // 0-1, recency score (1 = very recent)
  accessBoost: number;   // 0-0.5, access-based boost
  emotionScore: number;  // 0-1, emotional salience score
}

/**
 * Calculate multi-factor recall score
 * 
 * RecallScore = Similarity(40%) + Importance(25%) + Recency(15%) + AccessBoost(10%) + Emotion(10%)
 */
export function calculateRecallScore(params: RecallScoreParams): number {
  const score = 
    params.similarity * RECALL_WEIGHTS.similarity +
    params.importance * RECALL_WEIGHTS.importance +
    params.recency * RECALL_WEIGHTS.recency +
    params.accessBoost * RECALL_WEIGHTS.accessBoost +
    params.emotionScore * RECALL_WEIGHTS.emotion;
  
  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Calculate recency score based on Ebbinghaus forgetting curve
 * 
 * Uses exponential decay: score = e^(-t/τ)
 * where τ ≈ 168 hours (1 week) is the time constant
 */
export function calculateRecencyScore(updatedAt: string): number {
  const now = Date.now();
  const updated = new Date(updatedAt).getTime();
  const hoursElapsed = (now - updated) / (1000 * 60 * 60);
  
  // Ebbinghaus: retention ~40% after 24h, ~25% after 7 days
  // Score = e^(-t/τ) where τ = RECENCY_TAU_HOURS
  return Math.exp(-hoursElapsed / RECENCY_TAU_HOURS);
}

/**
 * Calculate access boost based on memory reinforcement
 * 
 * Chetna's insight: accessing a memory makes it more resistant to forgetting
 * This mirrors the psychological spacing effect
 * 
 * access_boost = min(access_count * 0.02, 0.5)
 */
export function calculateAccessBoost(accessCount: number): number {
  return Math.min(accessCount * ACCESS_BOOST_RATE, MAX_ACCESS_BOOST);
}

/**
 * Calculate emotion score from valence and arousal
 * 
 * Emotionally charged memories are more memorable
 * High arousal (exciting) or high absolute valence (very positive/negative)
 * are more salient
 */
export function calculateEmotionScore(
  valence: number,  // -1.0 to 1.0
  arousal: number    // 0.0 to 1.0
): number {
  // Valence magnitude captures how positive/negative
  const valenceAbs = Math.abs(Math.max(-1, Math.min(1, valence)));
  // Arousal captures intensity
  const arousalClamped = Math.max(0, Math.min(1, arousal));
  
  // Weighted combination: valence slightly more important than arousal
  return (valenceAbs * 0.6) + (arousalClamped * 0.4);
}

/**
 * Calculate decay factor based on Ebbinghaus Forgetting Curve
 * 
 * Memories have different "stability" periods:
 * - During stability period: decay_factor = 1.0
 * - After stability: exponential decay
 * 
 * More frequent access = slower decay (access reinforcement)
 */
export function calculateDecayFactor(
  createdAt: string,
  stabilityHours: number,
  accessCount: number
): number {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const hoursElapsed = (now - created) / (1000 * 60 * 60);
  
  // Within stability period: no decay
  if (hoursElapsed <= stabilityHours) {
    return 1.0;
  }
  
  const hoursAfterStability = hoursElapsed - stabilityHours;
  
  // After stability: exponential decay
  // More accesses = slower decay (memory reinforcement)
  const accessModifier = 1 + (Math.min(accessCount, 20) * 0.05);
  const effectiveDecay = hoursAfterStability / (stabilityHours * accessModifier);
  
  return Math.exp(-effectiveDecay * 0.1);
}

/**
 * Determine if a memory should be archived (forgotten)
 * 
 * A memory is forgotten when its effective recall (decay * importance)
 * falls below the threshold
 */
export function shouldArchiveMemory(
  decayFactor: number,
  importance: number
): boolean {
  // High importance memories can resist more decay
  const effectiveThreshold = DECAY_THRESHOLD + (importance * 0.1);
  return (decayFactor * importance) < effectiveThreshold;
}

/**
 * Calculate automatic importance for conversation summaries
 * 
 * Based on signals in the conversation:
 * - More messages = more important
 * - File edits = significant work
 * - Errors solved = valuable knowledge
 * - Very short conversations = likely small talk
 */
export function calculateAutoImportance(params: {
  messageCount: number;
  fileEdits: number;
  hasErrors: boolean;
  durationMinutes: number;
}): number {
  let importance = 0.5; // baseline
  
  // Longer conversations = more important
  importance += Math.min(params.messageCount * 0.01, 0.15);
  
  // File modifications = significant work
  importance += Math.min(params.fileEdits * 0.05, 0.2);
  
  // Errors solved = very valuable knowledge
  if (params.hasErrors) importance += 0.15;
  
  // Very short conversations = likely small talk
  if (params.messageCount < 5) importance -= 0.2;
  
  // Very long sessions = probably important
  if (params.durationMinutes > 60) importance += 0.1;
  
  return Math.min(1.0, Math.max(0.1, importance));
}

/**
 * Get default stability period for a memory kind
 */
export function getDefaultStability(kind: string): number {
  return MEMORY_STABILITY_PERIODS[kind] ?? MEMORY_STABILITY_PERIODS['fact'];
}

/**
 * Get default importance for a memory kind
 */
export function getDefaultImportance(kind: string): number {
  return MEMORY_DEFAULT_IMPORTANCE[kind] ?? MEMORY_DEFAULT_IMPORTANCE['fact'];
}

/**
 * Get default emotion values for a memory kind
 */
export function getDefaultEmotion(kind: string): { valence: number; arousal: number } {
  return MEMORY_DEFAULT_EMOTION[kind] ?? MEMORY_DEFAULT_EMOTION['fact'];
}

/**
 * Get memory kind from source tag
 * Helps infer the kind for auto-generated memories
 */
export function inferMemoryKind(source: string, kind?: string): string {
  // Explicit kind takes precedence
  if (kind && MEMORY_STABILITY_PERIODS[kind]) {
    return kind;
  }
  
  // Infer from source
  if (source === 'auto-conversation-end') return 'conversation-summary';
  if (source === 'auto-consolidation') return 'fact';
  if (source === 'skill') return 'skill_learned';
  
  return 'fact';
}
