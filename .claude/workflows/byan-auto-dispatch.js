export const meta = {
  name: 'byan-auto-dispatch',
  description: 'Decoupe une tache en etapes typees, route chaque etape sur le bon modele (haiku/sonnet/opus/fable par complexite ; Codex pour shell/deploiement), ecrit _byan-output/plan.md, execute et verifie.',
  whenToUse: 'Rail automatique de /byan-byan : toute tache non-conversationnelle passe par ce workflow sans demande explicite. Le gate humain reste en fin, sur le livrable.',
  phases: [
    { title: 'Decoupage', detail: 'un agent d analyse decoupe la tache en etapes typees (nature + complexite 0-100)', model: 'sonnet' },
    { title: 'Routage', detail: 'pur code : echelle haiku<34 / sonnet<67 / opus<90 / fable>=90 ; moteur Codex pour shell/deploiement, verification toujours Claude' },
    { title: 'Plan', detail: 'ecrit _byan-output/plan.md (table etape x modele x moteur)', model: 'sonnet' },
    { title: 'Execution', detail: 'un agent par etape, sequentiel, sur le modele route' },
    { title: 'Verification', detail: 'controle du livrable sur le modele de session (jamais delegue)' },
  ],
};

// BYAN-TIER: reviewed — les modeles des etapes d'execution sont CALCULES par le
// routeur inline (echelle v3 par complexite), pas des choix statiques ; les deux
// leaves statiques (analyse -> sonnet, ecriture mecanique du plan -> sonnet)
// portent leur niveau en litteral, verifiable par le linter.
//
// Un script natif n'a NI import NI acces fichier : l'echelle de routage est donc
// posee ici en clair (la meme table que _byan/mcp/byan-mcp-server/lib/
// dispatch-router.js, qui reste la source de verite testee cote lib), et le
// plan.md est ecrit par un agent (qui, lui, a l'outil Write).
//
// args attendus : { task: string, stamp?: string ISO }
// (stamp vient du fil principal — un script natif n a pas le droit de lire
// l horloge lui-meme, ca casserait la reprise sur relance.)

// Accepte args en objet OU en chaine JSON (selon le chemin d'invocation), et, en
// dernier recours, une chaine nue traitee comme la tache elle-meme.
let entree = {};
if (args && typeof args === 'object') {
  entree = args;
} else if (typeof args === 'string' && args.trim()) {
  try {
    const p = JSON.parse(args);
    entree = (p && typeof p === 'object') ? p : { task: String(p) };
  } catch {
    entree = { task: args };
  }
}
const tache = String(entree.task || '').trim();
const stamp = String(entree.stamp || 'horodatage non fourni');
if (!tache) return { ok: false, erreur: 'args.task manquant : rien a dispatcher' };

// --- Phase 1 : DECOUPAGE (analyse -> sonnet, conforme a la doctrine des niveaux)
phase('Decoupage');
const PLAN_SCHEMA = {
  type: 'object',
  required: ['resume', 'etapes'],
  additionalProperties: false,
  properties: {
    resume: { type: 'string', description: 'La tache reformulee en une phrase.' },
    etapes: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        required: ['id', 'titre', 'nature', 'complexite', 'consigne'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'E1, E2, ...' },
          titre: { type: 'string' },
          nature: {
            enum: ['exploration', 'analyse', 'implementation', 'verification', 'shell', 'deploiement', 'navigation', 'doc'],
            description: 'exploration=lire/scanner ; analyse=juger/concevoir ; implementation=ecrire du code/contenu ; verification=controler ; shell/deploiement/navigation=execution systeme ; doc=documentation',
          },
          complexite: { type: 'number', minimum: 0, maximum: 100 },
          consigne: { type: 'string', description: 'L instruction complete et autonome pour executer cette etape.' },
        },
      },
    },
  },
};
const decoupe = await agent(
  'Tu decoupes une tache en etapes executables, chacune typee et notee en complexite.\n' +
  'Regles : chaque etape est autonome (sa consigne suffit pour l executer) ; ordonne-les ;\n' +
  'la complexite est 0-100 (0=trivial, 100=extreme) ; ne cree pas d etape superflue (rasoir d Ockham) ;\n' +
  'inclus une etape de verification finale seulement si la tache produit du code ou un livrable testable.\n' +
  'Aucun absolu non source dans les consignes (pas de "jamais/toujours" nus).\n\n' +
  'Tache a decouper :\n' + tache,
  { label: 'analyse-decoupage', phase: 'Decoupage', model: 'sonnet', schema: PLAN_SCHEMA }
);
// Le schema est une consigne forte, pas un contrat absolu : un retour nul ou
// difforme (agent saute, erreur terminale) doit finir en verdict propre, pas en
// TypeError qui avorte le workflow.
if (!decoupe || !Array.isArray(decoupe.etapes) || decoupe.etapes.length === 0) {
  return { ok: false, erreur: 'decoupage vide ou difforme : aucune etape exploitable', tache };
}
log(`Decoupage : ${decoupe.etapes.length} etape(s) — ${decoupe.resume}`);

// --- Phase 2 : ROUTAGE (pur code, zero agent)
phase('Routage');
const NATURES_CODEX = ['shell', 'deploiement', 'navigation'];
function moteurPour(nature) {
  if (nature === 'verification') return 'claude'; // ligne rouge : jamais delegue
  return NATURES_CODEX.includes(nature) ? 'codex' : 'claude';
}
// Echelle v3 par complexite (miroir de dispatch-router.claudeModelForComplexity).
function modeleClaudePour(cx) {
  if (cx < 34) return 'haiku';
  if (cx < 67) return 'sonnet';
  if (cx < 90) return 'opus';
  return 'fable'; // extreme : dernier recours (~2x le prix d Opus)
}
const table = decoupe.etapes.map((e) => {
  const moteur = moteurPour(e.nature);
  // Une etape de verification herite du modele de session (opts.model omis) ;
  // toute autre etape porte le modele de l echelle. Une etape routee Codex est
  // pilotee par un agent Claude (au modele de l echelle) qui tente `codex exec`
  // et replie sur Claude si Codex n est pas disponible.
  const modele = e.nature === 'verification' ? null : modeleClaudePour(e.complexite);
  return { ...e, moteur, modele };
});
for (const l of table) {
  log(`Routage ${l.id} "${l.titre}" : nature=${l.nature} complexite=${l.complexite} -> moteur=${l.moteur} modele=${l.modele || 'session'}`);
}

// --- Phase 3 : PLAN (contenu construit en pur code, ecrit par un agent mecanique)
phase('Plan');
const lignesTable = table.map((l) =>
  `| ${l.id} | ${l.titre} | ${l.nature} | ${l.complexite} | ${l.moteur} | ${l.modele || 'modele de session'} |`
);
const planMd = [
  '# Plan de dispatch — ' + decoupe.resume,
  '',
  `- Tache d origine : ${tache.replace(/\n/g, ' ').slice(0, 300)}`,
  `- Genere par : workflow natif byan-auto-dispatch (${stamp})`,
  '- Echelle de routage : haiku < 34, sonnet < 67, opus < 90, fable >= 90 (par complexite) ;',
  '  moteur Codex pour shell/deploiement/navigation (repli Claude si indisponible) ;',
  '  la verification reste sur le modele de session, non deleguee.',
  '',
  '| Etape | Titre | Nature | Complexite | Moteur | Modele |',
  '|-------|-------|--------|------------|--------|--------|',
  ...lignesTable,
  '',
  '## Consignes par etape',
  '',
  ...table.map((l) => `### ${l.id} — ${l.titre}\n\n${l.consigne}\n`),
].join('\n');
await agent(
  'Ecris EXACTEMENT le contenu ci-dessous dans le fichier _byan-output/plan.md ' +
  '(cree le dossier _byan-output s il n existe pas ; remplace le fichier s il existe). ' +
  'N ajoute rien, ne corrige rien, ne commente rien. Reponds "ecrit" quand c est fait.\n\n' +
  '--- CONTENU A ECRIRE TEL QUEL ---\n' + planMd,
  { label: 'mech-ecrire-plan', phase: 'Plan', model: 'sonnet' }
);
log('Plan ecrit : _byan-output/plan.md');

// --- Phase 4 : EXECUTION (sequentielle : les etapes d une meme tache partagent
// souvent des fichiers ; le contexte des etapes precedentes est transmis borne)
phase('Execution');
const resultats = [];
for (const l of table) {
  const contexte = resultats.length
    ? '\n\nResultats des etapes precedentes (contexte) :\n' +
      resultats.map((r) => `- ${r.id} (${r.titre}) : ${String(r.resultat).slice(0, 1200)}`).join('\n')
    : '';
  const consigneCodex =
    l.moteur === 'codex'
      ? '\n\nCette etape est routee vers CODEX : lance `codex exec` en lecture seule pour obtenir un diff unifie, ' +
        'puis applique le diff toi-meme (`git apply`). Si la commande `codex` n est pas disponible ou echoue, ' +
        'dis-le en une phrase et fais l etape toi-meme sur Claude (repli prevu).'
      : '';
  // Un echec dur d une etape (agent saute, erreur terminale) ne doit pas avorter
  // le workflow : il est enregistre comme resultat KO et la verification finale
  // le jugera — jamais de coupe silencieuse, jamais d abandon muet.
  let res;
  try {
    res = await agent(
      `Etape ${l.id} — ${l.titre} (nature ${l.nature}, complexite ${l.complexite}).\n` +
      'Execute la consigne ci-dessous, completement. Rapporte ce qui a ete fait, les fichiers touches, ' +
      'et toute impossibilite REELLE rencontree (dis le fait exact, pas une image).\n\n' +
      'Consigne :\n' + l.consigne + consigneCodex + contexte,
      {
        label: `etape-${l.id}`,
        phase: 'Execution',
        ...(l.modele ? { model: l.modele } : {}),
      }
    );
  } catch (e) {
    res = null;
  }
  if (res == null) res = `ECHEC : l etape ${l.id} n a pas rendu de resultat (agent interrompu ou en erreur).`;
  resultats.push({ id: l.id, titre: l.titre, moteur: l.moteur, modele: l.modele || 'session', resultat: res });
  log(`Execution ${l.id} terminee (modele=${l.modele || 'session'})`);
}

// --- Phase 5 : VERIFICATION (modele de session, jamais delegue)
phase('Verification');
const verdict = await agent(
  'Tu es le controleur (tu n as PAS fait le travail). Verifie le resultat de chaque etape ' +
  'contre la tache d origine : livre reellement ? teste quand testable ? rien coupe en silence ?\n' +
  'Rends : VERDICT: OK ou VERDICT: KO en premiere ligne, puis une ligne par etape (id, tenu/manque, le fait exact).\n\n' +
  `Tache d origine :\n${tache}\n\n` +
  'Resultats :\n' +
  resultats.map((r) => `--- ${r.id} ${r.titre} ---\n${String(r.resultat).slice(0, 2000)}`).join('\n\n'),
  { label: 'verifie-livrable', phase: 'Verification' }
);

const ok = /^\s*VERDICT:\s*OK/i.test(String(verdict));
log(`Verification : ${ok ? 'OK' : 'KO'}`);
return {
  ok,
  tache: decoupe.resume,
  plan: '_byan-output/plan.md',
  table: table.map(({ consigne, ...reste }) => reste),
  resultats: resultats.map((r) => ({ ...r, resultat: String(r.resultat).slice(0, 2000) })),
  verdict: String(verdict),
};
