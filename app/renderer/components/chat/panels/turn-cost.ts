// Re-export : la regle de cout par tour vit desormais dans shared/turn-cost.ts,
// parce que le processus principal l'applique aussi pour ecrire l'historique sur
// disque. Ce fichier reste pour ne pas casser les points d'appel du renderer.

export type { TurnCost, TurnCostKind } from '../../../../shared/turn-cost';
export { turnCosts, turnCostFrom } from '../../../../shared/turn-cost';
