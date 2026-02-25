const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

export const BOARD_CATEGORIES = ['문의', '자유', '꿀팁', '피드백'] as const
export type BoardCategory = (typeof BOARD_CATEGORIES)[number]

export type BoardPost = {
  id: string
  author_id: string
  author_nickname: string
  category: BoardCategory
  title: string
  content: string
  is_notice: boolean
  created_at: string
  updated_at: string
}

export type BoardPostListResponse = {
  page: number
  page_size: number
  total: number
  items: BoardPost[]
}

type CreatePayload = {
  category: BoardCategory
  title: string
  content: string
  is_notice: boolean
}

type UpdatePayload = Partial<CreatePayload>

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string }
    if (data.detail && typeof data.detail === 'string') return data.detail
  } catch {
    // ignore
  }
  return `HTTP ${response.status}`
}

export async function fetchBoardPosts(params: {
  page: number
  pageSize: number
  q?: string
  category?: BoardCategory | ''
}): Promise<BoardPostListResponse> {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page))
  qs.set('page_size', String(params.pageSize))
  if (params.q && params.q.trim()) qs.set('q', params.q.trim())
  if (params.category) qs.set('category', params.category)
  const response = await fetch(`${API_BASE}/board/posts?${qs.toString()}`)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardPostListResponse
}

export async function createBoardPost(token: string, payload: CreatePayload): Promise<BoardPost> {
  const response = await fetch(`${API_BASE}/board/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardPost
}

export async function updateBoardPost(token: string, postId: string, payload: UpdatePayload): Promise<BoardPost> {
  const response = await fetch(`${API_BASE}/board/posts/${postId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
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
