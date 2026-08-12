// index.ts — point d'entree du module fact-check (LOT L7).
//
// Porte src/byan-v2/fact-check/*.js en TypeScript pur : aucun disque, aucune
// horloge implicite. La persistance (knowledge graph, fact sheet) de la
// source amont n'est pas portee — voir fact-check.ts pour la raison exacte.

export * from './types';
export * from './level-scorer';
export * from './claim-parser';
export * from './fact-check';
