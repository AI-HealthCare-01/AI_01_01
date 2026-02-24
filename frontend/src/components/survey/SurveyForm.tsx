import type { ChangeEvent } from 'react'

import { SURVEY_QUESTIONS } from './surveyMapping'

export type SurveyFormProps = {
  form: Record<string, string>
  onChange: (field: string, value: string) => void
  onSubmit: () => void
  disabled?: boolean
  errorMessage?: string | null
}

export function SurveyForm({ form, onChange, onSubmit, disabled = false, errorMessage }: SurveyFormProps) {
  const handleInput = (field: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    // Keep empty-string as empty. Do not coerce into 0.
    onChange(field, e.target.value)
  }

  return (
    <section>
      <h2>AI 설문</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {SURVEY_QUESTIONS.map((q) => (
          <label key={q.field} style={{ display: 'grid', gap: 6 }}>
            <span>
              {q.line}. {q.label}
            </span>
            {q.inputType === 'number' ? (
              <input
                type="text"
                inputMode="decimal"
                value={form[q.field] ?? ''}
                onChange={handleInput(q.field)}
                placeholder={q.required ? '필수 입력' : '선택 입력 (빈값 허용)'}
                disabled={disabled}
              />
            ) : (
              <select value={form[q.field] ?? ''} onChange={handleInput(q.field)} disabled={disabled}>
                <option value="">선택하세요</option>
                {(q.options ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            {q.help ? <small>{q.help}</small> : null}
          </label>
        ))}
      </div>
      {errorMessage ? <p style={{ color: '#b00020' }}>{errorMessage}</p> : null}
      <button type="button" onClick={onSubmit} disabled={disabled}>
        AI 예측 요청
      </button>
    </section>
  )
}
