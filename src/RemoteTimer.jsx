import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'

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

  const send = (action) => {
    const c = connRef.current
    if (c && c.open) c.send({ t: 'cmd', a: action })
  }

  let value = 0
  if (state) {
    if (state.mode === 'down') value = Math.max(0, Math.ceil((state.down.endAt - now) / 1000))
    else if (state.mode === 'up') value = Math.max(0, Math.floor((now - state.up.startAt) / 1000))
  }

  const label =
    state?.mode === 'down' ? 'Temporizador' : state?.mode === 'up' ? 'Cronômetro' : 'Desligado'
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
        <p className="remote-label">{label}</p>
        <div className={`remote-time ${cls}`}>{formatTime(value)}</div>

        {state && (
          <div className="remote-actions">
            <button className="btn btn-primary" onClick={() => send('toggle')}>
              {state.running ? 'Pausar' : 'Iniciar'}
            </button>
            <button className="icon-btn" onClick={() => send('reset')}>Reiniciar</button>
          </div>
        )}

        {status === 'offline' && (
          <button className="icon-btn" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </button>
        )}

        <a className="remote-back" href={window.location.origin + window.location.pathname}>
          Abrir a folha de redação
        </a>
      </main>
    </div>
  )
}

export default RemoteTimer
