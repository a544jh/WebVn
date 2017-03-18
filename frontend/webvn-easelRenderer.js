window.addEventListener('load', init);

/**
* initialize the rendering context...
*/
function init() {
  let stage = new createjs.Stage('webvn-canvas');

  let player = new WebVn.Player(
    [new WebVn.TextPrompt([new WebVn.TextNode('asd')])]);
    createjs.Ticker.framerate = 60;

    let nametag = new createjs.Text(player.advance().textNodes[0].text
    , '16px \'Press Start 2P\''); // maybe get the nametag instaed :P
    nametag.x = 5;
    nametag.y = 410;
    let origbounds = nametag.getBounds();
    nametag.regY = origbounds.height / 2;

    let gfx = new createjs.Graphics();

    let bbox = new createjs.Shape(gfx);

    let advg = new createjs.Graphics();
    let adv = new createjs.Shape(advg);
    advg.beginFill('black');
    advg.rect(0, 420, 800, 160);
    adv.alpha = .5;

    stage.addChild(nametag);
    stage.addChild(bbox);
    stage.addChild(adv);

    createjs.Ticker.addEventListener('tick', function() {
      let ticks = createjs.Ticker.getTicks();
      nametag.scaleY = Math.sin(ticks * .2) * .5 + .5;

      let bounds = nametag.getTransformedBounds();

      gfx.clear();
      gfx.setStrokeStyle(1, 2)
      .beginStroke('black')
      .r(bounds.x, bounds.y, bounds.width, bounds.height);
      stage.update();
    });
  }
