import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

/* ─────────────────────────────────────────
   Arithmetic Coding Logic
───────────────────────────────────────── */
function sanitizeText(rawText, allowedSymbols) {
  const allowed = new Set(allowedSymbols)
  return rawText.toUpperCase().split('').filter((c) => allowed.has(c)).join('')
}
function computeModel(text) {
  const counts = {}
  for (const char of text) counts[char] = (counts[char] ?? 0) + 1
  const symbols = Object.keys(counts).sort()
  const total = text.length || 1
  return symbols.map((symbol) => ({ symbol, probability: counts[symbol] / total }))
}
function normalizeRows(rows) {
  const cleaned = rows
    .map((r) => ({ symbol: r.symbol.trim().slice(0, 1).toUpperCase(), probability: Number(r.probability) || 0 }))
    .filter((r) => r.symbol && r.probability > 0)
  if (!cleaned.length) return []
  const total = cleaned.reduce((s, r) => s + r.probability, 0)
  if (total <= 0) return []
  return cleaned.sort((a, b) => a.symbol.localeCompare(b.symbol)).map((r) => ({ ...r, probability: r.probability / total }))
}
function buildRanges(rows) {
  let cum = 0
  return rows.map((r) => {
    const low = cum; const high = cum + r.probability; cum = high
    return { ...r, low, high }
  })
}
function arithmeticEncode(text, ranges) {
  let low = 0, high = 1
  const lookup = Object.fromEntries(ranges.map((r) => [r.symbol, r]))
  const steps = []
  for (const symbol of text) {
    const range = lookup[symbol]
    if (!range) return { steps, error: `Symbol "${symbol}" not in model.` }
    const w = high - low
    steps.push({ symbol, low: low + w * range.low, high: low + w * range.high })
    low = steps[steps.length - 1].low
    high = steps[steps.length - 1].high
  }
  return { code: (low + high) / 2, low, high, steps, error: '' }
}
function arithmeticDecode(code, length, ranges) {
  if (!Number.isFinite(code) || code <= 0 || code >= 1 || length <= 0) return ''
  let low = 0, high = 1, output = ''
  for (let i = 0; i < length; i++) {
    const w = high - low
    const scaled = (code - low) / w
    const selected = ranges.find((r) => scaled >= r.low && scaled < r.high)
    if (!selected) return output
    output += selected.symbol
    const nl = low + w * selected.low
    const nh = low + w * selected.high
    low = nl; high = nh
  }
  return output
}

/* ─────────────────────────────────────────
   Cursor Glow (global, shared)
───────────────────────────────────────── */
// function CursorGlow() {
//   const ref = useRef(null)
//   useEffect(() => {
//     const move = (e) => {
//       if (ref.current) {
//         ref.current.style.left = e.clientX + 'px'
//         ref.current.style.top = e.clientY + 'px'
//       }
//     }
//     window.addEventListener('mousemove', move)
//     return () => window.removeEventListener('mousemove', move)
//   }, [])
//   return <div className="cursor-glow" ref={ref} />
// }

function useClickParticles() {
  useEffect(() => {
    const holes = []
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;'
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d')

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const DOT_SPACING = 28
    const DOT_COLOR = 'rgba(245,222,101,0.18)'

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const now = Date.now()

      for (let x = DOT_SPACING / 2; x < canvas.width; x += DOT_SPACING) {
        for (let y = DOT_SPACING / 2; y < canvas.height; y += DOT_SPACING) {
          let suppressed = false
          for (const h of holes) {
            const age = (now - h.born) / h.duration
            if (age >= 1) continue
            const eased = 1 - age * age
            const radius = h.maxRadius * eased
            const dist = Math.hypot(x - h.x, y - h.y)
            if (dist < radius) { suppressed = true; break }
          }
          if (!suppressed) {
            ctx.beginPath()
            ctx.arc(x, y, 1.2, 0, Math.PI * 2)
            ctx.fillStyle = DOT_COLOR
            ctx.fill()
          }
        }
      }

      holes.forEach((h, i) => { if (Date.now() - h.born > h.duration) holes.splice(i, 1) })
      requestAnimationFrame(draw)
    }
    draw()

    const onClick = (e) => {
      holes.push({ x: e.clientX, y: e.clientY, born: Date.now(), maxRadius: 80 + Math.random() * 40, duration: 1000 + Math.random() * 500 })
    }
    window.addEventListener('click', onClick)

    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('resize', resize)
      canvas.remove()
    }
  }, [])
}

/* ─────────────────────────────────────────
   Typewriter Hook
───────────────────────────────────────── */
function useTypewriter(text, speed = 60, startDelay = 400) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) { clearInterval(interval); setDone(true) }
      }, speed)
      return () => clearInterval(interval)
    }, startDelay)
    return () => clearTimeout(timeout)
  }, [text, speed, startDelay])
  return { displayed, done }
}

/* ─────────────────────────────────────────
   Nav
───────────────────────────────────────── */
function Nav({ page, setPage }) {
  return (
    <nav className="nav">
      <div className="nav-brand" onClick={() => setPage('landing')}>
        <span className="nav-logo">∿</span>
        <span>ArithCode</span>
      </div>
      <div className="nav-links">
        {['landing', 'simulator', 'about'].map((p) => (
          <button
            key={p}
            className={`nav-btn${page === p ? ' active' : ''}`}
            onClick={() => setPage(p)}
          >
            {p === 'landing' ? 'Home' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
    </nav>
  )
}

/* ─────────────────────────────────────────
   Landing Page
───────────────────────────────────────── */
function LandingPage({ setPage }) {
  const { displayed, done } = useTypewriter('Encode everything,\none bit at a time.', 55, 600)

  return (
    <div className="landing">
      <div className="landing-content">
        <div style={{ marginBottom: '2.2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <div className="landing-badge">ITC-IA II · Batch A2</div>
            <div className="landing-badge">Kanishk Thacker · Purab Thakkar · Yash Thakkar · Madhura Thorat · Biyas Maji</div>
        </div>
        <h1 className="landing-title">
          {displayed}
          {!done && <span className="cursor-blink" />}
        </h1>

        <p className="landing-sub">
          Arithmetic coding compresses any message into a single floating-point number.
          Watch every symbol narrow the interval until only one value remains.
        </p>

        <div className="landing-cta">
          <button className="btn-primary" onClick={() => setPage('simulator')}>
            Open Simulator →
          </button>
          <button className="btn-ghost" onClick={() => setPage('about')}>
            How it works
          </button>
        </div>
      </div>

      <div className="landing-features">
        {[
          { icon: '{ }', title: 'Custom Model', desc: 'Define symbol probabilities or auto-generate them from any input text.' },
          { icon: '→', title: 'Live Encoding', desc: 'Each symbol narrows the interval in real time with animated progress bars.' },
          { icon: '↺', title: 'Decode & Verify', desc: 'Decode the tag back and confirm byte-perfect lossless reconstruction.' },
        ].map((f) => (
          <div className="feat-card" key={f.title}>
            <div className="feat-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────
   About Page
───────────────────────────────────────── */
function AboutPage({ setPage }) {
  const steps = [
    { n: '01', title: 'Assign Probabilities', body: 'Every symbol in your alphabet gets a probability. Higher probability = wider slice of the [0, 1) interval.', example: 'A=0.5, B=0.3, C=0.2' },
    { n: '02', title: 'Build Cumulative Ranges', body: 'Ranges are stacked end-to-end: A=[0, 0.5), B=[0.5, 0.8), C=[0.8, 1.0).', example: 'A:[0, 0.5) · B:[0.5, 0.8) · C:[0.8, 1.0)' },
    { n: '03', title: 'Narrow the Interval', body: 'For each symbol in the message, shrink the current interval to the sub-range for that symbol.', example: '"AB": [0,1) → [0, 0.5) → [0.35, 0.5)' },
    { n: '04', title: 'Emit the Tag', body: 'Pick any number in the final interval — usually the midpoint. This single float represents the entire message.', example: 'midpoint of [0.35, 0.5) = 0.425' },
    { n: '05', title: 'Decode by Scaling', body: 'Repeatedly find which symbol range contains the tag, emit that symbol, then scale into that sub-range.', example: '0.425 → A (in [0, 0.5)) → B (in [0.5, 0.8))' },
  ]
  return (
    <div className="about-page">
      <div className="about-header">
        <p className="eyebrow">What is it?</p>
        <h1>Arithmetic Coding</h1>
        <p className="about-lead">
          A lossless data compression algorithm that encodes an entire message as a single
          rational number in [0, 1). Unlike Huffman coding — which assigns codes per-symbol —
          arithmetic coding operates on the whole message, approaching the entropy limit for
          any probability distribution.
        </p>
      </div>

      <div className="steps-grid">
        {steps.map((s) => (
          <div className="step-card" key={s.n}>
            <div className="step-num">{s.n}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <code className="step-example">{s.example}</code>
          </div>
        ))}
      </div>

      <div className="about-compare">
        <h2>Why not Huffman?</h2>
        <div className="compare-grid">
          <div className="compare-col">
            <div className="compare-label huffman">Huffman</div>
            <ul>
              <li>Assigns whole-bit codes per symbol</li>
              <li>Cannot go below 1 bit/symbol</li>
              <li>Suboptimal for skewed distributions</li>
              <li>Fast &amp; simple to implement</li>
            </ul>
          </div>
          <div className="compare-col">
            <div className="compare-label arithmetic">Arithmetic</div>
            <ul>
              <li>Encodes the entire message at once</li>
              <li>Approaches entropy limit arbitrarily close</li>
              <li>Handles any probability distribution</li>
              <li>Basis of modern video codecs (CABAC)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="about-cta">
        <p>Ready to try it yourself?</p>
        <button className="btn-primary" onClick={() => setPage('simulator')}>
          Open the Simulator →
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────
   Simulator Page
───────────────────────────────────────── */
function SimulatorPage() {
  const [inputText, setInputText] = useState('')
  const [modelRows, setModelRows] = useState([])
  const [decodeLengthInput, setDecodeLengthInput] = useState('')

  const ranges = useMemo(() => buildRanges(normalizeRows(modelRows)), [modelRows])
  const sanitizedInput = useMemo(() => sanitizeText(inputText, ranges.map((r) => r.symbol)), [inputText, ranges])

  const parsedDecodeLength = decodeLengthInput === '' ? NaN : Number(decodeLengthInput)
  const hasValidDecodeLength = Number.isInteger(parsedDecodeLength) && parsedDecodeLength > 0

  const result = useMemo(() => arithmeticEncode(sanitizedInput, ranges), [sanitizedInput, ranges])
  const decodedText = useMemo(
    () => arithmeticDecode(result.code, hasValidDecodeLength ? parsedDecodeLength : 0, ranges),
    [result.code, hasValidDecodeLength, parsedDecodeLength, ranges],
  )
  const probabilityTotal = useMemo(
    () => normalizeRows(modelRows).reduce((s, r) => s + r.probability, 0),
    [modelRows],
  )

  const updateRow = (index, key, value) =>
    setModelRows((prev) => prev.map((row, i) => i !== index ? row : { ...row, [key]: key === 'probability' ? Number(value) : value }))

  const addRow = () => setModelRows((prev) => [...prev, { symbol: '', probability: 0 }])
  const removeRow = (index) => setModelRows((prev) => prev.filter((_, i) => i !== index))

  const autoBuildModel = () => {
    const clean = inputText.toUpperCase().replace(/[^A-Z]/g, '')
    setModelRows(computeModel(clean))
    setDecodeLengthInput(clean ? String(clean.length) : '')
    setInputText(clean)
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">ITC-IA II · Batch A2</p>
        <h1>Arithmetic Coding Simulator</h1>
        <p className="hero-copy">Interactive simulator with symbol probabilities, interval narrowing, and decode validation.</p>
      </header>

      <section className="grid">
        <div className="card">
          <h2>01 — Source Text</h2>
          <label htmlFor="message">Message (A–Z):</label>
          <textarea
            id="message"
            value={inputText}
            onChange={(e) => setInputText(e.target.value.toUpperCase())}
            rows={4}
          />
          <p className="note">
            Cleaned input: <code>{sanitizedInput || '(empty)'}</code>
          </p>
          <button type="button" onClick={autoBuildModel} style={{ marginTop: '0.6rem' }}>
            Auto-build model from text
          </button>
        </div>

        <div className="card">
          <h2>02 — Probability Model</h2>
          <div className="table-head">
            <span>Symbol</span><span>Probability</span><span>Action</span>
          </div>
          <div className="rows">
            {modelRows.map((row, index) => (
              <div className="row" key={`${row.symbol}-${index}`}>
                <input
                  aria-label="symbol"
                  maxLength={1}
                  value={row.symbol}
                  onChange={(e) => updateRow(index, 'symbol', e.target.value.toUpperCase())}
                />
                <input
                  aria-label="probability"
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.probability}
                  onChange={(e) => updateRow(index, 'probability', e.target.value)}
                />
                <button type="button" className="ghost" onClick={() => removeRow(index)}>✕</button>
              </div>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={addRow}>+ Add Symbol</button>
            <p className={Math.abs(probabilityTotal - 1) < 0.0001 ? 'ok' : 'warn'}>
              Σ = {probabilityTotal.toFixed(4)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>03 — Interval Steps</h2>
          {result.error && <p className="warn">{result.error}</p>}
          {!result.error && result.steps.length === 0 && (
            <p className="note">Enter text and model symbols to start encoding.</p>
          )}
          <div className="steps">
            {result.steps.map((step, index) => (
              <div className="step" key={`${step.symbol}-${index}`}>
                <div className="step-meta">
                  <strong>Step {index + 1}: "{step.symbol}"</strong>
                  <span>[{step.low.toFixed(4)}, {step.high.toFixed(4)})</span>
                </div>
                <div className="bar">
                  <div
                    className="fill"
                    style={{
                      left: `${step.low * 100}%`,
                      width: `${Math.max((step.high - step.low) * 100, 0.8)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {!result.error && result.steps.length > 0 && (
            <div className="final-values">
              <strong>Final Encoded Values</strong>
              <p>Low: <code>{result.low.toFixed(6)}</code></p>
              <p>High: <code>{result.high.toFixed(6)}</code></p>
              <p>Tag (midpoint): <code>{result.code.toFixed(6)}</code></p>
            </div>
          )}
        </div>

        <div className="card">
          <h2>04 — Decode &amp; Verify</h2>
          <p className="metric">
            Final interval:{' '}
            <code>[{Number.isFinite(result.low) ? result.low.toFixed(4) : 'N/A'}, {Number.isFinite(result.high) ? result.high.toFixed(4) : 'N/A'})</code>
          </p>
          <p className="metric">
            Encoded tag: <code>{Number.isFinite(result.code) ? result.code.toFixed(6) : 'N/A'}</code>
          </p>
          <label htmlFor="decode-length" style={{ marginTop: '0.8rem' }}>Decode length:</label>
          <input
            id="decode-length"
            type="number"
            min="0"
            value={decodeLengthInput}
            onChange={(e) => setDecodeLengthInput(e.target.value)}
          />
          {!hasValidDecodeLength && (
            <p className="warn" style={{ marginTop: '0.4rem' }}>Must be a positive integer.</p>
          )}
          <p className="metric" style={{ marginTop: '0.8rem' }}>
            Decoded: <code>{decodedText || '(empty)'}</code>
          </p>
          <p className={hasValidDecodeLength && decodedText === sanitizedInput ? 'ok' : 'warn'}>
            {hasValidDecodeLength && decodedText === sanitizedInput
              ? '✓ Decode matches input.'
              : '✗ Decode does not match input.'}
          </p>
        </div>
      </section>
    </main>
  )
}

/* ─────────────────────────────────────────
   Root App
───────────────────────────────────────── */
export default function App() {
  const [page, setPage] = useState('landing')
  useClickParticles()

  return (
    <>
      {/* <CursorGlow /> */}
      <Nav page={page} setPage={setPage} />
      {page === 'landing'   && <LandingPage setPage={setPage} />}
      {page === 'simulator' && <SimulatorPage />}
      {page === 'about'     && <AboutPage setPage={setPage} />}
    </>
  )
}