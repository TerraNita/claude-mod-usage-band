import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMeasureInput } from 'claude-code'

import type { SkillRank, UsageLimit, UsageView } from '../types'

const COMMAND = 'usage-band'
const HISTORY_KEY = 'skillHistory'
const HISTORY_SIZE = 100
const RANKING_SIZE = 5
const BAR_WIDTH = 10
const BACKGROUND_COLOR = '#000000'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)
const skillRanking = atom({ plugin: 'usage-band', key: 'skillRanking' } as const, [])

const LIMIT_LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'Spend',
}

/**
 * Converts the engine's usage figures into the values the band draws.
 * @param measure context, rate limits and cost as the engine reports them
 * @return the band's view of the usage
 */
const toView = (measure: Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>): UsageView => ({
  contextPercent: measure.context.percent,
  contextTokens: measure.context.tokens,
  contextWindow: measure.context.window,
  limits: measure.rateLimits.map(limit => ({
    kind: limit.kind,
    percent: limit.percentUsed,
    resetsAt: limit.resetsAt,
  })),
  costUsd: measure.cost?.usd,
})

/**
 * Counts the skill history and returns the most used skills, the more recent first on ties.
 * @param history skill names, oldest first
 * @return the top skills with their use counts
 */
const rankSkills = (history: string[]): SkillRank[] => {
  const countMap = new Map<string, number>()
  history.forEach(skill => countMap.set(skill, (countMap.get(skill) ?? 0) + 1))
  const recency = [...history].reverse()

  return [...countMap.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || recency.indexOf(a.skill) - recency.indexOf(b.skill))
    .slice(0, RANKING_SIZE)
}

/**
 * Reads the stored skill history.
 * @param $ the engine interface
 * @return skill names, oldest first
 */
const readHistory = async ($: EngineInterface): Promise<string[]> => {
  const stored = await $.store.get(HISTORY_KEY)

  return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
}

/**
 * Formats a token count in thousands (84000 -> "84k").
 * @param tokens token count
 * @return the shortened text
 */
const formatTokens = (tokens: number): string =>
  tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M` : `${Math.round(tokens / 1000)}k`

/**
 * Formats an ISO timestamp as local time (HH:mm), with the date when it is not today.
 * @param iso ISO 8601 timestamp
 * @return the formatted time
 */
const formatReset = (iso: string): string => {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const isToday = date.toDateString() === new Date().toDateString()

  return isToday ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`
}

/**
 * Picks the bar colour for a percentage.
 * @param percent usage percentage
 * @return a colour name
 */
const colorOf = (percent: number): string => (percent >= 95 ? 'red' : percent >= 80 ? 'yellow' : 'green')

/**
 * Splits a percentage into the filled and empty parts of a text bar.
 * @param percent usage percentage, clamped to 0 to 100
 * @return the filled and empty strings
 */
const barParts = (percent: number): { filled: string; empty: string } => {
  const filledCount = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * BAR_WIDTH)

  return { filled: '█'.repeat(filledCount), empty: '░'.repeat(BAR_WIDTH - filledCount) }
}

/**
 * Builds the label of one rate-limit window ("5h").
 * @param limit the rate-limit window
 * @return the label text
 */
const limitLabel = (limit: UsageLimit): string => LIMIT_LABELS[limit.kind] ?? limit.kind

/**
 * Shortens a model id for display ("claude-opus-5-5[1m]" -> "Opus 5.5 (1M)"); other names pass through.
 * @param model the model as `/model` shows it
 * @return the display name
 */
const formatModel = (model: string): string => {
  const matched = /^claude-([a-z]+)-(\d+)-(\d+)(\[1m\])?/i.exec(model)
  if (!matched) {
    return model
  }
  const [, family = '', major, minor, longContext] = matched

  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}${longContext ? ' (1M)' : ''}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the usage band above the prompt',
    })
    const history = await readHistory($)
    await update($, skillRanking, () => rankSkills(history))

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const isNowHidden = await update($, isHidden, value => !value)

    return { text: isNowHidden ? 'Usage band hidden.' : 'Usage band shown.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toView(e))

    return next(e)
  })

  // Every skill use (typed as /name or called through the Skill tool) goes into the history
  on('skill.prompt', async ($, e, next) => {
    const history = [...(await readHistory($)), e.skill].slice(-HISTORY_SIZE)
    await $.store.set(HISTORY_KEY, history)
    await update($, skillRanking, () => rankSkills(history))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    // Before the first measurement (or after a reload) read the figures directly
    const view = (await read($, usage)) ?? toView(await $.session.usage())
    const storedRanking = await read($, skillRanking)
    const ranking = storedRanking.length > 0 ? storedRanking : rankSkills(await readHistory($))
    const model = formatModel(await $.session.model())
    const { Box, Button, Text } = $.ui.resolve(e)

    /**
     * Draws one labelled progress bar as a segment of the usage line.
     * @param label segment label
     * @param percent usage percentage, or undefined when not measured yet
     * @param detail text after the percentage
     * @return the segment element
     */
    const barSegment = (label: string, percent: number | undefined, detail: string) => {
      const { filled, empty } = barParts(percent ?? 0)
      const percentText = percent === undefined ? '--' : `${percent}%`

      return (
        <Box flexDirection="row">
          <Text bold>{`${label} `}</Text>
          <Text color={colorOf(percent ?? 0)}>{filled}</Text>
          <Text dimColor>{empty}</Text>
          <Text>{` ${percentText}`}</Text>
          <Text dimColor>{detail ? ` ${detail}   ` : '   '}</Text>
        </Box>
      )
    }

    const contextDetail =
      view.contextTokens === undefined
        ? formatTokens(view.contextWindow)
        : `${formatTokens(view.contextTokens)}/${formatTokens(view.contextWindow)}`

    // Two lines at most: the usage bars side by side, then the skill ranking side by side
    return (
      <Box flexDirection="column" backgroundColor={BACKGROUND_COLOR}>
        <Box flexDirection="row">
          <Text bold color="cyan">{`${model}   `}</Text>
          {barSegment('Context', view.contextPercent, contextDetail)}
          {view.limits.map(limit =>
            barSegment(limitLabel(limit), limit.percent, limit.resetsAt ? `(${formatReset(limit.resetsAt)})` : ''),
          )}
          {view.costUsd !== undefined && <Text dimColor>{`$${view.costUsd.toFixed(2)}   `}</Text>}
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        {ranking.length > 0 && (
          <Box flexDirection="row">
            <Text bold>{'Skills  '}</Text>
            {ranking.map((rank, index) => (
              <Box flexDirection="row">
                <Text color={index === 0 ? 'yellow' : undefined}>{`${index + 1}.`}</Text>
                <Text>{rank.skill}</Text>
                <Text dimColor>{`×${rank.count}   `}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
