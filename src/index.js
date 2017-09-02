import 'yuki-createjs';

import './index.html';

import Elm from './elm/Main.elm';

const stage = new createjs.Stage('easelCanvas');

const helloWorld = new createjs.Text('Hello World', "16px 'Arial'");

stage.addChild(helloWorld);

stage.update();

Elm.Main.embed(document.getElementById('elmDiv'));