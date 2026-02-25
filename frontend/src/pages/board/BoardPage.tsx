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

const PAGE_SIZE = 10
type CategoryInput = '' | BoardCategory | '공지'

export default function BoardPage({ token, myUserId, isAdmin }: BoardPageProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<BoardCategory | ''>('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryInput, setCategoryInput] = useState<CategoryInput>('')

  const selected = useMemo(() => posts.find((p) => p.id === selectedId) ?? null, [posts, selectedId])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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

  return (
    <section className="boardPage panel">
      <h2>게시판</h2>
      <p className="small">공지/문의/자유/꿀팁/피드백을 한 곳에서 관리합니다.</p>

      <div className="boardToolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목/내용 검색" />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as BoardCategory | '')}>
          <option value="">전체 카테고리</option>
          {BOARD_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" disabled={loading} onClick={() => void loadPosts(1)}>검색</button>
      </div>

      <div className="boardLayout">
        <article className="boardList">
          {posts.length === 0 && <p className="small">게시글이 없습니다.</p>}
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              className={`boardRow ${selectedId === post.id ? 'active' : ''}`}
              onClick={() => setSelectedId(post.id)}
            >
              <span className="boardRowTop">
                {post.is_notice && <em className="noticeTag">공지</em>}
                <strong>{post.title}</strong>
              </span>
              <span className="boardMeta">
                {post.is_notice ? '공지' : post.category} · {post.author_nickname} · {new Date(post.created_at).toLocaleString('ko-KR')}
              </span>
            </button>
          ))}
          <div className="boardPager">
            <button type="button" className="ghost" disabled={loading || page <= 1} onClick={() => void loadPosts(page - 1)}>이전</button>
            <span>{page} / {totalPages}</span>
            <button type="button" className="ghost" disabled={loading || page >= totalPages} onClick={() => void loadPosts(page + 1)}>다음</button>
          </div>
        </article>

        <article className="boardDetail">
          {selected ? (
            <>
              <h3>{selected.title}</h3>
              <p className="small">
                {(selected.is_notice ? '공지' : selected.category)} · {selected.author_nickname} · {new Date(selected.created_at).toLocaleString('ko-KR')}
              </p>
              <pre className="boardContent">{selected.content}</pre>
              {(myUserId === selected.author_id || isAdmin) && (
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => startEdit(selected)}>수정</button>
                  <button type="button" className="ghost" onClick={() => void handleDelete(selected.id)}>삭제</button>
                </div>
              )}
            </>
          ) : (
            <p className="small">왼쪽에서 게시글을 선택하세요.</p>
          )}
        </article>
      </div>

      <hr />

      <article>
        <h3>{editId ? '게시글 수정' : '새 게시글 작성'}</h3>
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
      </article>

      {message && <p className="small">{message}</p>}
    </section>
  )
}
