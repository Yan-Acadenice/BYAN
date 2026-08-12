// index.ts — point d'entree du module suitability (LOT L7).
//
// Porte _byan/mcp/byan-mcp-server/lib/suitability.js (design D1) en
// TypeScript pur : aucun disque, aucune horloge, aucun hasard. La
// persistance vit dans main/suitability-store.ts (choix d'un registre
// GLOBAL, pas par-projet — voir ce fichier pour la raison).

export * from './types';
export * from './beta-stats';
export * from './ledger';
