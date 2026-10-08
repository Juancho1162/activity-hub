import { Reveal, Scene, useScene } from 'beatdeck';
import { Check } from '../components';
function Content() {
  const { here, b } = useScene();
  const marked = [1, 3, 6, 8];
  return <>
    <Reveal on={here} x={140} y={200} className="hub-scene-heading"><div className="hub-kicker">03 · Observa</div><h2 className="hub-title" style={{ marginTop: 30 }}>Tu actividad, a simple vista.</h2></Reveal>
    <Reveal on={here} x={140} y={430}><div className="hub-panel" style={{ width: 1630, height: 324, padding: 38 }}>
      <div style={{ position: 'absolute', left: 40, top: 34 }}><span style={{ fontSize: 28 }}>Guitarra</span><p className="hub-copy" style={{ fontSize: 22, marginTop: 12 }}>1–10 octubre 2026 · ejemplo ilustrativo</p></div>
      <div className="hub-grid" style={{ position: 'absolute', left: 40, top: 170 }}>{Array.from({ length: 10 }, (_, i) => <div key={i} className={`hub-day${marked.includes(i + 1) ? ' marked' : ''}`}><span>{i + 1}</span><Check small marked={marked.includes(i + 1)} /></div>)}</div>
      <div style={{ position: 'absolute', left: 1130, top: 64 }}><div className="pixel" style={{ fontSize: 70, color: 'var(--accent)' }}>40%</div><p className="hub-copy" style={{ fontSize: 22, width: 420, marginTop: 26 }}>4 de 10 días registrados</p></div>
    </div></Reveal>
    <Reveal on={here && b === 0} x={140} y={834} className="hub-scene-caption"><p className="hub-copy">El porcentaje describe tus registros, sin puntuar tu esfuerzo.</p></Reveal>
    <Reveal on={here && b === 1} x={140} y={814} className="hub-scene-caption"><p style={{ fontSize: 30, margin: 0 }}>Cada marca muestra <span style={{ color: 'var(--oxide)' }}>un día de actividad.</span></p><p className="hub-copy" style={{ fontSize: 24, marginTop: 20 }}>Consulta cuándo has dedicado tiempo a cada frente.</p></Reveal>
  </>;
}
export const Observe = () => <Scene index={3}><Content /></Scene>;
