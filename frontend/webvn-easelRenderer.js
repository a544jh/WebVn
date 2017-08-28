window.addEventListener('load', init);

/**
* initialize the rendering context...
*/
function init() {
  let stage = new createjs.Stage('webvn-canvas');

  let player = new WebVn.Player(
    [new WebVn.TextPrompt([new WebVn.TextNode(
      'The quick brown fox jumps over the lazy dog!')])]);
    createjs.Ticker.framerate = 60;

    let nametag = new createjs.Text('asd'
    , '16px \'Press Start 2P\'');
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

    stage.addChild(nametag, bbox, adv);

    /**
    * type some text into the adv box!
    * @param {string} text - text to type
    */
    function typeWord(text) {
      let container = new createjs.Container();
      stage.addChild(container);
      let pos = 0;
      let x = 0; let y = 422;
      let dtime = 0;
      createjs.Ticker.addEventListener('tick', function(e) {
        if ( pos > text.length - 1) {
          container.removeAllChildren();
          pos = 0;
          x = 0;
          return;
        }
        dtime += e.delta;
        if (dtime < 20) {
          return;
        }
        let ltr = new createjs.Text(text[pos], '16px \'Arial\'');
        ltr.x = x; ltr.y = y;
        let bounds = ltr.getBounds();
        container.addChild(ltr);
        x += bounds.width;
        pos += 1;
        dtime = 0;
        // container.cache(0, 430, 800, 600);

        // let cbounds = container.getBounds();
      });
    }

    typeWord(player.advance().textNodes[0].text);

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
