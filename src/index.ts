import { Context, Schema, Service } from 'koishi'
import type {} from 'koishi-plugin-rasa-nlu'

export const name = 'rasa-nlg-dict'

export const using = ['rasanlu'] as const

export interface Config {
  dictionary: Record<string, string>
  command: {
    enabled: boolean
  }
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    dictionary: Schema.dict(String)
      .required()
      .description('语料字典。键为意图，值为生成的语料。'),
  }).description('字典'),
  Schema.object({
    command: Schema.object({
      enabled: Schema.boolean().default(false).description('启用 nlg 指令。'),
    }),
  }).description('指令'),
])

declare module 'koishi' {
  interface Context {
    rasanlg: RasaNLG
  }
}

class RasaNLG extends Service {
  constructor(ctx: Context, config: Config) {
    super(ctx, 'rasanlg', true)
    this.#config = config
  }

  #config: Config

  async generate(text: string): Promise<string | undefined> {
    const nluData = await this.ctx.rasanlu.parse(text)
    if (!hasIntent(nluData)) return
    return this.#config.dictionary[nluData.intent.name]
  }

  async generateCandidates(
    text: string
  ): Promise<{ intent: string; confidence: number; response: string }[]> {
    const nluData = await this.ctx.rasanlu.parse(text)

    const result: { intent: string; confidence: number; response: string }[] =
      []

    if (!hasIntentRanking(nluData)) return result

    for (const candidate of nluData.intent_ranking) {
      const response = this.#config.dictionary[candidate.name]
      if (response)
        result.push({
          intent: candidate.name,
          confidence: candidate.confidence,
          response,
        })
    }

    return result
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.plugin(RasaNLG, config)

  if (config.command.enabled) {
    ctx
      .command('nlg <text>', '生成应答文本', { authority: 2 })
      .action(async (_, text) => {
        const candidates = await ctx.rasanlg.generateCandidates(text)

        return candidates
          .map(
            (x) =>
              `回复：${x.response}\n意图：${x.intent}\n置信度：${x.confidence}`
          )
          .join('\n-----\n')
      })
  }
}

function hasIntent(
  nlu: unknown
): nlu is { intent: { name: string; confidence: number } } {
  return (nlu as { intent: { name: string; confidence: number } }).intent
    .name as unknown as boolean
}

function hasIntentRanking(
  nlu: unknown
): nlu is { intent_ranking: { name: string; confidence: number }[] } {
  return (nlu as { intent_ranking: { name: string; confidence: number }[] })
    .intent_ranking.length as unknown as boolean
}
