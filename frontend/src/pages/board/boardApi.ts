const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

export const BOARD_CATEGORIES = ['문의', '자유', '꿀팁', '피드백'] as const
export type BoardCategory = (typeof BOARD_CATEGORIES)[number]
export type BoardCategoryApi = BoardCategory | '질문'

export type BoardComment = {
  id: string
  post_id: string
  author_id: string
  author_nickname: string
  content: string
  created_at: string
}

export type BoardPost = {
  id: string
  author_id: string
  author_nickname: string
  category: BoardCategoryApi
  title: string
  content: string
  is_notice: boolean
  is_private: boolean
  likes_count: number
  bookmarks_count: number
  comments_count: number
  liked_by_me: boolean
  bookmarked_by_me: boolean
  created_at: string
  updated_at: string
}

export type BoardPostDetail = BoardPost & {
  comments: BoardComment[]
}

export type BoardPostListResponse = {
  page: number
  page_size: number
  total: number
  items: BoardPost[]
}

type CreatePayload = {
  category: BoardCategoryApi
  title: string
  content: string
  is_notice: boolean
  is_private: boolean
}

type UpdatePayload = Partial<CreatePayload>

type BoardErrorPayload = {
  detail?: string | Array<{ msg?: string }> | Record<string, unknown>
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as BoardErrorPayload
    if (typeof data.detail === 'string' && data.detail.trim()) return data.detail
    if (Array.isArray(data.detail)) {
      const msgs = data.detail.map((x) => String(x.msg ?? '').trim()).filter(Boolean)
      if (msgs.length) return msgs.join('; ')
    }
    if (data.detail && typeof data.detail === 'object') return JSON.stringify(data.detail)
  } catch {
    // ignore
  }
  return `HTTP ${response.status}`
}

async function fetchBoardListWithCategory(
  params: { page: number; pageSize: number; q?: string; token?: string },
  category?: string,
): Promise<Response> {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page))
  qs.set('page_size', String(params.pageSize))
  if (params.q && params.q.trim()) qs.set('q', params.q.trim())
  if (category) qs.set('category', category)
  return fetch(`${API_BASE}/board/posts?${qs.toString()}`, {
    headers: params.token ? { Authorization: `Bearer ${params.token}` } : undefined,
  })
}

export async function fetchBoardPosts(params: {
  page: number
  pageSize: number
  q?: string
  category?: BoardCategory | ''
  token?: string
}): Promise<BoardPostListResponse> {
  let response = await fetchBoardListWithCategory(params, params.category || undefined)
  if (!response.ok && params.category === '문의') {
    // 구버전 백엔드/DB(enum: 질문) 호환
    response = await fetchBoardListWithCategory(params, '질문')
  }
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardPostListResponse
}

export async function fetchBoardPostDetail(postId: string, token?: string): Promise<BoardPostDetail> {
  const response = await fetch(`${API_BASE}/board/posts/${postId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardPostDetail
}

async function tryWriteWithFallbacks(
  method: 'POST' | 'PATCH',
  url: string,
  token: string,
  payload: CreatePayload | UpdatePayload,
): Promise<Response> {
  const variants: Array<CreatePayload | UpdatePayload> = [payload]

  const withLegacyInquiry = (p: CreatePayload | UpdatePayload) => {
    if (p.category !== '문의') return null
    return { ...p, category: '질문' as const }
  }

  const withoutPrivate = (p: CreatePayload | UpdatePayload) => {
    if (!Object.prototype.hasOwnProperty.call(p, 'is_private')) return null
    const clone = { ...p }
    delete (clone as { is_private?: boolean }).is_private
    return clone
  }

  const v2 = withLegacyInquiry(payload)
  if (v2) variants.push(v2)

  const v3 = withoutPrivate(payload)
  if (v3) variants.push(v3)

  const v4 = v3 ? withLegacyInquiry(v3) : null
  if (v4) variants.push(v4)

  const deduped = new Map<string, CreatePayload | UpdatePayload>()
  for (const v of variants) deduped.set(JSON.stringify(v), v)

  let lastResponse: Response | null = null
  for (const bodyPayload of deduped.values()) {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    })
    if (response.ok) return response
    lastResponse = response

    // 4xx(422/400) 및 5xx에서만 호환 시도 계속
    if (![400, 422, 500].includes(response.status)) break
  }

  return lastResponse as Response
}

export async function createBoardPost(token: string, payload: CreatePayload): Promise<BoardPost> {
  const response = await tryWriteWithFallbacks('POST', `${API_BASE}/board/posts`, token, payload)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardPost
}

export async function updateBoardPost(token: string, postId: string, payload: UpdatePayload): Promise<BoardPost> {
  const response = await tryWriteWithFallbacks('PATCH', `${API_BASE}/board/posts/${postId}`, token, payload)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardPost
}

export async function deleteBoardPost(token: string, postId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/board/posts/${postId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(await readError(response))
}

export async function createBoardComment(token: string, postId: string, content: string): Promise<BoardComment> {
  const response = await fetch(`${API_BASE}/board/posts/${postId}/comments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardComment
}

export async function toggleBoardLike(token: string, postId: string): Promise<{ active: boolean; count: number }> {
  const response = await fetch(`${API_BASE}/board/posts/${postId}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as { active: boolean; count: number }
}

export async function toggleBoardBookmark(token: string, postId: string): Promise<{ active: boolean; count: number }> {
  const response = await fetch(`${API_BASE}/board/posts/${postId}/bookmark`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as { active: boolean; count: number }
}
