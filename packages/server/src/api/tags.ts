import { buildGenerateTagMessage, generateTagByOpenAI, isNil, isNumberString } from '@web-archive/shared/utils'
import type { AITagConfig } from '@web-archive/shared/types'
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import type { HonoTypeUserInformation } from '~/constants/binding'
import { deleteTagById, insertTag, selectAllTags, updateTag } from '~/model/tag'
import { getAITagConfig } from '~/model/store'
import result from '~/utils/result'

const app = new Hono<HonoTypeUserInformation>()

app.get('/all', async (c) => {
  const tags = await selectAllTags(c.env.DB)

  return c.json(result.success(tags))
})

app.post(
  '/create',
  validator('json', (value, c) => {
    if (isNil(value.name) || typeof value.name !== 'string') {
      return c.json(result.error(400, 'Name is required'))
    }
    // todo check color type?
    return {
      name: value.name as string,
      color: value.color,
    }
  }),
  async (c) => {
    const { name, color = '#ffffff' } = c.req.valid('json')

    if (await insertTag(c.env.DB, { name, color })) {
      return c.json(result.success(true))
    }

    return c.json(result.error(500, 'Failed to create tag'))
  },
)

app.post(
  '/update',
  validator('json', (value, c) => {
    if (isNil(value.id) || !isNumberString(value.id)) {
      return c.json(result.error(400, 'ID is required'))
    }
    if (isNil(value.name) && isNil(value.color)) {
      return c.json(result.error(400, 'At least one field is required'))
    }

    return {
      id: Number(value.id),
      name: value.name,
      color: value.color,
    }
  }),
  async (c) => {
    const { id, name, color } = c.req.valid('json')

    if (await updateTag(c.env.DB, { id, name, color })) {
      return c.json(result.success(true))
    }

    return c.json(result.error(500, 'Failed to update tag'))
  },
)

app.delete(
  '/delete',
  validator('query', (value, c) => {
    if (isNil(value.id) || !isNumberString(value.id)) {
      return c.json(result.error(400, 'ID is required'))
    }
    return {
      id: Number(value.id),
    }
  }),
  async (c) => {
    const { id } = c.req.valid('query')

    if (await deleteTagById(c.env.DB, id)) {
      return c.json(result.success(true))
    }

    return c.json(result.error(500, 'Failed to delete tag'))
  },
)

app.post(
  '/generate_tag',
  validator('json', (value, c) => {
    const schema = z.object({
      title: z.string({ message: 'Title is required' }).min(1, { message: 'Title is required' }),
      pageDesc: z.string().default(''),
      // Optional inline config override. The settings "test connection" button
      // sends the unsaved form values here (including `type`). When `type` is
      // omitted we fall back to the saved config in the database — that is the
      // path the browser extension and auto-tagging take, so credentials for
      // OpenAI-compatible endpoints never have to leave the server.
      type: z.enum(['cloudflare', 'openai']).optional(),
      model: z.string().optional(),
      tagLanguage: z.enum(['en', 'zh']).optional(),
      preferredTags: z.array(z.string()).optional(),
      apiUrl: z.string().optional(),
      apiKey: z.string().optional(),
    })
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      if (parsed.error.errors.length > 0) {
        return c.json(result.error(400, parsed.error.errors[0].message))
      }
      return c.json(result.error(400, 'Invalid request'))
    }
    return parsed.data
  }),
  async (c) => {
    const body = c.req.valid('json')
    const { title, pageDesc } = body

    // Resolve the effective AI config: inline override (test connection) wins,
    // otherwise read the saved config from the database.
    let config: AITagConfig
    if (body.type) {
      config = { ...body, type: body.type } as AITagConfig
    }
    else {
      try {
        config = await getAITagConfig(c.env.DB)
      }
      catch (error) {
        return c.json(result.error(500, 'Failed to load AI tag config'))
      }
    }

    const tagLanguage = config.tagLanguage ?? 'en'
    const preferredTags = config.preferredTags ?? []

    if (!config.model) {
      return c.json(result.error(400, 'Model name is required'))
    }

    try {
      // OpenAI-compatible endpoint: call it server-side so it works behind the
      // gateway (no browser CORS) and the API key stays on the server.
      if (config.type === 'openai') {
        if (!config.apiUrl || !config.apiKey) {
          return c.json(result.error(400, 'API URL and API Key are required'))
        }
        const tags = await generateTagByOpenAI({
          title,
          pageDesc,
          type: 'openai',
          model: config.model,
          tagLanguage,
          preferredTags,
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
        })
        return c.json(result.success(tags))
      }

      // Cloudflare Workers AI binding (only available on Cloudflare deployments).
      if (!c.env.AI) {
        return c.json(result.error(400, 'Cloudflare AI binding is not available in this deployment. Switch the AI service type to OpenAI.'))
      }
      const res = await c.env.AI.run(
        // @ts-expect-error use BaseAiTextGenerationModels to check model? or use type assertion?
        config.model,
        {
          messages: buildGenerateTagMessage({ title, pageDesc, tagLanguage, preferredTags }),
        },
      )

      try {
        if (res instanceof ReadableStream) {
          throw new TypeError('Failed to parse response stream')
        }
        if (res.response === undefined) {
          throw new TypeError('Failed to parse response, please try again or change model')
        }
        const { tags } = JSON.parse(res.response)
        return c.json(result.success(tags.slice(0, 5)))
      }
      catch (error) {
        console.log(res)
        return c.json(result.error(500, 'Failed to parse response, please try again or change model'))
      }
    }
    catch (error) {
      if (error instanceof Error) {
        return c.json(result.error(500, error.message))
      }
      return c.json(result.error(500, 'Failed to generate tags'))
    }
  },
)

export default app
