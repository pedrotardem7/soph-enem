import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'
import QRCode from 'qrcode'
import RemoteTimer from './RemoteTimer.jsx'
import './App.css'

const TOTAL_LINES = 30
const STORAGE_KEY = 'soph-enem-redacao'
const PRESETS = [30, 60, 80, 120]

const NUMBERS = Array.from({ length: TOTAL_LINES }, (_, i) => i + 1)

function formatTime(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {}
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const remotePeerId = params.get('r')
  if (remotePeerId) return <RemoteTimer peerId={remotePeerId} />

  return <Editor />
}

function Editor() {
  const [essay, setEssay] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [cursive, setCursive] = useState(false)
  const [fs, setFs] = useState(18)
  const [visualLines, setVisualLines] = useState(0)
  const [copied, setCopied] = useState(false)
  const areaRef = useRef(null)
  const measureRef = useRef(null)

  const [timerMode, setTimerMode] = useState('off')
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerValue, setTimerValue] = useState(4800)
  const [preset, setPreset] = useState(4800)
  const [customMin, setCustomMin] = useState(80)
  const [timerOpen, setTimerOpen] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const startRef = useRef(0)
  const endRef = useRef(0)
  const timerWrapRef = useRef(null)

  const [peerId] = useState(() => 'enem-' + Math.random().toString(36).slice(2, 10))
  const [qrOpen, setQrOpen] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [phoneConnected, setPhoneConnected] = useState(false)
  const peerRef = useRef(null)
  const connRef = useRef(null)
  const sendStateRef = useRef(() => {})
  const cmdRef = useRef({ toggle: () => {}, reset: () => {} })

  useEffect(() => {
    if (!timerOpen) return
    const handler = (e) => {
      if (timerWrapRef.current && !timerWrapRef.current.contains(e.target)) {
        setTimerOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setTimerOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [timerOpen])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, essay)
      } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [essay])

  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const lh = parseFloat(getComputedStyle(el).lineHeight)
    setVisualLines(lh ? Math.max(1, Math.round(el.scrollHeight / lh)) : 1)
  }, [essay, cursive, fs])

  useEffect(() => {
    if (!timerRunning || timerMode === 'off') return
    const id = setInterval(() => {
      setTimerValue(() => {
        if (timerMode === 'down') {
          return Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
        }
        return Math.floor((Date.now() - startRef.current) / 1000)
      })
    }, 250)
    return () => clearInterval(id)
  }, [timerRunning, timerMode])

  useEffect(() => {
    if (timerMode === 'down' && timerRunning && timerValue === 0) {
      setTimerRunning(false)
      setTimedOut(true)
      beep()
    }
  }, [timerValue, timerRunning, timerMode])

  const sendState = () => {
    const c = connRef.current
    if (!c || !c.open) return
    const payload = { t: 'state', mode: timerMode, running: timerRunning, value: timerValue, preset }
    if (timerMode === 'down' && timerRunning) {
      payload.down = { endAt: endRef.current }
    } else if (timerMode === 'up' && timerRunning) {
      payload.up = { startAt: startRef.current }
    }
    c.send(payload)
  }
  sendStateRef.current = sendState

  useEffect(() => {
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#0b0e1a', light: '#ffffff' },
      })
        .then(setQrDataUrl)
        .catch(() => {})
    }
  }, [qrUrl])

  const ensurePeer = () => {
    if (peerRef.current) return peerRef.current
    const peer = new Peer(peerId, { debug: 0 })
    peer.on('connection', (c) => {
      c.on('open', () => {
        connRef.current = c
        setPhoneConnected(true)
      })
      c.on('data', (d) => {
        if (!d || d.t !== 'cmd') return
        if (d.a === 'toggle') cmdRef.current.toggle()
        if (d.a === 'reset') cmdRef.current.reset()
        if (d.a === 'mode') cmdRef.current.mode(d.mode)
        if (d.a === 'preset') cmdRef.current.preset(d.seconds)
      })
      c.on('close', () => {
        connRef.current = null
        setPhoneConnected(false)
      })
      c.on('error', () => {
        connRef.current = null
        setPhoneConnected(false)
      })
    })
    peer.on('error', () => setPhoneConnected(false))
    peerRef.current = peer
    return peer
  }

  const openQr = () => {
    ensurePeer()
    setQrUrl(window.location.origin + window.location.pathname + '?r=' + peerId)
    setQrOpen(true)
  }

  const goToSheet = () => {
    setQrOpen(false)
    const el = document.querySelector('.sheet')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    areaRef.current?.focus()
  }

  useEffect(() => {
    if (!qrOpen) return
    const handler = (e) => {
      if (e.target === e.currentTarget) setQrOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setQrOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [qrOpen])

  useEffect(() => {
    sendStateRef.current()
  }, [timerMode, timerRunning, timerValue, phoneConnected])

  const words = essay.trim() ? essay.trim().split(/\s+/).length : 0
  const chars = essay.length
  const overLimit = visualLines > TOTAL_LINES

  const timerClass =
    timerMode === 'down' && timerValue === 0
      ? 'done'
      : timerMode === 'down' && timerValue <= 300
        ? 'warn'
        : ''

  const handleChange = (e) => setEssay(e.target.value)

  const handleClear = () => {
    if (essay && !window.confirm('Apagar toda a redação?')) return
    setEssay('')
    areaRef.current?.focus()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(essay)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const handlePrint = () => window.print()

  const switchTimerMode = (m) => {
    setTimerRunning(false)
    setTimedOut(false)
    setTimerMode(m)
    if (m === 'down') setTimerValue(preset)
    if (m === 'up') setTimerValue(0)
  }

  const setPresetFrom = (seconds) => {
    setPreset(seconds)
    setCustomMin(seconds / 60)
    if (!timerRunning) setTimerValue(seconds)
  }

  const startPause = () => {
    if (timerMode === 'off') return
    if (timerRunning) {
      setTimerRunning(false)
      return
    }
    if (timerMode === 'down') {
      if (timerValue === 0) {
        setTimerValue(preset)
        endRef.current = Date.now() + preset * 1000
      } else {
        endRef.current = Date.now() + timerValue * 1000
      }
    } else {
      startRef.current = Date.now() - timerValue * 1000
    }
    setTimedOut(false)
    setTimerRunning(true)
  }

  const resetTimer = () => {
    setTimerRunning(false)
    setTimedOut(false)
    setTimerValue(timerMode === 'down' ? preset : 0)
  }

  const remoteToggle = () => {
    if (timerMode === 'off') {
      setTimerMode('up')
      setTimerValue(0)
      startRef.current = Date.now()
      setTimedOut(false)
      setTimerRunning(true)
    } else {
      startPause()
    }
  }

  const remoteReset = () => {
    if (timerMode === 'off') {
      setTimerMode('up')
      setTimerValue(0)
      setTimerRunning(false)
    } else {
      resetTimer()
    }
  }

  cmdRef.current = {
    toggle: remoteToggle,
    reset: remoteReset,
    mode: switchTimerMode,
    preset: setPresetFrom,
  }

  return (
    <div className="app">
      <div className="background" />
      <div className="blobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <header className="toolbar">
        <span className="brand">Redação ENEM</span>

        <div className="stats">
          <span className={`stat ${overLimit ? 'warn' : ''}`}>
            Linhas <strong>{visualLines}/{TOTAL_LINES}</strong>
          </span>
          <span className="stat">Palavras <strong>{words}</strong></span>
          <span className="stat">Caracteres <strong>{chars}</strong></span>
          <div className="timer-wrap" ref={timerWrapRef}>
            <button
              className={`timer-chip ${timerClass} ${timerMode === 'off' ? 'off' : ''}`}
              onClick={() => setTimerOpen((o) => !o)}
              title="Cronômetro e temporizador"
            >
              {timerMode === 'off' ? (
                'Desligado'
              ) : (
                <>
                  Tempo <strong>{formatTime(timerValue)}</strong>
                </>
              )}
            </button>
            {timerOpen && (
              <div className="timer-panel">
                <div className="segmented timer-modes">
                  <button
                    className={timerMode === 'off' ? 'active' : ''}
                    onClick={() => switchTimerMode('off')}
                  >
                    Desligado
                  </button>
                  <button
                    className={timerMode === 'up' ? 'active' : ''}
                    onClick={() => switchTimerMode('up')}
                  >
                    Cronômetro
                  </button>
                  <button
                    className={timerMode === 'down' ? 'active' : ''}
                    onClick={() => switchTimerMode('down')}
                  >
                    Temporizador
                  </button>
                </div>

                {timerMode === 'off' ? (
                  <p className="timer-off-hint">Cronômetro desligado.</p>
                ) : (
                  <div className={`timer-time ${timerClass} ${timerRunning ? 'running' : ''}`}>
                    {formatTime(timerValue)}
                  </div>
                )}

                {timerMode === 'down' && (
                  <>
                    <div className="timer-presets">
                      {PRESETS.map((p) => (
                        <button
                          key={p}
                          className={`chip ${preset === p * 60 ? 'active' : ''}`}
                          onClick={() => setPresetFrom(p * 60)}
                        >
                          {p} min
                        </button>
                      ))}
                    </div>
                    <div className="timer-custom">
                      <input
                        type="number"
                        min="1"
                        max="300"
                        value={customMin}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(300, Number(e.target.value) || 1))
                          setCustomMin(v)
                          setPresetFrom(v * 60)
                        }}
                      />
                      <span>min</span>
                    </div>
                  </>
                )}

                {timerMode !== 'off' && (
                  <div className="timer-actions">
                    <button className="btn btn-primary" onClick={startPause}>
                      {timerRunning ? 'Pausar' : 'Iniciar'}
                    </button>
                    <button className="icon-btn" onClick={resetTimer}>Reiniciar</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="controls">
          <div className="segmented" title="Fonte do texto">
            <button className={!cursive ? 'active' : ''} onClick={() => setCursive(false)}>
              Digitação
            </button>
            <button className={cursive ? 'active' : ''} onClick={() => setCursive(true)}>
              Cursiva
            </button>
          </div>
          <div className="segmented" title="Tamanho do texto">
            <button onClick={() => setFs((v) => Math.max(12, v - 1))}>A−</button>
            <span className="fs-val">{fs}</span>
            <button onClick={() => setFs((v) => Math.min(28, v + 1))}>A+</button>
          </div>
          <button className="icon-btn" onClick={handleClear}>Limpar</button>
          <button className="icon-btn" onClick={handleCopy}>
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button className="icon-btn qr-btn" onClick={openQr}>
            QR <span className={`dot ${phoneConnected ? 'on' : ''}`} />
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>Imprimir / PDF</button>
        </div>
      </header>

      <main className="main">
        {timedOut && (
          <div className="warning warning-timer">
            Tempo esgotado! Se estiver treinando a prova, finalize a redação agora.
            <button className="warning-close" onClick={() => setTimedOut(false)}>Fechar</button>
          </div>
        )}

        {overLimit && (
          <div className="warning">
            Atenção: sua redação passou de 30 linhas ({visualLines}). Na prova oficial o texto fica
            limitado à folha definitiva.
          </div>
        )}

        <div
          className={`sheet ${cursive ? 'sheet-cursive' : ''}`}
          style={{ '--user-fs': `${fs}px`, '--user-fs-cursive': `${Math.round(fs * 1.45)}px` }}
        >
          <div className="sheet-header">
            <p className="h-top">Exame Nacional do Ensino Médio</p>
            <h2 className="h-title">Redação</h2>
            <p className="h-sub">Folha definitiva — 30 linhas</p>
          </div>

          <div className="writing-area">
            <div className="lines">
              {NUMBERS.map((n, i) => (
                <div className="line" key={n}>
                  <div className="line-num">
                    {i === 0 ? (
                      <span className="num-label">TEXTO<br />DEFINITIVO</span>
                    ) : (
                      n
                    )}
                  </div>
                  <div className="line-text" />
                </div>
              ))}
            </div>
            {essay === '' && <span className="caret" aria-hidden="true" />}
            <div
              ref={measureRef}
              className={`line-measure ${cursive ? 'cursive' : ''}`}
              aria-hidden="true"
            >
              {essay}
            </div>
            <textarea
              ref={areaRef}
              className={`typing ${cursive ? 'cursive' : ''}`}
              value={essay}
              onChange={handleChange}
              placeholder="Comece a escrever sua redação aqui..."
              spellCheck="false"
              aria-label="Texto da redação"
            />
          </div>
        </div>
      </main>

      {qrOpen && (
        <div className="overlay">
          <div className="modal">
            {phoneConnected ? (
              <>
                <div className="qr-success" aria-hidden="true" />
                <h3>Cronômetro no celular</h3>
                <div className="qr-status on">
                  Celular conectado! O cronômetro está sincronizado.
                </div>
                <button className="btn btn-primary btn-big" onClick={goToSheet}>
                  Ir para a tela da redação
                </button>
                <button className="link-btn" onClick={() => setQrOpen(false)}>Fechar</button>
              </>
            ) : (
              <>
                <h3>Cronômetro no celular</h3>
                <p className="modal-desc">
                  Aponte a câmera do celular para o QR Code (ou abra o link). O celular vira o
                  cronômetro sincronizado com este site.
                </p>
                <div className="qr-box">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR Code para abrir o cronômetro no celular" />
                  ) : (
                    <div className="qr-loading">Gerando QR Code...</div>
                  )}
                </div>
                <a className="qr-link" href={qrUrl} target="_blank" rel="noreferrer">
                  {qrUrl}
                </a>
                <div className="qr-status">
                  Aguardando conexão do celular...
                </div>
                <button className="icon-btn" onClick={() => setQrOpen(false)}>Fechar</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
