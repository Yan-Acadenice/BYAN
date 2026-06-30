/**
 * Tests for the BYAN punt-guard detection lib (F3).
 *
 * A punt = the agent ends its turn telling the user to run a command and paste
 * the output, when it could have run it itself this turn. These tests pin the
 * co-occurrence detection (imperative-to-user + runnable command + no Bash call),
 * the creds carve-out (git push / npm publish never flagged), and the legitimate
 * case where the agent DID run the command.
 */

'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const pd = require(path.join(ROOT, '.claude', 'hooks', 'lib', 'punt-detect.js'));

describe('decide — punt detected', () => {
  test('imperative + backticked command + no Bash call -> punt', () => {
    const r = pd.decide({
      lastAssistantText: 'Lance `npm test` et colle la sortie ici stp.',
      toolCallsThisTurn: [],
    });
    expect(r.punt).toBe(true);
    expect(r.cmd).toBe('npm test');
  });

  test('imperative + bare node command + no Bash call -> punt', () => {
    const r = pd.decide({
      lastAssistantText: 'Peux-tu lancer node bin/byan-v2-cli.js elo summary et me donner le retour ?',
      toolCallsThisTurn: [],
    });
    expect(r.punt).toBe(true);
  });

  test('run this + command, no Bash call -> punt (EN)', () => {
    const r = pd.decide({
      lastAssistantText: 'Run this: `curl localhost:3737/api/ping` and paste the result.',
      toolCallsThisTurn: [],
    });
    expect(r.punt).toBe(true);
    expect(r.cmd).toMatch(/curl localhost/);
  });
});

describe('decide — creds carve-out (never a punt)', () => {
  test('git push delegated to the user is legitimate', () => {
    const r = pd.decide({
      lastAssistantText: 'Le serveur n\'a pas les creds — lance `git push origin main` depuis ta machine.',
      toolCallsThisTurn: [],
    });
    expect(r.punt).toBe(false);
    expect(r.reason).toMatch(/carve-out/);
  });

  test('npm publish delegated to the user is legitimate', () => {
    const r = pd.decide({
      lastAssistantText: 'Execute `npm publish` toi-meme, je ne peux pas publier depuis ici.',
      toolCallsThisTurn: [],
    });
    expect(r.punt).toBe(false);
    expect(r.reason).toMatch(/carve-out/);
  });
});

describe('decide — agent ran the command (not a punt)', () => {
  test('a Bash tool-call ran the command this turn -> not a punt', () => {
    const r = pd.decide({
      lastAssistantText: 'Lance `npm test` pour confirmer.',
      toolCallsThisTurn: [{ name: 'Bash', command: 'npm test --silent' }],
    });
    expect(r.punt).toBe(false);
    expect(r.reason).toMatch(/ran the command/);
  });

  test('a Bash call running a DIFFERENT command does not clear the punt', () => {
    const r = pd.decide({
      lastAssistantText: 'Lance `npm test` et colle la sortie.',
      toolCallsThisTurn: [{ name: 'Bash', command: 'git status' }],
    });
    expect(r.punt).toBe(true);
  });
});

describe('decide — no command / no imperative', () => {
  test('imperative but no runnable command -> not a punt', () => {
    const r = pd.decide({
      lastAssistantText: 'Lance-toi dans la lecture du PRD quand tu veux.',
      toolCallsThisTurn: [],
    });
    expect(r.punt).toBe(false);
    expect(r.cmd).toBeNull();
  });

  test('a command but no imperative-to-user -> not a punt', () => {
    const r = pd.decide({
      lastAssistantText: 'J\'ai execute `npm test` et tout passe au vert.',
      toolCallsThisTurn: [{ name: 'Bash', command: 'npm test' }],
    });
    expect(r.punt).toBe(false);
  });

  test('empty input -> not a punt', () => {
    const r = pd.decide({ lastAssistantText: '', toolCallsThisTurn: [] });
    expect(r.punt).toBe(false);
  });
});
