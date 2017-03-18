describe('WebVn player', function() {
  it('returns first AnimatablePrompt when advanced once', function() {
    let initialPrompt = new WebVn.AnimatablePrompt();
    let promptTree = [initialPrompt, new WebVn.Prompt()];
    let player = new WebVn.Player(promptTree);
    player.advance();
    expect(player.getCurrentPrompt()).toEqual(initialPrompt);
  });

  it('advance returns next AnimatibleState', function() {
    let anim = new WebVn.TextPrompt();
    let tree = [new WebVn.Jump(), new WebVn.Jump(), anim];
    let player = new WebVn.Player(tree);
    expect(player.advance()).toBe(anim);
  });

  it('throws error when advancing to invalid node', function() {
    let player = new WebVn.Player(['asd']);
    expect(player.advance).toThrowError();
  });
});
