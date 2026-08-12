// Les quatre vues du chantier, plus leurs briques.
//
// Un seul chemin d'import pour l'appelant : `components/chat/workflow`. Les
// quatre vues sont de la presentation pure — elles recoivent tout par
// proprietes et ne vont jamais rien chercher.

export { default as ContaminationPanel } from './ContaminationPanel';
export { contaminationPhrase, stepsBuiltOn } from './ContaminationPanel';
export type { ContaminationPanelProps } from './ContaminationPanel';

export { default as RewindPanel } from './RewindPanel';
export { CHEAPEST_IS_NOT_MOST_USEFUL, cheapestPointId } from './RewindPanel';
export type { RewindPanelProps } from './RewindPanel';

export { default as RaisedHandPanel } from './RaisedHandPanel';
export { GATE_FORGETS_NOTE, GATE_REMEMBERS_NOTE, WAITING_COSTS_NOTHING } from './RaisedHandPanel';
export type { RaisedHandPanelProps } from './RaisedHandPanel';

export { default as WorkTimeline } from './WorkTimeline';
export {
  lonelyLostSentence,
  lonelyLostSlices,
  peakWorking,
  totalSpanMs,
} from './WorkTimeline';
export type { WorkTimelineProps } from './WorkTimeline';

// Les ponts entre ce que les moteurs mesurent et ce que les ecrans dessinent.
export { slicesFromActivity, SLICE_TARGET } from './fromActivity';
export { contaminationSteps, raisedHandState, rewindPoints } from './fromLocal';
export type { EtatLocal, MainLevee } from './fromLocal';

export { default as PersonFace } from './PersonFace';
export type { PersonFaceProps } from './PersonFace';

export {
  CostReadout,
  FOCUS_RING,
  Note,
  PersonLine,
  SectionHeading,
  SeniorityScale,
  StateTag,
  TAP_TARGET,
  UNKNOWN_PERSON_LABEL,
  stateVisual,
} from './parts';

export type {
  PermissionGate,
  PermissionGrant,
  RaisedHand,
  RewindPoint,
  TimelineSlice,
  WorkStep,
} from './types';
