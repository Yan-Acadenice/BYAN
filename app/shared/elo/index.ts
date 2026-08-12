// index.ts — point d'entree du module ELO Trust System (LOT L7).
//
// Porte src/byan-v2/elo/*.js en TypeScript pur : aucun disque, aucune horloge
// implicite, aucun gabarit de message. La persistance (elo-store.js) et la
// mise en forme pedagogique (pedagogy-layer.js) de la source amont ne sont pas
// portees — voir engine.ts pour la raison exacte. Le routage LLM par rating
// (llm-router.js) n'est pas porte non plus : ce lot est interdit de toucher
// app/shared/dispatch/**, qui possede deja le cerveau de choix de modele de
// cette app ; dupliquer une seconde source de recommandation de modele depuis
// l'ELO aurait cree exactement la derive que ce depot documente ailleurs
// (deux verites qui peuvent diverger sans qu'aucun test ne le remarque).

export * from './types';
export * from './domain-config';
export * from './glicko2';
export * from './challenge-evaluator';
export * from './engine';
