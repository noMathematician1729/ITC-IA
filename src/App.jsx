import { useMemo, useState } from 'react'
import './App.css'

function sanitizeText(rawText, allowedSymbols) {
  const allowed = new Set(allowedSymbols)
  return rawText
    .toUpperCase()
    .split('')
    .filter((char) => allowed.has(char))
    .join('')
}

function computeModel(text) {
  const counts = {}
  for (const char of text) {
    counts[char] = (counts[char] ?? 0) + 1
  }

  const symbols = Object.keys(counts).sort()
  const total = text.length || 1
  const rows = symbols.map((symbol) => ({
    symbol,
    probability: counts[symbol] / total,
  }))

  return rows
}

function normalizeRows(rows) {
  const cleaned = rows
    .map((row) => ({
      symbol: row.symbol.trim().slice(0, 1).toUpperCase(),
      probability: Number(row.probability) || 0,
    }))
    .filter((row) => row.symbol && row.probability > 0)

  if (!cleaned.length) return []

  const total = cleaned.reduce((sum, row) => sum + row.probability, 0)
  if (total <= 0) return []

  return cleaned
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((row) => ({
      ...row,
      probability: row.probability / total,
    }))
}

function buildRanges(rows) {
  let cumulative = 0
  return rows.map((row) => {
    const low = cumulative
    const high = cumulative + row.probability
    cumulative = high
    return { ...row, low, high }
  })
}

function arithmeticEncode(text, ranges) {
  let low = 0
  let high = 1
  const lookup = Object.fromEntries(ranges.map((row) => [row.symbol, row]))
  const steps = []

  for (const symbol of text) {
    const range = lookup[symbol]
    if (!range) {
      return {
        steps,
        error: `Symbol "${symbol}" is not in the model.`,
      }
    }

    const width = high - low
    const nextLow = low + width * range.low
    const nextHigh = low + width * range.high
    steps.push({ symbol, low: nextLow, high: nextHigh })
    low = nextLow
    high = nextHigh
  }

  const code = (low + high) / 2
  return { code, low, high, steps, error: '' }
}

function arithmeticDecode(code, length, ranges) {
  if (!Number.isFinite(code) || code <= 0 || code >= 1 || length <= 0) return ''

  let low = 0
  let high = 1
  let output = ''

  for (let i = 0; i < length; i += 1) {
    const width = high - low
    const scaled = (code - low) / width
    const selected = ranges.find((row) => scaled >= row.low && scaled < row.high)
    if (!selected) return output
    output += selected.symbol
    const nextLow = low + width * selected.low
    const nextHigh = low + width * selected.high
    low = nextLow
    high = nextHigh
  }

  return output
}

function App() {
  const [inputText, setInputText] = useState('')
  const [modelRows, setModelRows] = useState([])
  const [decodeLengthInput, setDecodeLengthInput] = useState('')

  const ranges = useMemo(() => buildRanges(normalizeRows(modelRows)), [modelRows])
  const sanitizedInput = useMemo(
    () => sanitizeText(inputText, ranges.map((row) => row.symbol)),
    [inputText, ranges],
  )
  const parsedDecodeLength = decodeLengthInput === '' ? NaN : Number(decodeLengthInput)
  const hasValidDecodeLength = Number.isInteger(parsedDecodeLength) && parsedDecodeLength > 0

  const result = useMemo(() => arithmeticEncode(sanitizedInput, ranges), [sanitizedInput, ranges])
  const decodedText = useMemo(
    () => arithmeticDecode(result.code, hasValidDecodeLength ? parsedDecodeLength : 0, ranges),
    [result.code, hasValidDecodeLength, parsedDecodeLength, ranges],
  )

  const probabilityTotal = useMemo(
    () => normalizeRows(modelRows).reduce((sum, row) => sum + row.probability, 0),
    [modelRows],
  )

  const updateRow = (index, key, value) => {
    setModelRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        return {
          ...row,
          [key]: key === 'probability' ? Number(value) : value,
        }
      }),
    )
  }

  const addRow = () => {
    setModelRows((prev) => [...prev, { symbol: '', probability: 0 }])
  }

  const removeRow = (index) => {
    setModelRows((prev) => prev.filter((_, i) => i !== index))
  }

  const autoBuildModel = () => {
    const clean = inputText.toUpperCase().replace(/[^A-Z]/g, '')
    setModelRows(computeModel(clean))
    setDecodeLengthInput(clean ? String(clean.length) : '')
    setInputText(clean)
  }

  return (
    <main className="page">
      <header className="hero">
      <p className="eyebrow">ITC-IA II : Batch A2</p>
        <p className="eyebrow">Arithmetic Coding Simulator</p>
        <h1>Encode text into one tiny interval.</h1>
        <p className="hero-copy">
          Interactive simulator with symbol probabilities, interval narrowing, and decode validation.
        </p>
      </header>

      <section className="grid">
        <div className="card">
          <h2>1) Source Text</h2>
          <label htmlFor="message">Message (A-Z):</label>
          <textarea
            id="message"
            value={inputText}
            onChange={(event) => setInputText(event.target.value.toUpperCase())}
            rows={4}
          />
          <p className="note">
            Cleaned input used for coding: <code>{sanitizedInput || '(empty)'}</code>
          </p>
          <button type="button" onClick={autoBuildModel}>
            Auto-build model from text
          </button>
        </div>

        <div className="card">
          <h2>2) Probability Model</h2>
          <div className="table-head">
            <span>Symbol</span>
            <span>Probability</span>
            <span>Action</span>
          </div>
          <div className="rows">
            {modelRows.map((row, index) => (
              <div className="row" key={`${row.symbol}-${index}`}>
                <input
                  aria-label="symbol"
                  maxLength={1}
                  value={row.symbol}
                  onChange={(event) => updateRow(index, 'symbol', event.target.value.toUpperCase())}
                />
                <input
                  aria-label="probability"
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.probability}
                  onChange={(event) => updateRow(index, 'probability', event.target.value)}
                />
                <button type="button" className="ghost" onClick={() => removeRow(index)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={addRow}>
              Add Symbol
            </button>
            <p className={Math.abs(probabilityTotal - 1) < 0.0001 ? 'ok' : 'warn'}>
              Normalized sum: {probabilityTotal.toFixed(4)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>3) Interval Steps</h2>
          {result.error && <p className="warn">{result.error}</p>}
          {!result.error && result.steps.length === 0 && (
            <p className="note">Enter text and model symbols to start encoding.</p>
          )}
          <div className="steps">
            {result.steps.map((step, index) => (
              <div className="step" key={`${step.symbol}-${index}`}>
                <div className="step-meta">
                  <strong>
                    Step {index + 1}: "{step.symbol}"
                  </strong>
                  <span>
                    [{step.low.toFixed(3)}, {step.high.toFixed(3)})
                  </span>
                </div>
                <p className="note">
                  Encoded value (midpoint):{' '}
                  <code>{((step.low + step.high) / 2).toFixed(3)}</code>
                </p>
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
              <p>
                Low: <code>{result.low.toFixed(3)}</code>
              </p>
              <p>
                High: <code>{result.high.toFixed(3)}</code>
              </p>
              <p>
                Encoded tag: <code>{result.code.toFixed(3)}</code>
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <h2>4) Encoded Value + Decode</h2>
          <p className="metric">
            Final interval:{' '}
            <code>
              [{Number.isFinite(result.low) ? result.low.toFixed(3) : 'N/A'},{' '}
              {Number.isFinite(result.high) ? result.high.toFixed(3) : 'N/A'})
            </code>
          </p>
          <p className="metric">
            Encoded tag: <code>{Number.isFinite(result.code) ? result.code.toFixed(3) : 'N/A'}</code>
          </p>
          <label htmlFor="decode-length">Decode length:</label>
          <input
            id="decode-length"
            type="number"
            min="0"
            value={decodeLengthInput}
            onChange={(event) => setDecodeLengthInput(event.target.value)}
          />
          {!hasValidDecodeLength && (
            <p className="warn">Decode length must be a non-zero positive integer.</p>
          )}
          <p className="metric">
            Decoded output: <code>{decodedText || '(empty)'}</code>
          </p>
          <p className={hasValidDecodeLength && decodedText === sanitizedInput ? 'ok' : 'warn'}>
            {hasValidDecodeLength && decodedText === sanitizedInput
              ? 'Decode matches input.'
              : 'Decode does not match input.'}
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
