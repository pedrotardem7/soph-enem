import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'

const PRESETS = [30, 60, 80, 120]

function formatTime(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function RemoteTimer({ peerId }) {
  const [status, setStatus] = useState('connecting')
  const [state, setState] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [attempt, setAttempt] = useState(0)
  const connRef = useRef(null)

  useEffect(() => {
    let peer
    try {
      peer = new Peer({ debug: 0 })
      peer.on('error', () => setStatus('offline'))
      peer.on('open', () => {
        const c = peer.connect(peerId, { reliable: true })
        connRef.current = c
        c.on('open', () => {
          setStatus('online')
          c.send({ t: 'hello' })
        })
        c.on('data', (d) => {
          if (d && d.t === 'state') setState(d)
        })
        c.on('close', () => setStatus('offline'))
        c.on('error', () => setStatus('offline'))
      })
    } catch {
      setStatus('offline')
    }
    return () => {
      try {
        peer.destroy()
      } catch {}
      connRef.current = null
    }
  }, [peerId, attempt])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (state?.theme === 'rosa') {
      document.documentElement.dataset.theme = 'rosa'
    } else {
      delete document.documentElement.dataset.theme
    }
    return () => {
      delete document.documentElement.dataset.theme
    }
  }, [state?.theme])

  const sendCmd = (obj) => {
    const c = connRef.current
    if (c && c.open) c.send(obj)
  }

  let value = 0
  if (state) {
    if (state.running && state.mode === 'down') {
      value = Math.max(0, Math.ceil((state.down.endAt - now) / 1000))
    } else if (state.running && state.mode === 'up') {
      value = Math.max(0, Math.floor((now - state.up.startAt) / 1000))
    } else {
      value = state.value ?? 0
    }
  }

  const cls =
    state?.mode === 'down' && value === 0
      ? 'done'
      : state?.mode === 'down' && value <= 300
        ? 'warn'
        : ''

  return (
    <div className="remote">
      <div className="background" />
      <div className="blobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <header className="remote-header">
        <span className="brand">Redação ENEM</span>
        <span className={`remote-status ${status}`}>
          {status === 'online'
            ? 'Sincronizado com a sua sessão'
            : status === 'connecting'
              ? 'Conectando...'
              : 'Desconectado'}
        </span>
      </header>

      <main className="remote-main">
        <div className="segmented timer-modes remote-modes">
          <button
            className={state?.mode === 'off' ? 'active' : ''}
            onClick={() => sendCmd({ t: 'cmd', a: 'mode', mode: 'off' })}
          >
            Desligado
          </button>
          <button
            className={state?.mode === 'up' ? 'active' : ''}
            onClick={() => sendCmd({ t: 'cmd', a: 'mode', mode: 'up' })}
          >
            Cronômetro
          </button>
          <button
            className={state?.mode === 'down' ? 'active' : ''}
            onClick={() => sendCmd({ t: 'cmd', a: 'mode', mode: 'down' })}
          >
            Temporizador
          </button>
        </div>

        {state && state.mode !== 'off' ? (
          <>
            <div className={`remote-time ${cls}`}>{formatTime(value)}</div>

            {state.mode === 'down' && (
              <div className="timer-presets remote-presets">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    className={`chip ${state?.preset === p * 60 ? 'active' : ''}`}
                    onClick={() => sendCmd({ t: 'cmd', a: 'preset', seconds: p * 60 })}
                  >
                    {p} min
                  </button>
                ))}
              </div>
            )}

            <div className="remote-actions">
              <button className="btn btn-primary" onClick={() => sendCmd({ t: 'cmd', a: 'toggle' })}>
                {state.running ? 'Pausar' : 'Iniciar'}
              </button>
              <button className="icon-btn" onClick={() => sendCmd({ t: 'cmd', a: 'reset' })}>
                Reiniciar
              </button>
            </div>
          </>
        ) : (
          <p className="remote-off-hint">Escolha um modo para começar.</p>
        )}

        {state && (
          <div className="remote-display">
            <button
              className="icon-btn"
              onClick={() => sendCmd({ t: 'cmd', a: 'focus', on: !state.focus })}
            >
              {state.focus ? 'Sair do foco' : 'Modo foco'}
            </button>
            <div className="segmented">
              <button
                className={!state.cursive ? 'active' : ''}
                onClick={() => sendCmd({ t: 'cmd', a: 'font', cursive: false })}
              >
                Digitação
              </button>
              <button
                className={state.cursive ? 'active' : ''}
                onClick={() => sendCmd({ t: 'cmd', a: 'font', cursive: true })}
              >
                Cursiva
              </button>
            </div>
            <div className="segmented">
              <button onClick={() => sendCmd({ t: 'cmd', a: 'fontsize', fs: (state.fs ?? 18) - 1 })}>
                A−
              </button>
              <span className="fs-val">{state.fs ?? 18}</span>
              <button onClick={() => sendCmd({ t: 'cmd', a: 'fontsize', fs: (state.fs ?? 18) + 1 })}>
                A+
              </button>
            </div>
          </div>
        )}

        {status === 'offline' && (
          <button className="icon-btn" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </button>
        )}
      </main>
    </div>
  )
}

export default RemoteTimer
