export type UsageLimit = { kind: string; percent: number; resetsAt?: string }

export type UsageView = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: UsageLimit[]
  costUsd?: number
}

export type SkillRank = { skill: string; count: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: UsageView | null; isHidden: boolean; skillRanking: SkillRank[] }
  }
}
