// command-copy — the two sentences BOTH chat surfaces owe a slash command.
//
// WHY shared, and why here rather than in lib/slash-commands.ts: the parser is
// engine-agnostic logic and stays free of user-facing copy, but these two answers
// belong to the same rule on both surfaces ("aucune commande muette"), and they
// had drifted into two spellings of the same thing — one accented, one not, one
// saying "un panneau" and the other "un écran". One wording, one place.
//
// Kept pure so the wording is testable without mounting a chat.

// A slash input that matches nothing in the catalogue. NEVER forwarded to the
// model: a typo must be corrected, not answered.
export function unknownCommandMessage(cmd: string): string {
  return `Commande inconnue : ${cmd}. Tape / pour voir les commandes disponibles.`;
}

// Text typed AFTER a command that carries no message. Saying so beats eating it:
// the words were the user's, and watching them vanish with no error and no trace
// is the bug this sentence exists to close.
export function trailingIgnoredMessage(cmd: string, arg: string): string {
  return `"${arg.trim()}" n'a pas été envoyé : ${cmd} ne transporte pas de message.`;
}
