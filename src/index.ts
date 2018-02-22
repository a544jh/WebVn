import './index.html';
import { VnPlayer } from './core/player';

const vnPlayer = new VnPlayer()

document.write(JSON.stringify(vnPlayer.state))