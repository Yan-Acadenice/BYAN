// command-copy — the two answers a slash command owes the user, on BOTH surfaces.
//
// Pinned as literals: this module exists because the same sentence had been
// written twice, differently. A test that re-derived the string from the module's
// own template would not have caught that either.

import { describe, it, expect } from 'vitest';
import { trailingIgnoredMessage, unknownCommandMessage } from '../command-copy';

describe('unknownCommandMessage', () => {
  it('names the command and points at the way to find the real ones', () => {
    expect(unknownCommandMessage('/mdl'))
      .toBe('Commande inconnue : /mdl. Tape / pour voir les commandes disponibles.');
  });

  it('is one sentence, so the cloud and local surfaces cannot drift again', () => {
    // Pinned by renderer/pages/__tests__/Chat.slash.test.tsx as well ('/foo').
    expect(unknownCommandMessage('/foo')).toContain('Commande inconnue : /foo');
  });
});

describe('trailingIgnoredMessage', () => {
  it('quotes the words that were NOT sent and says why', () => {
    expect(trailingIgnoredMessage('/usage', 'salut'))
      .toBe('"salut" n\'a pas été envoyé : /usage ne transporte pas de message.');
  });

  it('trims the argument so the quotes hug the words', () => {
    expect(trailingIgnoredMessage('/new', '  bonjour  '))
      .toBe('"bonjour" n\'a pas été envoyé : /new ne transporte pas de message.');
  });

  it('carries its accents — the local surface used to spell it without them', () => {
    const text = trailingIgnoredMessage('/mcp', 'x');
    expect(text).toContain('été');
    expect(text).toContain('envoyé');
  });
});
