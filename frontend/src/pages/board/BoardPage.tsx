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
  deleteBoardComment,
  deleteBoardPost,
  fetchBoardPostDetail,
  fetchPopularBoardPosts,
  fetchBoardPosts,
  reportBoardPost,
  resolveBoardImageUrl,
  serializeBoardImageUrls,
  toggleBoardBookmark,
  toggleBoardLike,
  uploadBoardImage,
  updateBoardPost,
} from './boardApi'

type BoardPageProps = {
  token: string
  myUserId: string | null
  isAdmin: boolean
  focusPostId?: string | null
}

const PAGE_SIZE = 10
const MAX_IMAGES_PER_POST = 5
type CategoryInput = '' | BoardCategory | '공지' | '정신건강포스팅'
type CategoryFilterInput = '' | BoardCategory | '정신건강포스팅'
type EditorMode = 'list' | 'create' | 'edit'
type BoardListMode = 'all' | 'popular'

function normalizeBoardCategory(value: BoardCategoryApi): BoardCategory {
  return value === '질문' ? '문의' : value
}

function getPostTypeLabel(post: Pick<BoardPost, 'is_notice' | 'is_mental_health_post' | 'category'>): string {
  if (post.is_notice) return '공지'
  if (post.is_mental_health_post) return '정신건강 포스팅'
  return normalizeBoardCategory(post.category)
}

function getPreviewText(content: string, maxLength = 180): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxLength) return flat
  return `${flat.slice(0, maxLength)}...`
}

function parseEditorImageUrls(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isValidBoardImageUrl(url: string): boolean {
  return /^(https?:\/\/\S+|\/uploads\/\S+)$/i.test(url)
}

function FallbackImage({
  urls,
  alt,
  className,
  loading = 'lazy',
}: {
  urls: string[]
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
}) {
  const normalized = urls.map((item) => item.trim()).filter(Boolean)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [normalized.join('|')])

  if (!normalized.length || index >= normalized.length) return null

  return (
    <img
      className={className}
      src={resolveBoardImageUrl(normalized[index])}
      alt={alt}
      loading={loading}
      onError={() => setIndex((prev) => prev + 1)}
    />
  )
}

function SafeImageFigure({
  figureClassName,
  imageClassName,
  url,
  alt,
}: {
  figureClassName: string
  imageClassName?: string
  url: string
  alt: string
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [url])

  if (failed || !url.trim()) return null

  return (
    <figure className={figureClassName}>
      <img
        className={imageClassName}
        src={resolveBoardImageUrl(url)}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </figure>
  )
}

export default function BoardPage({ token, myUserId, isAdmin, focusPostId }: BoardPageProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterInput>('')
  const [listMode, setListMode] = useState<BoardListMode>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<BoardPostDetail | null>(null)

  const [editorMode, setEditorMode] = useState<EditorMode>('list')
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [categoryInput, setCategoryInput] = useState<CategoryInput>('')
  const [isPrivateInput, setIsPrivateInput] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)

  const [commentInput, setCommentInput] = useState('')
  const [adminReplyInput, setAdminReplyInput] = useState('')
  const editorImageUrls = parseEditorImageUrls(imageUrlInput)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageNumbers = (() => {
    const spread = 2
    const start = Math.max(1, page - spread)
    const end = Math.min(totalPages, page + spread)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  })()

  async function loadPosts(nextPage = page, preferredSelectedId: string | null = null) {
    setLoading(true)
    try {
      const data = listMode === 'popular'
        ? await fetchPopularBoardPosts({
          token,
          periodDays: 7,
          minLikes: 3,
          limit: 30,
        })
        : await fetchBoardPosts({
          page: nextPage,
          pageSize: PAGE_SIZE,
          q,
          category: (categoryFilter === '정신건강포스팅' ? '' : categoryFilter) as BoardCategory | '',
          token,
          mentalHealthOnly: categoryFilter === '정신건강포스팅' ? true : undefined,
        })
      setPosts(data.items)
      setTotal(data.total)
      setPage(listMode === 'popular' ? 1 : data.page)

      if (data.items.length > 0) {
        const keepId = preferredSelectedId ?? selectedId
        const exists = keepId ? data.items.some((item) => item.id === keepId) : false
        if (exists) {
          setSelectedId(keepId)
        } else {
          setSelectedId(null)
          setSelectedDetail(null)
        }
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
    void loadPosts(1, focusPostId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listMode, focusPostId])

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
    setImageUrlInput('')
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
    setImageUrlInput(post.image_urls.join(', '))
    if (post.is_notice) {
      setCategoryInput('공지')
    } else if (post.is_mental_health_post) {
      setCategoryInput('정신건강포스팅')
    } else {
      setCategoryInput(normalizeBoardCategory(post.category))
    }
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
    const normalizedImageUrls = parseEditorImageUrls(imageUrlInput)
    if (normalizedImageUrls.length > MAX_IMAGES_PER_POST) {
      setMessage(`이미지는 최대 ${MAX_IMAGES_PER_POST}장까지 등록할 수 있습니다.`)
      return
    }
    if (normalizedImageUrls.some((url) => !isValidBoardImageUrl(url))) {
      setMessage('이미지 URL은 http://, https:// 또는 /uploads/... 형식으로 입력하세요. 여러 장은 쉼표(,)로 구분합니다.')
      return
    }
    const serializedImageUrl = serializeBoardImageUrls(normalizedImageUrls)

    const isNotice = categoryInput === '공지'
    const isMental = categoryInput === '정신건강포스팅'
    const category: BoardCategoryApi = isNotice ? '문의' : isMental ? '꿀팁' : categoryInput

    setLoading(true)
    try {
      let targetId = ''
      if (editId) {
        const updated = await updateBoardPost(token, editId, {
          title: title.trim(),
          content: content.trim(),
          image_url: serializedImageUrl,
          category,
          is_notice: isNotice,
          is_private: isPrivateInput,
          is_mental_health_post: isMental,
        })
        setMessage('게시글이 수정되었습니다.')
        targetId = updated.id
      } else {
        const created = await createBoardPost(token, {
          title: title.trim(),
          content: content.trim(),
          image_url: serializedImageUrl,
          category,
          is_notice: isNotice,
          is_private: isPrivateInput,
          is_mental_health_post: isMental,
        })
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

  async function handleUploadImageFileList(files: FileList) {
    if (!token) {
      setMessage('로그인 후 이미지 업로드가 가능합니다.')
      return
    }
    if (!files.length) return

    const currentImages = parseEditorImageUrls(imageUrlInput)
    const availableSlots = MAX_IMAGES_PER_POST - currentImages.length
    if (availableSlots <= 0) {
      setMessage(`이미지는 최대 ${MAX_IMAGES_PER_POST}장까지 등록할 수 있습니다.`)
      return
    }

    const targets = Array.from(files).slice(0, availableSlots)
    const uploaded: string[] = []
    setImageUploading(true)
    try {
      for (const file of targets) {
        const result = await uploadBoardImage(token, file)
        uploaded.push(result.image_url)
      }
      const next = [...currentImages, ...uploaded]
      setImageUrlInput(next.join(', '))
      setMessage(`${uploaded.length}개 이미지가 업로드되었습니다.`)
    } catch (error) {
      setMessage(`이미지 업로드 오류: ${(error as Error).message}`)
    } finally {
      setImageUploading(false)
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

  async function handleDeleteComment(commentId: string) {
    if (!token) {
      setMessage('로그인 후 댓글 삭제가 가능합니다.')
      return
    }
    if (!window.confirm('댓글을 삭제할까요?')) return
    try {
      await deleteBoardComment(token, commentId)
      if (selectedId) {
        await loadDetail(selectedId)
        await loadPosts(page, selectedId)
      }
      setMessage('댓글이 삭제되었습니다.')
    } catch (error) {
      setMessage(`댓글 삭제 오류: ${(error as Error).message}`)
    }
  }

  async function handleReportPost() {
    if (!token || !selectedId) {
      setMessage('로그인 후 신고할 수 있습니다.')
      return
    }
    const reason = window.prompt('신고 사유를 입력하세요 (예: 위협/협박/부적절)')
    if (!reason || !reason.trim()) return
    const detail = window.prompt('세부 설명(선택)을 입력하세요') ?? undefined

    try {
      await reportBoardPost(token, selectedId, reason.trim(), detail?.trim())
      setMessage('신고가 접수되었습니다. 관리자가 확인 후 조치합니다.')
    } catch (error) {
      setMessage(`신고 오류: ${(error as Error).message}`)
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
              {isAdmin && <option value="정신건강포스팅">정신건강 포스팅</option>}
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
          <label>
            이미지 업로드 (선택, 최대 5장)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = e.target.files
                if (files?.length) void handleUploadImageFileList(files)
                e.currentTarget.value = ''
              }}
            />
          </label>
          <label>이미지 URL (자동 입력/수동 가능, 여러 장은 쉼표로 구분)<input value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} placeholder="https://... , /uploads/..." /></label>
          {imageUploading && <p className="small">이미지 업로드 중...</p>}
          {editorImageUrls.length > 0 && (
            <div className="boardEditorPreviewGrid">
              {editorImageUrls.map((url, idx) => (
                <SafeImageFigure key={`editor-image-${idx}`} figureClassName="boardEditorPreview" url={url} alt={`업로드 미리보기 ${idx + 1}`} />
              ))}
            </div>
          )}
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
      <p className="small">공지/문의/자유/꿀팁/피드백/정신건강 포스팅을 한 곳에서 관리합니다.</p>

      <div className="boardToolbar">
        <div className="actions boardModeTabs">
          <button type="button" className={listMode === 'all' ? '' : 'ghost'} onClick={() => setListMode('all')}>전체글</button>
          <button type="button" className={listMode === 'popular' ? '' : 'ghost'} onClick={() => setListMode('popular')}>인기글</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목/내용 검색" disabled={listMode === 'popular'} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryFilterInput)} disabled={listMode === 'popular'}>
          <option value="">전체 카테고리</option>
          {BOARD_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          <option value="정신건강포스팅">정신건강 포스팅</option>
        </select>
        <button type="button" disabled={loading || listMode === 'popular'} onClick={() => void loadPosts(1)}>검색</button>
        <button type="button" className="ghost" disabled={!token} onClick={openCreateScreen}>게시물 작성하기</button>
      </div>

      <div className="boardLayout">
        <article className="boardList">
          {posts.length === 0 && <p className="small">게시글이 없습니다.</p>}
          {posts.map((post) => (
            <article
              key={post.id}
              className={`boardThreadCard ${selectedId === post.id ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(post.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedId(post.id)
                }
              }}
            >
              <div className="boardRowTop">
                {post.is_notice && <em className="noticeTag">공지</em>}
                {post.is_mental_health_post && <em className="noticeTag mentalTag">정신건강</em>}
                {post.is_private && <em className="noticeTag">비공개</em>}
              </div>
              <strong className="boardThreadTitle">{post.title}</strong>
              {post.image_urls.length > 0 && (
                <div className="boardThumbWrap">
                  <span className="noticeTag imageTag">IMG {post.image_urls.length}</span>
                  <FallbackImage className="boardThumb" urls={post.image_urls} alt={`${post.title} 이미지`} />
                </div>
              )}
              <p className="boardThreadPreview">{getPreviewText(post.content)}</p>
              <span className="boardMeta">
                {getPostTypeLabel(post)} · {post.author_nickname} · {new Date(post.created_at).toLocaleString('ko-KR')}
              </span>
              <div className="boardThreadFooter">
                <span>좋아요 {post.likes_count} · 댓글 {post.comments_count} · 북마크 {post.bookmarks_count}</span>
              </div>
            </article>
          ))}
          {listMode === 'all' && (
            <div className="boardPager">
              <button type="button" className="ghost" disabled={loading || page <= 1} onClick={() => void loadPosts(page - 1)}>이전</button>
              {pageNumbers.map((n) => (
                <button
                  key={`page-${n}`}
                  type="button"
                  className={n === page ? 'boardPageNum active' : 'boardPageNum ghost'}
                  disabled={loading}
                  onClick={() => void loadPosts(n)}
                >
                  {n}
                </button>
              ))}
              <button type="button" className="ghost" disabled={loading || page >= totalPages} onClick={() => void loadPosts(page + 1)}>다음</button>
            </div>
          )}
        </article>

        <article className="boardDetail">
          {selectedDetail ? (
            <>
              <h3>{selectedDetail.title}</h3>
              <p className="small">{getPostTypeLabel(selectedDetail)} · {selectedDetail.author_nickname} · {new Date(selectedDetail.created_at).toLocaleString('ko-KR')}</p>
              {selectedDetail.image_urls.length > 0 && (
                <div className="boardDetailImageGrid">
                  {selectedDetail.image_urls.map((url, idx) => (
                    <SafeImageFigure
                      key={`detail-image-${idx}`}
                      figureClassName="boardDetailImageWrap"
                      imageClassName="boardDetailImage"
                      url={url}
                      alt={`${selectedDetail.title} 이미지 ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
              <pre className="boardContent">{selectedDetail.content}</pre>

              <div className="actions">
                <button type="button" className="ghost" onClick={() => void handleLike()}>좋아요 {selectedDetail.likes_count}</button>
                <button type="button" className="ghost" onClick={() => void handleBookmark()}>북마크 {selectedDetail.bookmarks_count}</button>
                <button type="button" className="ghost" onClick={() => void handleReportPost()}>신고</button>
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
                    {(myUserId === c.author_id || isAdmin) && (
                      <button className="ghost" type="button" onClick={() => void handleDeleteComment(c.id)}>댓글 삭제</button>
                    )}
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
