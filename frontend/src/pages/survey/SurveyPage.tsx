import { useState } from 'react'

import { CHECK_PREDICT_ENDPOINT, buildCheckPredictPayload, createEmptySurveyState, validateSurveyForm } from '../../components/survey/ai'
import { SurveyForm } from '../../components/survey/SurveyForm'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

type CheckPredictResponse = {
  prediction: number
  probabilities: Record<string, number>
  model_path: string
}

export default function SurveyPage() {
  const [form, setForm] = useState(createEmptySurveyState())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckPredictResponse | null>(null)

  const onChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const onSubmit = async () => {
    setError(null)
    const validation = validateSurveyForm(form)
    if (validation) {
      setError(validation)
      return
    }

    try {
      setLoading(true)
      const payload = buildCheckPredictPayload(form)
      const res = await fetch(`${API_BASE}${CHECK_PREDICT_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as CheckPredictResponse
      setResult(json)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <SurveyForm form={form} onChange={onChange} onSubmit={onSubmit} disabled={loading} errorMessage={error} />
      {result ? (
        <section>
          <h3>결과</h3>
          <p>prediction: {result.prediction}</p>
          <pre>{JSON.stringify(result.probabilities, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  )
}
