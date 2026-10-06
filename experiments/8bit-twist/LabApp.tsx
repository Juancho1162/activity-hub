import { useCallback, useRef, useState } from "react"
import { ThemeProvider, ThemeSelect } from "@/components/Theme"
import { Button } from "@/components/ui/8bit/button"
import type { ActivityApi } from "@/lib/api"
import SampleApp from "./SampleApp"
import { LookProvider, LookSelect } from "./Look"
import { createMemoryApi, sampleClock } from "./memoryApi"

function LabWorkspace({ apiFactory }: { apiFactory: () => ActivityApi }) {
  const [sample, setSample] = useState(() => ({ serial: 0, api: apiFactory() }))
  const [locked, setLocked] = useState(false)
  const lockRef = useRef(false)
  const writeLockChanged = useCallback((value: boolean) => { lockRef.current = value; setLocked(value) }, [])
  function resetSample() {
    if (lockRef.current) return
    setSample((current) => ({ serial: current.serial + 1, api: apiFactory() }))
  }
  return <>
    <header className="lab-controls" aria-label="Controles del laboratorio">
      <div className="lab-context"><strong>LABORATORIO · DATOS FICTICIOS</strong><p>HOY SIMULADO · 04/10/2026 · Europe/Madrid</p></div>
      <div className="lab-selectors"><LookSelect /><ThemeSelect /><Button type="button" variant="outline" font="normal" className="text-button lab-reset" aria-label="Reiniciar muestra" title="Reiniciar muestra" disabled={locked} onClick={resetSample}>Reiniciar muestra</Button></div>
      <p className="lab-note">Mismos frentes y borradores al comparar · Solo en memoria · Referencias solo texto</p>
    </header>
    {/* Only an explicit reset owns this key. Look/theme never key or swap App. */}
    <SampleApp key={sample.serial} api={sample.api} clock={sampleClock} onWriteLockChange={writeLockChanged} />
  </>
}

export function LabApp({ apiFactory = createMemoryApi }: { apiFactory?: () => ActivityApi }) {
  return <ThemeProvider><LookProvider><LabWorkspace apiFactory={apiFactory} /></LookProvider></ThemeProvider>
}
