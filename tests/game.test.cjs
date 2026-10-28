"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(saved = null) {
  // Real production logic; only browser input, display and storage are replaced.
  const math = Object.create(Math);
  math.random = () => 0;
  const context = vm.createContext({ Math: math });
  for (const file of ["tile.js", "grid.js", "game_manager.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"),
      context, { filename: file });
  }
  class Input {
    constructor() { this.events = {}; }
    on(name, callback) { this.events[name] = callback; }
  }
  class Actuator {
    actuate(grid, metadata) { this.last = clone({ grid: grid.serialize(), metadata }); }
    continueGame() {}
  }
  class Storage {
    constructor() { this.state = saved && clone(saved); this.best = 0; }
    getGameState() { return this.state && clone(this.state); }
    setGameState(state) { this.state = clone(state); }
    clearGameState() { this.state = null; }
    getBestScore() { return this.best; }
    setBestScore(score) { this.best = score; }
  }
  const game = new context.GameManager(4, Input, Actuator, Storage);
  return { game, context };
}
function board(f, rows, score = 0) {
  f.game.grid = new f.context.Grid(4);
  rows.forEach((row, y) => row.forEach((value, x) => {
    if (value) f.game.grid.insertTile(new f.context.Tile({ x, y }, value));
  }));
  Object.assign(f.game, { score, over: false, won: false, keepPlaying: false });
}
const rows = game => Array.from({ length: 4 }, (_, y) =>
  Array.from({ length: 4 }, (_, x) => game.grid.cellContent({ x, y })?.value || 0));
const count = game => 16 - game.grid.availableCells().length;

test("new game has two tiles, zero score and a persisted board", () => {
  const { game } = fixture();
  assert.equal(count(game), 2);
  assert.equal(game.score, 0);
  assert.deepEqual(game.storageManager.state, clone(game.serialize()));
  assert.equal(game.over, false);
});
for (const [name, direction, x, y] of [
  ["up", 0, 1, 0], ["right", 1, 3, 1], ["down", 2, 1, 3], ["left", 3, 0, 1]
]) {
  test("valid " + name + " move slides tile and spawns exactly one new tile", () => {
    const f = fixture();
    board(f, [[0,0,0,0],[0,8,0,0],[0,0,0,0],[0,0,0,0]]);
    f.game.inputManager.events.move(direction);
    assert.equal(f.game.grid.cellContent({ x, y }).value, 8);
    assert.equal(count(f.game), 2);
    assert.equal(f.game.score, 0);
    assert.deepEqual(f.game.storageManager.state, clone(f.game.serialize()));
  });
}
test("equal tiles merge once per move and add their values to score", () => {
  const f = fixture();
  board(f, [[2,2,4,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 10);
  f.game.move(3);
  assert.deepEqual(rows(f.game)[0], [4,4,0,0]);
  assert.equal(f.game.score, 14);
  assert.equal(count(f.game), 3);
  assert.equal(f.game.storageManager.best, 14);
});
test("four equal tiles produce two independent merges", () => {
  const f = fixture();
  board(f, [[2,2,2,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  f.game.move(3);
  assert.deepEqual(rows(f.game)[0], [4,4,0,0]);
  assert.equal(f.game.score, 8);
});
test("ineffective move changes neither board nor score and spawns nothing", () => {
  const f = fixture();
  board(f, [[2,4,8,16],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 30);
  const before = clone(f.game.serialize());
  f.game.move(3);
  assert.deepEqual(clone(f.game.serialize()), before);
});
test("2048 merge wins and blocks moves until keep playing", () => {
  const f = fixture();
  board(f, [[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  f.game.move(3);
  assert.equal(f.game.won, true);
  assert.equal(f.game.score, 2048);
  assert.equal(f.game.isGameTerminated(), true);
  const before = clone(f.game.serialize());
  f.game.move(2);
  assert.deepEqual(clone(f.game.serialize()), before);
  f.game.inputManager.events.keepPlaying();
  assert.equal(f.game.isGameTerminated(), false);
});
test("last valid move followed by a filled board detects game over", () => {
  const f = fixture();
  board(f, [[0,4,8,16],[8,16,32,64],[16,32,64,128],[32,64,128,256]]);
  f.game.move(3);
  assert.equal(f.game.over, true);
  assert.equal(f.game.movesAvailable(), false);
  assert.equal(f.game.storageManager.state, null);
});
test("full board with adjacent equal tiles still has a legal move", () => {
  const f = fixture();
  board(f, [[2,2,8,16],[4,8,16,32],[8,16,32,64],[16,32,64,128]]);
  assert.equal(f.game.movesAvailable(), true);
});
test("saved state restores board, score and termination flags", () => {
  const f = fixture();
  board(f, [[2,4,0,0],[0,8,0,0],[0,0,16,0],[0,0,0,32]], 124);
  f.game.won = true;
  f.game.keepPlaying = true;
  const saved = clone(f.game.serialize());
  assert.deepEqual(clone(fixture(saved).game.serialize()), saved);
});
test("restart resets board and score while retaining best score", () => {
  const f = fixture();
  board(f, [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 100);
  f.game.move(3);
  f.game.inputManager.events.restart();
  assert.equal(count(f.game), 2);
  assert.equal(f.game.score, 0);
  assert.equal(f.game.won, false);
  assert.equal(f.game.over, false);
  assert.equal(f.game.storageManager.best, 104);
  assert.deepEqual(f.game.storageManager.state, clone(f.game.serialize()));
});

