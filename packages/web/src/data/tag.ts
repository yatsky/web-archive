import type { Tag } from '@web-archive/shared/types'
import fetcher from '~/utils/fetcher'

function getAllTag(): Promise<Tag[]> {
  return fetcher<Tag[]>('/tags/all', {
    method: 'GET',
  })
}

function deleteTag(tagId: number): Promise<void> {
  return fetcher<void>(`/tags/delete`, {
    method: 'DELETE',
    query: { id: tagId.toString() },
  })
}

function updateTag(body: { id: number, name: string }): Promise<void> {
  return fetcher<void>(`/tags/update`, {
    method: 'POST',
    body,
  })
}

function generateTag(body: { title: string, pageDesc: string, model: string, preferredTags: string[], tagLanguage: string, type?: 'cloudflare' | 'openai', apiUrl?: string, apiKey?: string }): Promise<string[]> {
  return fetcher<string[]>('/tags/generate_tag', {
    method: 'POST',
    body,
  })
}

export {
  getAllTag,
  deleteTag,
  updateTag,
  generateTag,
}
