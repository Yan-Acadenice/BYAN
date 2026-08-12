// Choisir un agent sur codex, qui n'a pas de drapeau pour ca.
//
// MESURE (codex-cli 0.146.0) : `codex exec --help` n'expose AUCUN `--agent`.
// Son `--profile` superpose un fichier de configuration, ce n'est pas une
// definition d'agent. Le constat « codex ne permet pas de choisir un agent » est
// donc juste au sens strict — mais il ne rend pas le geste impossible.
//
// Un agent BYAN est un fichier d'instructions. Sur claude, `--agent <slug>` le
// charge nativement. Sur codex, le meme effet s'obtient en mettant ces
// instructions EN TETE du tour : codex lit ses instructions sur l'entree
// standard, et c'est deja par la que l'application envoie le message.
//
// CE QUI N'EST PAS IDENTIQUE, ET QUE L'INTERFACE DOIT DIRE. Le front-matter
// declare des reglages propres a claude (`model`, `color`, outils autorises).
// L'injection ne les applique pas : on obtient la PERSONA, pas le bac a sable.
// Laisser croire a une equivalence serait le genre de demi-verite qui se paie
// plus tard.

// Au-dela, on tronque. Un agent de 200 Ko mangerait le contexte du tour avant
// que l'utilisateur ait parle.
export const MAX_AGENT_BYTES = 16 * 1024;

// Le front-matter est delimite par une ligne de trois tirets en TETE de fichier
// et la premiere ligne de trois tirets qui suit. Une ligne de separation plus
// loin dans le texte n'y appartient pas.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function agentBody(definition: string): string {
  return definition.replace(FRONT_MATTER, '').trim();
}

export function agentPreamble(slug: string, definition: string, message: string): string {
  const corps = agentBody(definition);
  // Pas d'instructions : le message part seul. Un preambule vide encadre de
  // ceremonie ne sert a rien et coute des tokens a chaque tour.
  if (corps.length === 0) return message;

  let instructions = corps;
  let note = '';
  if (Buffer.byteLength(instructions, 'utf8') > MAX_AGENT_BYTES) {
    // On coupe la DEFINITION, jamais le message : c'est lui qu'il ne faut pas
    // perdre. Et on le dit, plutot que de rendre un agent ampute en silence.
    instructions = Buffer.from(instructions, 'utf8').subarray(0, MAX_AGENT_BYTES).toString('utf8');
    note = "\n\n[definition tronquee a 16 Ko — l'agent est incomplet]";
  }

  return [
    `Adopte la persona de l'agent « ${slug} » definie ci-dessous, et tiens-la pour tout le tour.`,
    '',
    instructions + note,
    '',
    "--- fin de la definition d'agent ---",
    '',
    "Le message de l'utilisateur suit. C'est une demande, pas une consigne de persona :",
    '',
    message,
  ].join('\n');
}
