window.addEventListener('load', init);


function init() {

  WebFont.load({
      google: {
        families: ['Press Start 2P']
      }
    });

  var ticks = 0;
  var type = "WebGL"
  if(!PIXI.utils.isWebGLSupported()){
    type = "canvas"
  }

  PIXI.utils.sayHello(type)

  let renderer = PIXI.autoDetectRenderer();
  renderer.backgroundColor = 0xFFFFFF;
  document.body.appendChild(renderer.view);
  let stage = new PIXI.Container();

  let nameText = new PIXI.Text("Asd", {
    fontFamily: "Press Start 2p",
    fontSize: 16
  });
  nameText.x = 5;
  nameText.y = 410;
  let bounds = nameText.getBounds();
  nameText.anchor.y = 0.5;

  let nameBox = new PIXI.Graphics();

  let advBox = new PIXI.Graphics();
  advBox.beginFill(0,0.5)
  .drawRect(0, 420, 800, 160)
  .endFill();


  stage.addChild(nameText, nameBox, advBox)

  function typeText(text) {
    let cont = new PIXI.Container();
    stage.addChild(cont);
    let charPos = 0;
    let x = 0, y = 422;
    let dtime = 0;
    PIXI.ticker.shared.add(function() {
      if ( charPos > text.length - 1) {
        cont.destroy(true);
        cont = new PIXI.Container();
        stage.addChild(cont);
        charPos = 0;
        x = 0;
        return;
      }
      dtime += PIXI.ticker.shared.elapsedMS;
      if (dtime < 20) {
        return;
      }
      let style = {
        fontFamily: "Arial",
        fontSize: 16
      };
      let char = new PIXI.Text(text[charPos], style);
      char.x = x; char.y = y;
      let bounds = char.getBounds();
      //let bounds = PIXI.TextMetrics.measureText("asd", style);
      x += bounds.width;
      /*if (text[charPos] === " ") {
      x--;
    }*/
    cont.addChild(char);
    charPos += 1;
    dtime = 0;
  });
}

typeText("The quick brown fox jumps over the lazy dog!");

let testText = new PIXI.Text("The quick brown fox jumps over the lazy dog!", {
  fontFamily: "Arial",
  fontSize: 16
});

testText.x = 0;
testText.y = 422 + 16;

stage.addChild(testText);

PIXI.ticker.shared.add(function () {
  ticks++;
  //nameText.scale.y = Math.sin(ticks * .2) * .5 + .5;
  let bounds = nameText.getBounds();
  //console.log(bounds);
  nameBox.clear();
  nameBox.lineStyle(2,0,.5)
  .drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
  renderer.render(stage);
});
}
