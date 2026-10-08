import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 1 },
    view: {},
  },
} as const

test('the band draws usage bars and the skill ranking, and hides', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 84_000, window: 200_000, percent: 40 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 25 },
        { kind: 'seven_day', percentUsed: 85 },
      ],
      cost: { usd: 1.234 },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  mock.store(on, { skillHistory: ['gen-doc', 'plugin-authoring', 'gen-doc', 'simplify', 'plugin-authoring', 'gen-doc'] })
  // Stands in for the engine's own (empty) band once the plugin yields
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 (1M)   ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Context ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '█'.repeat(4) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '░'.repeat(6) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /84k\/200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /85%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Skills  ' })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: /^\d\.$/ })).toHaveLength(3)
    expect(await ui.find({ type: 'Text', text: '×3   ' })).toBeDefined()
    // Two lines: the usage bars side by side, then the ranking side by side
    expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { backgroundColor: '#000000' }, children: [{ type: 'Box' }, { type: 'Box' }] })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
  await ui.unmount()
})
