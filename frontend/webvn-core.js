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

  WebVn.TextPrompt = class extends WebVn.AnimatiblePrompt {
    /**
    * Contains any kind of displayable text.
    */
    constructor() {
      super();
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
      let currentAnimatiblePrompt;
      this.getCurrentPrompt = function() {
        return promptTree[promptIndex];
      };
      this.getCurrentAnimatiblePrompt = function() {
        return promptTree[currentAnimatiblePrompt];
      };
      this.advance = function() {
        while (true) {
          promptIndex++;
          if (this.getCurrentPrompt() instanceof WebVn.ControlStructure) {
            // TODO: jump to label
          } else if (this.getCurrentPrompt()
              instanceof WebVn.AnimatiblePrompt) {
            return this.getCurrentPrompt();
          }
        }
      };
    }
  };
})(WebVn);
