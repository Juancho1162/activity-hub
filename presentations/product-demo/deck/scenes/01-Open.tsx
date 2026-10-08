import { Reveal, Scene, useScene } from 'beatdeck';
import { Plant } from '../components';
import { config } from '../deck.config';
function Content() {
  const { here, b } = useScene();
  return <>
    <Reveal on={here && b === 0} x={0} y={442}><div style={{ width: 1920, display: 'flex', justifyContent: 'center' }}><Plant size={128} /></div></Reveal>
    <Reveal on={here && b === 0} x={0} y={636}><div className="pixel" style={{ width: 1920, textAlign: 'center', fontSize: 20 }}>Un clic para empezar</div></Reveal>
    <Reveal on={here && b === 1} x={140} y={236} style={{ width: 950, textAlign: 'center' }}><div className="hub-kicker">¿En qué estás metido?</div></Reveal>
    <Reveal on={here && b === 1} x={140} y={346} style={{ width: 950, textAlign: 'center' }}><h1 className="pixel" style={{ fontSize: 74, lineHeight: 1.55, margin: 0 }}>Activity<br />Hub<span style={{ color: 'var(--oxide)' }}>.</span></h1></Reveal>
    <Reveal on={here && b === 1} x={140} y={646} delay={160}><p className="hub-copy" style={{ width: 950, textAlign: 'center', fontSize: 28 }}>{config.subtitle}</p></Reveal>
    <Reveal on={here && b === 1} x={1250} y={295} delay={100}><Plant size={384} /></Reveal>
    <Reveal on={here && b === 1} x={140} y={824} delay={260}><div className="hub-rule" style={{ width: 1630 }} /><p className="hub-copy" style={{ marginTop: 30, fontSize: 24, textAlign: 'center' }}>Organiza tus frentes. Marca tus días. Observa tu actividad.</p></Reveal>
  </>;
}
export const Open = () => <Scene index={0}><Content /></Scene>;
