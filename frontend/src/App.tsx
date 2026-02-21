import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type UserOut = {
  id: string
  email: string
  nickname: string
  created_at: string
}

type TokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

type PHQ9Answers = {
  q1: number
  q2: number
  q3: number
  q4: number
  q5: number
  q6: number
  q7: number
  q8: number
  q9: number
}

type AssessmentSummary = {
  id: string
  total_score: number
  severity: string
  description: string
  disclaimer: string
  created_at: string
}

type AssessmentDetail = AssessmentSummary & {
  answers: PHQ9Answers
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'
const QUESTION_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'] as const
const QUESTION_LABELS = [
  '흥미 또는 즐거움 감소',
  '우울감 또는 기분 저하',
  '수면 문제',
  '피로감',
  '식욕 변화',
  '자기평가 저하',
  '집중 어려움',
  '움직임/말 변화',
  '힘든 생각 빈도',
]

const defaultAnswers: PHQ9Answers = {
  q1: 0,
  q2: 0,
  q3: 0,
  q4: 0,
  q5: 0,
  q6: 0,
  q7: 0,
  q8: 0,
  q9: 0,
}

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('access_token') ?? '')
  const [me, setMe] = useState<UserOut | null>(null)
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([])
  const [latest, setLatest] = useState<AssessmentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Ready.')

  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupNickname, setSignupNickname] = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [answers, setAnswers] = useState<PHQ9Answers>(defaultAnswers)

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token],
  )

  useEffect(() => {
    if (!token) {
      setMe(null)
      setAssessments([])
      setLatest(null)
      return
    }

    void loadProfile()
    void loadAssessments()
  }, [token])

  async function loadProfile() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: authHeaders,
      })
      if (!response.ok) {
        throw new Error(`profile failed: ${response.status}`)
      }
      const data = (await response.json()) as UserOut
      setMe(data)
    } catch (error) {
      setMessage(`Profile error: ${(error as Error).message}`)
    }
  }

  async function loadAssessments() {
    try {
      const response = await fetch(`${API_BASE}/assessments/phq9`, {
        headers: authHeaders,
      })
      if (!response.ok) {
        throw new Error(`load failed: ${response.status}`)
      }
      const data = (await response.json()) as AssessmentSummary[]
      setAssessments(data)
    } catch (error) {
      setMessage(`Assessment load error: ${(error as Error).message}`)
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('Creating account...')
    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          nickname: signupNickname,
        }),
      })
      if (!response.ok) {
        throw new Error(`signup failed: ${response.status}`)
      }
      const data = (await response.json()) as UserOut
      setMessage(`Signup complete: ${data.email}`)
    } catch (error) {
      setMessage(`Signup error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('Signing in...')
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      })
      if (!response.ok) {
        throw new Error(`login failed: ${response.status}`)
      }
      const data = (await response.json()) as TokenResponse
      localStorage.setItem('access_token', data.access_token)
      setToken(data.access_token)
      setMessage(`Login complete. Token expires in ${data.expires_in / 60} minutes.`)
    } catch (error) {
      setMessage(`Login error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitAssessment(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setMessage('Login first.')
      return
    }
    setLoading(true)
    setMessage('Submitting PHQ-9...')
    try {
      const response = await fetch(`${API_BASE}/assessments/phq9`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ answers }),
      })
      if (!response.ok) {
        throw new Error(`submit failed: ${response.status}`)
      }
      const data = (await response.json()) as AssessmentDetail
      setLatest(data)
      setMessage(`Saved. Score ${data.total_score}, severity ${data.severity}.`)
      await loadAssessments()
    } catch (error) {
      setMessage(`Submit error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function setAnswer(key: keyof PHQ9Answers, value: number) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function logout() {
    localStorage.removeItem('access_token')
    setToken('')
    setMessage('Logged out.')
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="kicker">Mind Check Console</p>
        <h1>MVP Frontend for Auth + PHQ-9</h1>
        <p className="subtitle">참고용 체크 도구입니다. 의료적 진단이나 치료를 대체하지 않습니다.</p>
      </header>

      <section className="grid">
        <article className="panel">
          <h2>Sign Up</h2>
          <form onSubmit={handleSignup} className="form">
            <label>
              Email
              <input value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              Nickname
              <input value={signupNickname} onChange={(e) => setSignupNickname(e.target.value)} required />
            </label>
            <button disabled={loading}>Create Account</button>
          </form>
        </article>

        <article className="panel">
          <h2>Login</h2>
          <form onSubmit={handleLogin} className="form">
            <label>
              Email
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <div className="actions">
              <button disabled={loading}>Login</button>
              <button type="button" className="ghost" onClick={logout}>
                Logout
              </button>
            </div>
          </form>
          <p className="mono">API: {API_BASE}</p>
          {me && (
            <p className="badge">
              Signed in as {me.nickname} ({me.email})
            </p>
          )}
        </article>
      </section>

      <section className="panel">
        <h2>PHQ-9 Submit</h2>
        <form onSubmit={handleSubmitAssessment} className="questionGrid">
          {QUESTION_KEYS.map((key, index) => (
            <label key={key}>
              {index + 1}. {QUESTION_LABELS[index]}
              <select value={answers[key]} onChange={(e) => setAnswer(key, Number(e.target.value))}>
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          ))}
          <button disabled={loading || !token}>Save PHQ-9</button>
        </form>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Latest Result</h2>
          {latest ? (
            <div className="result">
              <p>Total: {latest.total_score}</p>
              <p>Severity: {latest.severity}</p>
              <p>{latest.description}</p>
              <p className="small">{latest.disclaimer}</p>
            </div>
          ) : (
            <p className="small">No result yet.</p>
          )}
        </article>

        <article className="panel">
          <h2>History</h2>
          <ul className="history">
            {assessments.map((item) => (
              <li key={item.id}>
                <strong>{item.total_score} / 27</strong>
                <span>{item.severity}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <footer className="status">
        <span>{loading ? 'Working...' : 'Idle'}</span>
        <span>{message}</span>
      </footer>
    </main>
  )
}

export default App
