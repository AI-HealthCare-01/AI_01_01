import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './BoardPage.css'
import {
  BOARD_CATEGORIES,
  type BoardCategory,
  type BoardPost,
  createBoardPost,
  deleteBoardPost,
  fetchBoardPosts,
  updateBoardPost,
} from './boardApi'

type BoardPageProps = {
  token: string
  myUserId: string | null
  isAdmin: boolean
}

type CategoryInput = '' | BoardCategory | '공지'
type SortMode = 'latest' | 'popular'
type CommentItem = { id: string; author: string; text: string; createdAt: string }

const PAGE_SIZE = 10

function hashToNumber(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

function formatDate(input: string) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return d.toLocaleString('ko-KR')
}

export default function BoardPage({ token, myUserId, isAdmin }: BoardPageProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<BoardCategory | ''>('')
  const [sortMode, setSortMode] = useState<SortMode>('latest')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [likedPostIds, setLikedPostIds] = useState<Record<string, boolean>>({})
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<Record<string, boolean>>({})
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentItem[]>>({})
  const [commentInput, setCommentInput] = useState('')

  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryInput, setCategoryInput] = useState<CategoryInput>('')

  async function loadPosts(nextPage = page) {
    setLoading(true)
    try {
      const data = await fetchBoardPosts({ page: nextPage, pageSize: PAGE_SIZE, q, category: categoryFilter })
      setPosts(data.items)
      setTotal(data.total)
      setPage(data.page)
      if (data.items.length > 0 && !selectedId) setSelectedId(data.items[0].id)
      if (data.items.length === 0) setSelectedId(null)
    } catch (error) {
      setMessage(`게시글 조회 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPosts(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const selected = useMemo(() => posts.find((p) => p.id === selectedId) ?? null, [posts, selectedId])

  const noticePost = useMemo(() => posts.find((p) => p.is_notice) ?? null, [posts])

  const regularPosts = useMemo(() => {
    const rows = posts.filter((p) => !p.is_notice)
    return [...rows].sort((a, b) => {
      if (sortMode === 'latest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      const aScore = hashToNumber(a.id) % 80
      const bScore = hashToNumber(b.id) % 80
      return bScore - aScore
    })
  }, [posts, sortMode])

  function postStats(postId: string) {
    const base = hashToNumber(postId)
    const liked = likedPostIds[postId] ? 1 : 0
    const comments = commentsByPost[postId]?.length ?? 0
    return {
      likes: (base % 60) + liked,
      commentCount: (base % 20) + comments,
    }
  }

  function resetForm() {
    setEditId(null)
    setTitle('')
    setContent('')
    setCategoryInput('')
  }

  function startEdit(post: BoardPost) {
    setEditId(post.id)
    setTitle(post.title)
    setContent(post.content)
    setCategoryInput(post.is_notice ? '공지' : post.category)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setMessage('로그인 후 글 작성이 가능합니다.')
      return
    }
    if (categoryInput === '') {
      setMessage('카테고리를 선택하세요.')
      return
    }
    const category = categoryInput === '공지' ? '문의' : categoryInput
    const isNotice = categoryInput === '공지'

    setLoading(true)
    try {
      if (editId) {
        const updated = await updateBoardPost(token, editId, { title, content, category, is_notice: isNotice })
        setMessage('게시글이 수정되었습니다.')
        setSelectedId(updated.id)
      } else {
        const created = await createBoardPost(token, { title, content, category, is_notice: isNotice })
        setMessage('게시글이 등록되었습니다.')
        setSelectedId(created.id)
      }
      resetForm()
      await loadPosts(1)
    } catch (error) {
      setMessage(`저장 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(postId: string) {
    if (!token) {
      setMessage('로그인 후 삭제할 수 있습니다.')
      return
    }
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    setLoading(true)
    try {
      await deleteBoardPost(token, postId)
      setMessage('게시글이 삭제되었습니다.')
      if (selectedId === postId) setSelectedId(null)
      await loadPosts(1)
      resetForm()
    } catch (error) {
      setMessage(`삭제 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function handleToggleLike(postId: string) {
    setLikedPostIds((prev) => ({ ...prev, [postId]: !prev[postId] }))
  }

  function handleToggleBookmark(postId: string) {
    setBookmarkedPostIds((prev) => ({ ...prev, [postId]: !prev[postId] }))
  }

  function handleAddComment(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const text = commentInput.trim()
    if (!text) return
    const next: CommentItem = {
      id: crypto.randomUUID(),
      author: token ? '나' : '게스트',
      text,
      createdAt: new Date().toISOString(),
    }
    setCommentsByPost((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), next] }))
    setCommentInput('')
  }

  return (
    <section className="boardV2">
      <header className="boardV2Head">
        <div>
          <h2>커뮤니티 게시판</h2>
          <p>서로의 따뜻한 마음을 나누는 공간입니다.</p>
        </div>
        <div className="boardV2Controls">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색어를 입력하세요" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as BoardCategory | '')}>
            <option value="">전체</option>
            {BOARD_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" onClick={() => void loadPosts(1)} disabled={loading}>{loading ? '로딩...' : '검색'}</button>
        </div>
      </header>

      {noticePost && (
        <article className="boardNotice">
          <div>
            <span className="tag">NOTICE</span>
            <strong>{noticePost.title}</strong>
            <p>{noticePost.content.slice(0, 90)}{noticePost.content.length > 90 ? '...' : ''}</p>
            <small>운영자 · {formatDate(noticePost.created_at)}</small>
          </div>
          <button type="button" onClick={() => setSelectedId(noticePost.id)}>더보기 →</button>
        </article>
      )}

      <div className="boardSortRow">
        <button type="button" className={sortMode === 'latest' ? 'active' : ''} onClick={() => setSortMode('latest')}>최신순</button>
        <button type="button" className={sortMode === 'popular' ? 'active' : ''} onClick={() => setSortMode('popular')}>인기순</button>
      </div>

      <section className="boardListCard">
        {regularPosts.map((post) => {
          const stats = postStats(post.id)
          return (
            <button
              key={post.id}
              type="button"
              className={`boardListRow ${selectedId === post.id ? 'active' : ''}`}
              onClick={() => setSelectedId(post.id)}
            >
              <div className="left">
                <strong>{post.title}</strong>
                <p>{post.author_nickname} · {formatDate(post.created_at)}</p>
              </div>
              <div className="right">
                <span>♥ {stats.likes}</span>
                <span>💬 {stats.commentCount}</span>
              </div>
            </button>
          )
        })}

        {regularPosts.length === 0 && <p className="muted">게시글이 없습니다.</p>}

        <div className="boardPager">
          <button type="button" className="ghost" disabled={loading || page <= 1} onClick={() => void loadPosts(page - 1)}>이전</button>
          <span>{page} / {totalPages}</span>
          <button type="button" className="ghost" disabled={loading || page >= totalPages} onClick={() => void loadPosts(page + 1)}>더보기</button>
        </div>
      </section>

      <section className="boardDetailCard">
        <h3>게시물 상세</h3>
        {!selected ? (
          <p className="muted">목록에서 게시글을 선택하세요.</p>
        ) : (
          <>
            <article className="detailPost">
              <strong>{selected.title}</strong>
              <p className="meta">{selected.author_nickname} · {formatDate(selected.created_at)} · {selected.is_notice ? '공지' : selected.category}</p>
              <pre>{selected.content}</pre>
              <div className="postActions">
                <button type="button" className={likedPostIds[selected.id] ? 'active' : ''} onClick={() => handleToggleLike(selected.id)}>
                  좋아요
                </button>
                <button type="button" className={bookmarkedPostIds[selected.id] ? 'active' : ''} onClick={() => handleToggleBookmark(selected.id)}>
                  북마크
                </button>
                {(myUserId === selected.author_id || isAdmin) && (
                  <>
                    <button type="button" onClick={() => startEdit(selected)}>수정</button>
                    <button type="button" onClick={() => void handleDelete(selected.id)}>삭제</button>
                  </>
                )}
              </div>
            </article>

            <article className="comments">
              <h4>댓글</h4>
              <ul>
                {(commentsByPost[selected.id] ?? []).map((comment) => (
                  <li key={comment.id}>
                    <strong>{comment.author}</strong>
                    <span>{formatDate(comment.createdAt)}</span>
                    <p>{comment.text}</p>
                  </li>
                ))}
                {(commentsByPost[selected.id] ?? []).length === 0 && <li className="muted">아직 댓글이 없습니다.</li>}
              </ul>
              <form onSubmit={handleAddComment} className="commentForm">
                <input
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="댓글을 입력하세요"
                />
                <button type="submit">등록</button>
              </form>
            </article>
          </>
        )}
      </section>

      <section className="boardEditorCard">
        <h3>{editId ? '글 수정' : '글 작성'}</h3>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            카테고리
            <select value={categoryInput} onChange={(e) => setCategoryInput(e.target.value as CategoryInput)} required>
              <option value="">카테고리를 선택하세요</option>
              {BOARD_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              {isAdmin && <option value="공지">공지</option>}
            </select>
          </label>
          <label>
            제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            본문
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} required />
          </label>
          <div className="actions">
            <button disabled={loading || !token}>{editId ? '수정 저장' : '게시글 등록'}</button>
            <button type="button" className="ghost" onClick={resetForm}>초기화</button>
          </div>
        </form>
      </section>

      {message && <p className="boardMsg">{message}</p>}
    </section>
  )
}
