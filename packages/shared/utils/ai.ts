import type { AITagConfig } from 'types/config'

export type GenerateTagProps = {
  title: string
  pageDesc: string
} & AITagConfig

interface GenerateTagResponse {
  choices: [
    {
      message: {
        content: string
        role: string
      }
    },
  ]
  created: number
  id: string
  model: string
  usage: {
    completion_tokens: number
    prompt_tokens: number
    total_tokens: number
  }
}

export function buildGenerateTagMessage(props: {
  title: string
  pageDesc: string
  tagLanguage: string
  preferredTags: string[]
}) {
  return [
    {
      role: 'system' as const,
      content: generateChatCompletion(props.tagLanguage, props.preferredTags),
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        title: props.title,
        pageDesc: props.pageDesc,
      }),
    },
  ]
}

function generateChatCompletion(tagLanguage: string, preferredTags: string[]): string {
  return `What tags would you give to the input content? Please follow these rules:
    1. Use ${tagLanguage === 'zh' ? 'chinese' : 'english'} for most tags
    2. Keep common technical terms and abbreviations as-is
    3. Keep brand names in their original form
    4. Note that tags should be keywords related to the content, not explanations of the content
    5. Return format must be: {"tags": ["tag1", "tag2", ...]}
    6. Do not return any explanatory text
    7. Please prioritize these tags and add other relevant tags based on the content: [${preferredTags.join(', ')}]
    8. Keep tags concise and focused. Return no more than 5 tags in total
    9. Select the most representative and important tags only
  `
}

// Different OpenAI-compatible providers return the JSON payload in slightly
// different shapes: some honour the prompt and emit raw JSON, others wrap it in
// a ```json ... ``` markdown fence or prepend a sentence of prose. Extract the
// first balanced JSON object so any reasonable model works.
function extractJsonObject(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const text = (fenced ? fenced[1] : content).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1)
  }
  return text
}

export async function generateTagByOpenAI(props: GenerateTagProps): Promise<Array<string>> {
  if (props.type !== 'openai') {
    throw new Error('Invalid AI tag config')
  }
  const res = await fetch(props.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${props.apiKey}`,
    },
    body: JSON.stringify({
      messages: buildGenerateTagMessage(props),
      model: props.model,
    }),
  })

  if (!res.ok) {
    // Error envelopes vary across providers ({error:{message}}, {error:"..."},
    // {message:"..."} or plain text); fall back gracefully instead of throwing
    // on an unexpected shape.
    let message = `Request failed with status ${res.status}`
    try {
      const content = await res.json() as { error?: { message?: string } | string, message?: string }
      const errMessage = typeof content.error === 'string' ? content.error : content.error?.message
      message = errMessage ?? content.message ?? message
    }
    catch {
      const text = await res.text().catch(() => '')
      if (text)
        message = text
    }
    throw new Error(message)
  }

  try {
    const data = await res.json() as GenerateTagResponse
    const content = data.choices[0].message.content
    const tagJson = JSON.parse(extractJsonObject(content))
    return tagJson.tags.slice(0, 5)
  }
  catch (error) {
    throw new Error('Failed to parse response, please try again or change model')
  }
}
