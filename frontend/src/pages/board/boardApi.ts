const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

export const BOARD_CATEGORIES = ['문의', '자유', '꿀팁', '피드백'] as const
export type BoardCategory = (typeof BOARD_CATEGORIES)[number]

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
  category: BoardCategory
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
  category: BoardCategory
  title: string
  content: string
  is_notice: boolean
  is_private: boolean
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

export async function fetchBoardPostDetail(postId: string): Promise<BoardPostDetail> {
  const response = await fetch(`${API_BASE}/board/posts/${postId}`)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as BoardPostDetail
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
