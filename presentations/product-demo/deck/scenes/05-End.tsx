import { QR, Reveal, Scene, useScene } from 'beatdeck';
import { Plant } from '../components';
import { config } from '../deck.config';
function Content() {
  const { here, b } = useScene();
  return <>
    <Reveal on={here} x={140} y={212} className="hub-scene-heading"><div className="hub-kicker">Sencillo y privado</div><h2 className="hub-title" style={{ marginTop: 36 }}>Empieza por un frente.</h2></Reveal>
    <Reveal on={here} x={140} y={412} style={{ width: 960, textAlign: 'center' }}><p className="hub-copy" style={{ color: 'var(--ink)', fontSize: 28 }}>Tu contenido se cifra en el navegador.</p><p className="hub-copy" style={{ marginTop: 28 }}>Una cuenta. Un código privado.</p></Reveal>
    <Reveal on={here} x={140} y={632}><div className="hub-panel" style={{ width: 960, textAlign: 'center', padding: '28px 34px', borderColor: 'var(--oxide)' }}><p style={{ fontSize: 22, margin: 0, color: 'var(--oxide)' }}>Guarda tu código: no hay recuperación.</p></div></Reveal>
    <Reveal on={here && b === 0} x={1330} y={412}><Plant size={300} /></Reveal>
    <Reveal on={here && b === 1} x={1300} y={404}><QR url={config.qrUrl} size={340} /><p className="hub-copy" style={{ width: 380, marginLeft: -20, fontSize: 20, marginTop: 30, textAlign: 'center' }}>{config.qrLabel}</p></Reveal>
    <Reveal on={here && b === 1} x={140} y={838} delay={200} className="hub-scene-caption"><p className="pixel" style={{ fontSize: 28 }}>Crea un frente. Marca tu primer día.</p></Reveal>
  </>;
}
export const End = () => <Scene index={4}><Content /></Scene>;
