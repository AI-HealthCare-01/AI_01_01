'use client'
import { useState, useEffect } from 'react'

const WMO: Record<number, { desc: string; icon: string }> = {
  0:{desc:'맑음',icon:'☀️'}, 1:{desc:'대체로 맑음',icon:'🌤'},
  2:{desc:'구름 조금',icon:'⛅'}, 3:{desc:'흐림',icon:'☁️'},
  45:{desc:'안개',icon:'🌫'}, 48:{desc:'안개',icon:'🌫'},
  51:{desc:'이슬비',icon:'🌦'}, 61:{desc:'비',icon:'🌧'},
  63:{desc:'비',icon:'🌧'}, 71:{desc:'눈',icon:'❄️'},
  80:{desc:'소나기',icon:'⛈'}, 95:{desc:'뇌우',icon:'⛈'},
}

function getRecommend(temp: number, code: number) {
  if (code >= 61) return '오늘은 실내 스트레칭으로 대체하는 건 어떨까요?'
  if (code >= 45) return '안개가 있어요. 주의해서 나가세요.'
  if (temp >= 25) return '덥지만 그늘 코스로 산책하기 좋아요!'
  if (temp >= 15) return '산책하기 딱 좋은 날씨예요! 🚶'
  if (temp >= 5)  return '쌀쌀하니 가볍게 걷고 오세요.'
  return '많이 춥네요. 따뜻하게 입고 나가세요.'
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<{temp:number;code:number;wind:number}|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    setLoading(false)
  }, [])

  const requestWeather = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('이 환경에서는 위치 기반 날씨를 사용할 수 없습니다.')
      return
    }

    setRequested(true)
    setLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const {latitude:lat,longitude:lon} = pos.coords
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m&timezone=Asia/Seoul`)
          const json = await res.json()
          setWeather({temp:Math.round(json.current.temperature_2m),code:json.current.weathercode,wind:json.current.windspeed_10m})
        } catch { setError('날씨를 불러오지 못했습니다.') }
        finally { setLoading(false) }
      },
      () => { setError('위치 권한을 허용하면 현재 위치 기준 날씨를 볼 수 있습니다.'); setLoading(false) }
    )
  }

  if (loading) return <div className="ww-wrap"><p className="ww-loading">날씨 불러오는 중...</p></div>
  if (!requested && !weather) {
    return (
      <div className="ww-wrap">
        <p className="ww-desc">필요할 때만 현재 위치 기준 날씨를 불러옵니다.</p>
        <button className="ct-btn-secondary" onClick={requestWeather}>현재 위치 날씨 보기</button>
      </div>
    )
  }
  if (error || !weather) {
    return (
      <div className="ww-wrap">
        <p className="ww-error">{error}</p>
        <button className="ct-btn-secondary" onClick={requestWeather}>다시 시도</button>
      </div>
    )
  }

  const {desc,icon} = WMO[weather.code] ?? {desc:'날씨 확인 중',icon:'🌈'}

  return (
    <div className="ww-wrap">
      <div className="ww-main">
        <div><p className="ww-temp">{weather.temp}°C</p><p className="ww-desc">{desc}</p></div>
        <span className="ww-icon">{icon}</span>
      </div>
      <div className="ww-details">
        <span>🌡 체감 {weather.temp}°C</span>
        <span>💨 {weather.wind}m/s</span>
      </div>
      <div className="ww-recommend">{getRecommend(weather.temp,weather.code)}</div>
    </div>
  )
}
