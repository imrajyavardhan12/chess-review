import { useEffect, useRef, useState } from 'react'
import { setPrefs } from './prefs'
import { EngineDownloadError, fullEngine, type Progress } from './services'

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(0)} MB`

type Phase =
  { step: 'ask' } | { step: 'downloading'; progress: Progress } | { step: 'failed'; message: string }

/**
 * Explains the accurate engine and downloads it on request. Shown when someone picks "Accurate"
 * before it is on their device, or wants to remove it again.
 */
export function EngineDialog({
  installed,
  onClose,
  onChanged,
}: {
  installed: boolean
  onClose: () => void
  /** The download finished or was removed. */
  onChanged: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [phase, setPhase] = useState<Phase>({ step: 'ask' })
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const d = ref.current!
    if (!d.open) d.showModal()
    return () => abort.current?.abort()
  }, [])

  if (!fullEngine) return null
  const size = mb(fullEngine.manifest.bytes)

  async function download() {
    const controller = new AbortController()
    abort.current = controller
    setPhase({ step: 'downloading', progress: { received: 0, total: fullEngine!.manifest.bytes } })
    try {
      await fullEngine!.install((progress) => setPhase({ step: 'downloading', progress }), controller.signal)
      setPrefs({ engine: 'accurate' })
      onChanged()
      onClose()
    } catch (e) {
      if (controller.signal.aborted) setPhase({ step: 'ask' })
      else setPhase({ step: 'failed', message: e instanceof EngineDownloadError ? e.message : String(e) })
    }
  }

  async function remove() {
    await fullEngine!.remove()
    setPrefs({ engine: 'standard' })
    onChanged()
    onClose()
  }

  return (
    <dialog ref={ref} className="engine-dialog" aria-labelledby="engine-title" onClose={onClose}>
      <h2 id="engine-title">Accurate engine</h2>
      <p>
        The accurate engine is Stockfish 19 with its full neural network: the same evaluations as Stockfish on
        a desktop, where the standard engine is typically off by about 2% of win chance. It is a <b>{size}</b>{' '}
        download, once, kept in this browser.
      </p>
      <p className="muted">
        It is about half as fast per position as the standard engine and needs about 500 MB of memory for each
        core it uses, so it uses at most two. Reviews made with it are kept apart from standard ones. Nothing
        is sent anywhere: the file comes from this site’s download location and is checked against its
        fingerprint before it is used.
      </p>
      {phase.step === 'downloading' && (
        <div className="download" role="status">
          <div className="bar">
            <div style={{ width: `${(phase.progress.received / phase.progress.total) * 100}%` }} />
          </div>
          <p className="muted nums">
            {mb(phase.progress.received)} of {mb(phase.progress.total)}
          </p>
        </div>
      )}
      {phase.step === 'failed' && (
        <p className="error" role="alert">
          {phase.message}
        </p>
      )}
      <div className="dialog-actions">
        {phase.step === 'downloading' ? (
          <button className="ghost" onClick={() => abort.current?.abort()}>
            Cancel download
          </button>
        ) : installed ? (
          <>
            <button className="ghost" onClick={() => void remove()}>
              Remove it ({size})
            </button>
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <button className="ghost" onClick={onClose}>
              Keep the standard engine
            </button>
            <button className="primary" onClick={() => void download()}>
              Download {size}
            </button>
          </>
        )}
      </div>
    </dialog>
  )
}
