import 'yuki-createjs';
import Elm from './elm/Main.elm';
import './index.html';

const stage = new createjs.Stage('easelCanvas');

const helloWorld = new createjs.Text('Hello World', "16px 'Arial'");

stage.addChild(helloWorld);

stage.update();

const elmApp = Elm.Main.embed(document.getElementById('elmDiv'), "asd");
elmApp.ports.jsUpdate.subscribe(model => {
  console.log(model);
  helloWorld.text = "Got msg from Elm!";
  stage.update();
});

document.getElementById("toElm").addEventListener('click', () => {
  elmApp.ports.jsCmd.send({
    cmd : "asd",
    payload : "asd"
  });
});