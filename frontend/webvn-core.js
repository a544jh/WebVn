this.WebVn = this.WebVn || {};
(function(WebVn) {
  WebVn.Prompt = class {
  };

  WebVn.AnimatiblePrompt = class extends WebVn.Prompt {
    /**
    * Prompt that gets displayed by renderer.
    */
    constructor() {
      super();
      // TODO: bg, sprites, sound...
    }
  };

  WebVn.TextNode = class {
    /**
     * Renderable text node.
     * @param {string} text string
     */
    constructor(text) {
      this.text = text;
    }
  };

  WebVn.TextPrompt = class extends WebVn.AnimatiblePrompt {
    /**
    * Contains any kind of displayable text.
    * @param {Array<TextNode>} textNodes
    */
    constructor(textNodes) {
      super();
      this.textNodes = textNodes;
    }
  };

  // TODO: adv, fullscreen, note, freeform

  // TODO: decision

  WebVn.ControlStructure = class extends WebVn.Prompt {
  };

  WebVn.Jump = class extends WebVn.ControlStructure {
    /**
    * Jump to specified label.
    * @param  {string} label label to jump to
    */
    constructor(label) {
      super();
      this.label = label;
    }
  };

  // TODO: contitionalJump

  WebVn.Player = class Player {
    /**
    * Vn player instance.
    * @param {PromptTree} promptTree - initial compiled promptTree.
    */
    constructor(promptTree) {
      this.promptTree = promptTree;
      let promptIndex = 0; // number
      this.getCurrentPrompt = function() {
        return promptTree[promptIndex];
      };
      /**
       * Advances the player to the next prompt according to current state.
       * @return {AnimatiblePrompt} The next AnimatiblePrompt.
       */
      this.advance = function() {
        while (true) {
          promptIndex++;
          if (this.getCurrentPrompt() instanceof WebVn.ControlStructure) {
            // TODO: jump to label
          } else if (this.getCurrentPrompt()
              instanceof WebVn.AnimatiblePrompt) {
            return this.getCurrentPrompt();
          } else {
            return null;
          }
        }
      };
    }
  };
})(WebVn);
