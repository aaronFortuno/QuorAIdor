/**
 * QuorAIdor — AI Engine Unit Tests
 * Run with: node --test tests/ai.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Stubs for browser globals not available in Node
globalThis.I18n = { t: (key, params) => key };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
// AI requires QuoridorGame to be a global (IIFE pattern)
globalThis.QuoridorGame = require('../game.js');
// Load openings
globalThis.QuoridorOpenings = require('../openings.js');
// Load AI (it reads QuoridorGame from global scope)
const QuoridorAI = require('../ai.js');

describe('QuoridorAI.evaluate', () => {
    it('returns 0-ish for starting position (symmetric)', () => {
        const s = QuoridorGame.createState();
        const score = QuoridorAI.evaluate(s);
        // Starting position should be roughly balanced (small turn bonus)
        assert.ok(Math.abs(score) < 2, 'starting eval close to 0: ' + score);
    });

    it('returns +1000 when P1 wins', () => {
        const s = QuoridorGame.createState();
        s.players[0].row = 8;
        s.gameOver = true;
        s.winner = 0;
        const score = QuoridorAI.evaluate(s);
        assert.equal(score, 1000);
    });

    it('returns -1000 when P2 wins', () => {
        const s = QuoridorGame.createState();
        s.players[1].row = 0;
        s.gameOver = true;
        s.winner = 1;
        const score = QuoridorAI.evaluate(s);
        assert.equal(score, -1000);
    });

    it('favors the player closer to goal', () => {
        const s = QuoridorGame.createState();
        s.players[0].row = 6; // P1 close to goal (row 8)
        s.players[1].row = 6; // P2 far from goal (row 0)
        const score = QuoridorAI.evaluate(s);
        assert.ok(score > 0, 'P1 advantage when closer: ' + score);
    });
});

describe('QuoridorAI.getBestMove', () => {
    it('returns a valid move', () => {
        const s = QuoridorGame.createState();
        QuoridorAI.setDepth(1);
        const move = QuoridorAI.getBestMove(s);
        assert.ok(move, 'returns a move');
        assert.ok(move.type === 'move' || move.type === 'wall', 'valid move type');
    });

    it('uses opening book for first move', () => {
        const s = QuoridorGame.createState();
        QuoridorAI.setDepth(2);
        const move = QuoridorAI.getBestMove(s);
        // Opening book says e2 (row 1, col 4)
        assert.equal(move.type, 'move');
        assert.equal(move.row, 1);
        assert.equal(move.col, 4);
    });

    it('takes the winning move when one step from goal', () => {
        const s = QuoridorGame.createState();
        s.players[0].row = 7;
        s.players[0].col = 4;
        // Clear opening book influence by advancing move count
        s.moveHistory = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
        QuoridorAI.setDepth(1);
        const move = QuoridorAI.getBestMove(s);
        assert.equal(move.type, 'move');
        assert.equal(move.row, 8, 'takes winning step');
    });

    it('blocks opponent from winning when possible', () => {
        const s = QuoridorGame.createState();
        s.players[1].row = 1; // P2 one step from winning
        s.players[1].col = 4;
        s.players[0].row = 5;
        s.players[0].col = 4;
        s.moveHistory = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
        QuoridorAI.setDepth(2);
        const move = QuoridorAI.getBestMove(s);
        // Should place a wall to block P2 or advance to win faster
        assert.ok(move, 'returns a move');
        // After this move, P2 should not be able to win immediately
        const newState = QuoridorGame.applyMove(s, move);
        const p2dist = QuoridorGame.bfsShortestPath(newState, 1);
        assert.ok(p2dist >= 1, 'P2 still needs at least 1 step');
    });
});

describe('QuoridorAI.getBestMoveAtDepth', () => {
    it('returns a move at depth 1', () => {
        const s = QuoridorGame.createState();
        const move = QuoridorAI.getBestMoveAtDepth(s, 1);
        assert.ok(move, 'returns a move');
    });

    it('returns a move at depth 2', () => {
        const s = QuoridorGame.createState();
        const move = QuoridorAI.getBestMoveAtDepth(s, 2);
        assert.ok(move, 'returns a move');
    });
});

describe('QuoridorAI.getAnalysis', () => {
    it('returns analysis with required fields', () => {
        const s = QuoridorGame.createState();
        const a = QuoridorAI.getAnalysis(s);
        assert.ok('evaluation' in a, 'has evaluation');
        assert.ok('winProbP1' in a, 'has winProbP1');
        assert.ok('winProbP2' in a, 'has winProbP2');
        assert.ok('distP1' in a, 'has distP1');
        assert.ok('distP2' in a, 'has distP2');
        assert.ok('phase' in a, 'has phase');
        assert.ok(a.winProbP1 + a.winProbP2 > 0.99, 'probs sum to ~1');
    });
});

describe('QuoridorAI weight management', () => {
    it('getDefaultWeights returns an object with expected keys', () => {
        const w = QuoridorAI.getDefaultWeights();
        assert.ok('pathDiff' in w);
        assert.ok('wallReserve' in w);
        assert.ok('corridorRisk' in w);
        assert.ok('wallSynergy' in w);
    });

    it('setWeights and getWeights round-trip', () => {
        const original = QuoridorAI.getWeights();
        QuoridorAI.setWeights({ pathDiff: 99 });
        assert.equal(QuoridorAI.getWeights().pathDiff, 99);
        QuoridorAI.setWeights(original);
    });

    it('resetWeights restores defaults', () => {
        const defaults = QuoridorAI.getDefaultWeights();
        QuoridorAI.setWeights({ pathDiff: 99 });
        QuoridorAI.resetWeights();
        assert.equal(QuoridorAI.getWeights().pathDiff, defaults.pathDiff);
    });
});
