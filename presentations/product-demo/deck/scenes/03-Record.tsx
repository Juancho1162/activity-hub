import { Reveal, Scene, useScene } from 'beatdeck';
import { Check } from '../components';
function Content() {
  const { here, b } = useScene();
  return <>
    <Reveal on={here} x={140} y={200} className="hub-scene-heading"><div className="hub-kicker">02 · Registra</div><h2 className="hub-title" style={{ marginTop: 30 }}>Un día. Un check.</h2></Reveal>
    <Reveal on={here} x={140} y={430}><div style={{ width: 680 }}><p className="pixel" style={{ fontSize: 24, marginBottom: 32 }}>Registro</p><div className="hub-rule" />
      <p className="hub-copy" style={{ marginTop: 32 }}>8 de octubre de 2026</p><p className="hub-copy" style={{ fontSize: 20, marginTop: 12 }}>Europe/Madrid · ejemplo ilustrativo</p>
    </div></Reveal>
    <Reveal on={here} x={1045} y={437}><div className="hub-panel" style={{ width: 640, height: 220, padding: 24 }}>
      <span className="hub-badge">Abierto</span><div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 40 }}>Guitarra</span><Check marked={b >= 1} /></div>
    </div></Reveal>
    <Reveal on={here && b === 0} x={140} y={778} className="hub-scene-caption"><p className="hub-copy" style={{ fontSize: 32 }}>Elige el día que quieres registrar.</p></Reveal>
    <Reveal on={here && b === 1} x={140} y={778} className="hub-scene-caption"><p className="hub-copy" style={{ fontSize: 32, color: 'var(--accent)' }}>Marca lo que has hecho.</p></Reveal>
    <Reveal on={here && b === 1} x={140} y={866} delay={160} className="hub-scene-caption"><p className="hub-copy" style={{ fontSize: 24 }}>También puedes completar o corregir días pasados.</p></Reveal>
  </>;
}
export const Record = () => <Scene index={2}><Content /></Scene>;
