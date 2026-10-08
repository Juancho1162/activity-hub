import { usePos } from 'beatdeck';
import plant from './assets/plant-logo.svg';
import { SCENES } from './scenes';

export function Check({ marked, small = false }: { marked: boolean; small?: boolean }) {
  const tick = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h4v4h4V7h4V3h4v8h-4v8H7v-4H3z" fill="currentColor" /></svg>;
  return small ? (marked ? tick : <span style={{ width: 24, height: 24 }} />) : <div className={`hub-check${marked ? ' marked' : ''}`}>{marked && tick}</div>;
}
export function Plant({ size = 64 }: { size?: number }) {
  return <img className="hub-plant" src={plant} width={size} height={size} alt="Plantita de Activity Hub" />;
}
export function Chrome() {
  const { s, b } = usePos();
  if (s === 0 && b === 0) return null;
  const position = SCENES.slice(0, s).reduce((sum, scene) => sum + scene.beats.length, 0) + b;
  return <div className="hub-chrome hub-composition">
    <div className="hub-chrome-top"><div className="hub-chrome-brand"><Plant size={70} /><span className="pixel" style={{ fontSize: 22 }}>Activity Hub</span></div><span>{SCENES[s].title}</span></div>
    <div className="hub-chrome-bottom"><span>Tu registro de actividad.</span><div className="hub-progress" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i < position ? 'done' : ''} />)}</div><span className="mono">{String(s + 1).padStart(2, '0')} / 05</span></div>
  </div>;
}
