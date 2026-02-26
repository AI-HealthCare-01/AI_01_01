import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './BoardPage.css'
import {
  BOARD_CATEGORIES,
  type BoardCategory,
  type BoardCategoryApi,
  type BoardPost,
  type BoardPostDetail,
  createBoardComment,
  createBoardPost,
  deleteBoardPost,
  fetchBoardPostDetail,
  fetchBoardPosts,
  toggleBoardBookmark,
  toggleBoardLike,
  updateBoardPost,
} from './boardApi'

type BoardPageProps = {
  token: string
  myUserId: string | null
  isAdmin: boolean
  focusPostId?: string | null
}

const PAGE_SIZE = 10
type CategoryInput = '' | BoardCategory | '공지'
type EditorMode = 'list' | 'create' | 'edit'

function normalizeBoardCategory(value: BoardCategoryApi): BoardCategory {
  return value === '질문' ? '문의' : value
}

export default function BoardPage({ token, myUserId, isAdmin, focusPostId }: BoardPageProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<BoardCategory | ''>('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<BoardPostDetail | null>(null)

  const [editorMode, setEditorMode] = useState<EditorMode>('list')
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryInput, setCategoryInput] = useState<CategoryInput>('')
  const [isPrivateInput, setIsPrivateInput] = useState(false)

  const [commentInput, setCommentInput] = useState('')
  const [adminReplyInput, setAdminReplyInput] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function loadPosts(nextPage = page, preferredSelectedId: string | null = null) {
    setLoading(true)
    try {
      const data = await fetchBoardPosts({ page: nextPage, pageSize: PAGE_SIZE, q, category: categoryFilter, token })
      setPosts(data.items)
      setTotal(data.total)
      setPage(data.page)

      if (data.items.length > 0) {
        const keepId = preferredSelectedId ?? selectedId
        const exists = keepId ? data.items.some((item) => item.id === keepId) : false
        setSelectedId(exists ? keepId : data.items[0].id)
      } else {
        setSelectedId(preferredSelectedId)
        if (!preferredSelectedId) setSelectedDetail(null)
      }
    } catch (error) {
      setMessage(`게시글 조회 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(postId: string) {
    try {
      const detail = await fetchBoardPostDetail(postId, token)
      setSelectedDetail(detail)
    } catch (error) {
      setMessage(`상세 조회 오류: ${(error as Error).message}`)
    }
  }

  useEffect(() => {
    void loadPosts(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (!focusPostId) return
    setEditorMode('list')
    setSelectedId(focusPostId)
  }, [focusPostId])

  function resetForm() {
    setEditId(null)
    setTitle('')
    setContent('')
    setCategoryInput('')
    setIsPrivateInput(false)
  }

  function openCreateScreen() {
    resetForm()
    setEditorMode('create')
  }

  function startEdit(post: BoardPost) {
    setEditId(post.id)
    setTitle(post.title)
    setContent(post.content)
    setCategoryInput(post.is_notice ? '공지' : normalizeBoardCategory(post.category))
    setIsPrivateInput(post.is_private)
    setEditorMode('edit')
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
    if (!title.trim() || !content.trim()) {
      setMessage('제목과 내용을 입력하세요.')
      return
    }

    const category = categoryInput === '공지' ? '문의' : categoryInput
    const isNotice = categoryInput === '공지'

    setLoading(true)
    try {
      let targetId = ''
      if (editId) {
        const updated = await updateBoardPost(token, editId, { title: title.trim(), content: content.trim(), category, is_notice: isNotice, is_private: isPrivateInput })
        setMessage('게시글이 수정되었습니다.')
        targetId = updated.id
      } else {
        const created = await createBoardPost(token, { title: title.trim(), content: content.trim(), category, is_notice: isNotice, is_private: isPrivateInput })
        setMessage('게시글이 등록되었습니다.')
        targetId = created.id
      }

      setQ('')
      setCategoryFilter('')
      resetForm()
      setEditorMode('list')
      setSelectedId(targetId)
      await loadDetail(targetId)
      await loadPosts(1, targetId)
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
      if (selectedId === postId) {
        setSelectedId(null)
        setSelectedDetail(null)
      }
      await loadPosts(1)
      resetForm()
      setEditorMode('list')
    } catch (error) {
      setMessage(`삭제 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleLike() {
    if (!token || !selectedId) {
      setMessage('로그인 후 이용 가능합니다.')
      return
    }
    try {
      await toggleBoardLike(token, selectedId)
      await loadDetail(selectedId)
      await loadPosts(page, selectedId)
    } catch (error) {
      setMessage(`좋아요 오류: ${(error as Error).message}`)
    }
  }

  async function handleBookmark() {
    if (!token || !selectedId) {
      setMessage('로그인 후 이용 가능합니다.')
      return
    }
    try {
      await toggleBoardBookmark(token, selectedId)
      await loadDetail(selectedId)
      await loadPosts(page, selectedId)
    } catch (error) {
      setMessage(`북마크 오류: ${(error as Error).message}`)
    }
  }

  async function handleAddComment(event: FormEvent) {
    event.preventDefault()
    if (!token || !selectedId) {
      setMessage('로그인 후 댓글을 작성할 수 있습니다.')
      return
    }
    if (!commentInput.trim()) {
      setMessage('댓글 내용을 입력하세요.')
      return
    }
    try {
      await createBoardComment(token, selectedId, commentInput.trim())
      setCommentInput('')
      await loadDetail(selectedId)
      await loadPosts(page, selectedId)
    } catch (error) {
      setMessage(`댓글 등록 오류: ${(error as Error).message}`)
    }
  }

  async function handleAddAdminReply(event: FormEvent) {
    event.preventDefault()
    if (!token || !selectedId || !isAdmin) {
      setMessage('관리자만 답변을 등록할 수 있습니다.')
      return
    }
    if (!adminReplyInput.trim()) {
      setMessage('답변 내용을 입력하세요.')
      return
    }
    try {
      await createBoardComment(token, selectedId, `[관리자답변] ${adminReplyInput.trim()}`)
      setAdminReplyInput('')
      await loadDetail(selectedId)
      await loadPosts(page, selectedId)
      setMessage('관리자 답변이 등록되었습니다.')
    } catch (error) {
      setMessage(`관리자 답변 등록 오류: ${(error as Error).message}`)
    }
  }

  if (editorMode === 'create' || editorMode === 'edit') {
    return (
      <section className="boardPage panel">
        <h2>{editorMode === 'edit' ? '게시물 편집 화면' : '게시물 작성 화면'}</h2>
        <p className="small">게시물 보기 화면과 분리된 전용 작성/편집 화면입니다.</p>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            유형 선택
            <select value={categoryInput} onChange={(e) => setCategoryInput(e.target.value as CategoryInput)} required>
              <option value="">유형 선택</option>
              {BOARD_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              {isAdmin && <option value="공지">공지</option>}
            </select>
          </label>
          {(categoryInput === '문의' || categoryInput === '피드백') && (
            <label>
              공개/비공개
              <select value={isPrivateInput ? 'private' : 'public'} onChange={(e) => setIsPrivateInput(e.target.value === 'private')}>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
            </label>
          )}
          <label>제목 입력<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <label>내용 입력<textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} required /></label>
          <div className="actions">
            <button type="submit" disabled={loading || !token}>{editorMode === 'edit' ? '수정 저장' : '게시하기'}</button>
            <button type="button" className="ghost" onClick={() => setEditorMode('list')}>게시물 보기로 돌아가기</button>
          </div>
        </form>
        {message && <p className="small">{message}</p>}
      </section>
    )
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
        <button type="button" className="ghost" disabled={!token} onClick={openCreateScreen}>게시물 작성하기</button>
      </div>

      <div className="boardLayout">
        <article className="boardList">
          {posts.length === 0 && <p className="small">게시글이 없습니다.</p>}
          {posts.map((post) => (
            <button key={post.id} type="button" className={`boardRow ${selectedId === post.id ? 'active' : ''}`} onClick={() => setSelectedId(post.id)}>
              <span className="boardRowTop">
                {post.is_notice && <em className="noticeTag">공지</em>}
                {post.is_private && <em className="noticeTag">비공개</em>}
                <strong>{post.title}</strong>
              </span>
              <span className="boardMeta">
                {post.is_notice ? '공지' : normalizeBoardCategory(post.category)} · {post.author_nickname} · {new Date(post.created_at).toLocaleString('ko-KR')}
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
          {selectedDetail ? (
            <>
              <h3>{selectedDetail.title}</h3>
              <p className="small">{(selectedDetail.is_notice ? '공지' : normalizeBoardCategory(selectedDetail.category))} · {selectedDetail.author_nickname} · {new Date(selectedDetail.created_at).toLocaleString('ko-KR')}</p>
              <pre className="boardContent">{selectedDetail.content}</pre>

              <div className="actions">
                <button type="button" className="ghost" onClick={() => void handleLike()}>좋아요 {selectedDetail.likes_count}</button>
                <button type="button" className="ghost" onClick={() => void handleBookmark()}>북마크 {selectedDetail.bookmarks_count}</button>
                <button type="button" className="ghost" onClick={openCreateScreen}>게시물 작성하기</button>
                {(myUserId === selectedDetail.author_id || isAdmin) && (
                  <>
                    <button type="button" className="ghost" onClick={() => startEdit(selectedDetail)}>수정</button>
                    <button type="button" className="ghost" onClick={() => void handleDelete(selectedDetail.id)}>삭제</button>
                  </>
                )}
              </div>

              <h4>댓글</h4>
              <ul className="probList">
                {selectedDetail.comments.length === 0 && <li>등록된 댓글이 없습니다.</li>}
                {selectedDetail.comments.map((c) => (
                  <li key={c.id}>
                    <span>{c.author_nickname}: {c.content}</span>
                    <strong>{new Date(c.created_at).toLocaleString('ko-KR')}</strong>
                  </li>
                ))}
              </ul>

              <form className="form" onSubmit={handleAddComment}>
                <label>
                  댓글 입력
                  <input value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="댓글을 입력하세요" />
                </label>
                <div className="actions">
                  <button type="submit" disabled={!token}>댓글 입력</button>
                </div>
              </form>

              {((normalizeBoardCategory(selectedDetail.category) === '문의') || normalizeBoardCategory(selectedDetail.category) === '피드백') && isAdmin && (
                <form className="form adminReplyBox" onSubmit={handleAddAdminReply}>
                  <label>
                    관리자 답변
                    <textarea value={adminReplyInput} onChange={(e) => setAdminReplyInput(e.target.value)} rows={4} placeholder="문의/피드백에 대한 관리자 답변을 입력하세요" />
                  </label>
                  <div className="actions">
                    <button type="submit">관리자 답변 등록</button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <p className="small">왼쪽에서 게시글을 선택하세요.</p>
          )}
        </article>
      </div>

      {message && <p className="small">{message}</p>}
    </section>
  )
}
