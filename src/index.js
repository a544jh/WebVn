import 'yuki-createjs';
import Elm from './elm/MyPortModule.elm';
import './index.html';

const stage = new createjs.Stage('easelCanvas');

const helloWorld = new createjs.Text('Hello World', "16px 'Arial'");

stage.addChild(helloWorld);

stage.update();

const elmApp = Elm.MyPortModule;

elmApp.embed(document.getElementById('elmDiv'), "asd");
window.setTimeout( () =>
elmApp.ports.jsUpdate.subscribe(model => {
  console.log(model);
}));