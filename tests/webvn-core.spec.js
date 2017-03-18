describe('WebVn player', function() {
  it('initializes with first currentPrompt', function() {
    let promptTree = [{text: 'testNode'}];
    let player = new WebVn.Player(promptTree);
    expect(player.getCurrentPrompt()).toEqual({text: 'testNode'});
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
