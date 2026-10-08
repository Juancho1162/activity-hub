import { Reveal, Scene, useScene } from 'beatdeck';
function Content() {
  const { here, b } = useScene();
  const fronts = [
    { name: 'Guitarra', kind: 'Una afición', state: 'Abierto', style: '' },
    { name: 'Un curso', kind: 'Tus estudios', state: 'Standby', style: 'standby' },
    { name: 'Un proyecto', kind: 'Algo que construyes', state: 'Archivado', style: 'archived' },
  ];
  return <>
    <Reveal on={here} x={140} y={200} className="hub-scene-heading"><div className="hub-kicker">01 · Organiza</div><h2 className="hub-title" style={{ marginTop: 30 }}>Pon nombre a tus frentes.</h2></Reveal>
    {fronts.map((front, i) => <Reveal key={front.name} on={here} x={230 + i * 500} y={455} delay={i * 100}>
      <div className="hub-panel" style={{ width: 460, height: 240, padding: 28 }}>
        <p className="hub-copy" style={{ fontSize: 20 }}>{front.kind}</p><h3 style={{ fontSize: 32, fontWeight: 400, margin: '18px 0 0' }}>{front.name}</h3>
        <div style={{ marginTop: 20, opacity: b >= 1 ? 1 : 0 }}><span className={`hub-badge ${front.style}`}>{front.state}</span></div>
      </div>
    </Reveal>)}
    <Reveal on={here && b === 0} x={140} y={820} className="hub-scene-caption"><p className="hub-copy">Proyectos, estudios o aficiones. Todo en un mismo lugar.</p></Reveal>
    <Reveal on={here && b === 1} x={140} y={820} className="hub-scene-caption"><p className="hub-copy">Tú decides su estado. Aparcar o archivar conserva el historial.</p></Reveal>
    <Reveal on={here} x={140} y={910} className="hub-scene-caption"><span style={{ fontSize: 20, color: 'var(--ink-2)' }}>Ejemplos ilustrativos</span></Reveal>
  </>;
}
export const Fronts = () => <Scene index={1}><Content /></Scene>;
