import { defineDeck } from 'beatdeck';
import '../themes/neutral.css';
import './deck.css';
import { config } from './deck.config';
import { SCENES } from './scenes';
import { Chrome } from './components';
import { Open } from './scenes/01-Open';
import { Fronts } from './scenes/02-Fronts';
import { Record } from './scenes/03-Record';
import { Observe } from './scenes/04-Observe';
import { End } from './scenes/05-End';
function Stage() { return <div className="hub-composition"><Open /><Fronts /><Record /><Observe /><End /></div>; }
export default defineDeck({
  id: 'activity-hub-product-demo', title: config.title, lang: 'es', scenes: SCENES, Stage, Chrome,
  fonts: ['400 74px "Press Start 2P"'],
  qrUrl: config.qrUrl,
});
