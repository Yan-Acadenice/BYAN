// Les transitions d'un enregistrement de session — la couche PURE.
//
// D'OU VIENT CE FICHIER. Le module teste ici (`shared/session-history.ts`) et
// son magasin disque ont ete ecrits le 2026-08-07 par l'agent du chat de l'app
// elle-meme, pendant un essai en conditions reelles : on lui a demande une page
// Historique, il a produit la couche de donnees. Le code est solide — separation
// pur / entrees-sorties respectee, ecritures defensives — mais il est arrive
// sans un seul test, et sa premiere version portait une collision de nom qui
// cassait la compilation (un champ `history` masquant la methode `history()`).
//
// Du code sans test dans l'arbre est une dette qu'on ne voit pas. Ces tests la
// paient : ils couvrent les transitions et le contrat de forme, pas l'ecran, qui
// reste a faire.

import { describe, expect, it } from 'vitest';
import {
  SESSION_HISTORY_SCHEMA_VERSION,
  MESSAGE_CONTENT_CAP,
  MESSAGE_TRUNCATION_MARK,
  createRecord,
  appendMessage,
  completeTurn,
  failTurn,
  closeRecord,
  sessionCost,
  toSummary,
  isSessionHistoryRecord,
} from '../session-history';

const T0 = '2026-08-07T10:00:00.000Z';
const T1 = '2026-08-07T10:00:05.000Z';
const T2 = '2026-08-07T10:01:00.000Z';

function base() {
  return createRecord({ id: 'sess-1', engine: 'claude', cwd: '/projet', at: T0 });
}

describe('createRecord — le point de depart', () => {
  it('porte la version de schema, pour qu une relecture future sache a quoi elle a affaire', () => {
    expect(base().schemaVersion).toBe(SESSION_HISTORY_SCHEMA_VERSION);
  });

  it('retient ce avec quoi la session a demarre', () => {
    const r = base();
    expect(r.id).toBe('sess-1');
    expect(r.engine).toBe('claude');
    expect(r.startedAt).toBe(T0);
  });

  it('demarre vide plutot qu avec des valeurs inventees', () => {
    const r = base();
    expect(r.messages).toEqual([]);
    expect(r.turns).toEqual([]);
    expect(r.endedAt).toBeNull();
  });
});

describe('appendMessage — ce que la session a dit', () => {
  it('ajoute sans muter l enregistrement recu', () => {
    // La purete n'est pas decorative : le pont garde une reference sur l'ancien
    // enregistrement, et une mutation en place la corromprait en silence.
    const r0 = base();
    const r1 = appendMessage(r0, 'user', 'salut', T1);
    expect(r0.messages).toHaveLength(0);
    expect(r1.messages).toHaveLength(1);
    expect(r1).not.toBe(r0);
  });

  it('coupe un message demesure et le DIT', () => {
    // Un enregistrement de session n'est pas une archive : laisser passer un
    // megaoctet de sortie ferait grossir le dossier sans rien apporter. Mais une
    // troncature muette ferait croire a un message complet.
    const enorme = 'x'.repeat(MESSAGE_CONTENT_CAP + 5_000);
    const r = appendMessage(base(), 'assistant', enorme, T1);
    const garde = r.messages[0]?.content ?? '';
    expect(garde.length).toBeLessThanOrEqual(MESSAGE_CONTENT_CAP + MESSAGE_TRUNCATION_MARK.length);
    expect(garde).toContain(MESSAGE_TRUNCATION_MARK);
  });

  it('laisse intact un message sous la limite', () => {
    const r = appendMessage(base(), 'user', 'court', T1);
    expect(r.messages[0]?.content).toBe('court');
    expect(r.messages[0]?.content).not.toContain(MESSAGE_TRUNCATION_MARK);
  });
});

describe('completeTurn et failTurn — un tour finit toujours quelque part', () => {
  it('enregistre un tour abouti', () => {
    const r = completeTurn(base(), { startedAt: T1, endedAt: T2, steps: 3 });
    expect(r.turns).toHaveLength(1);
    expect(r.turns[0]?.ok).toBe(true);
  });

  it('enregistre un tour echoue comme un tour, pas comme un trou', () => {
    // Un echec efface serait pire qu'un echec affiche : la frise et le compte
    // des tours mentiraient tous les deux.
    const r = failTurn(base(), { startedAt: T1, endedAt: T2, steps: 1, error: 'processus arrete' });
    expect(r.turns).toHaveLength(1);
    expect(r.turns[0]?.ok).toBe(false);
  });

  it('ne mute pas l enregistrement recu', () => {
    const r0 = base();
    completeTurn(r0, { startedAt: T1, endedAt: T2, steps: 1 });
    expect(r0.turns).toHaveLength(0);
  });
});

describe('closeRecord — la session est finie', () => {
  it('pose la date de fin', () => {
    expect(closeRecord(base(), T2).endedAt).toBe(T2);
  });

  it('garde ce qui a ete accumule', () => {
    const avec = appendMessage(base(), 'user', 'salut', T1);
    expect(closeRecord(avec, T2).messages).toHaveLength(1);
  });
});

describe('sessionCost — le silence a une cause nommee', () => {
  it('rend un cout absent quand le moteur n a rien rapporte', () => {
    // codex tourne sur abonnement et ne publie aucun montant. Afficher zero
    // laisserait croire a une session gratuite ; le silence doit rester du
    // silence.
    const c = sessionCost(null);
    expect(c.usd).toBeNull();
  });
});

describe('toSummary — ce que la liste affichera', () => {
  it('resume sans perdre les faits qui identifient la session', () => {
    let r = base();
    r = appendMessage(r, 'user', 'salut', T1);
    r = completeTurn(r, { startedAt: T1, endedAt: T2, steps: 2 });
    const s = toSummary(closeRecord(r, T2));
    expect(s.id).toBe('sess-1');
    expect(s.engine).toBe('claude');
    expect(s.startedAt).toBe(T0);
  });

  it('ne porte pas les messages : un resume qui contient tout n en est pas un', () => {
    const r = appendMessage(base(), 'user', 'salut', T1);
    expect((toSummary(r) as unknown as { messages?: unknown }).messages).toBeUndefined();
  });
});

describe('isSessionHistoryRecord — la garde de relecture', () => {
  it('accepte un enregistrement produit par ce module', () => {
    expect(isSessionHistoryRecord(base())).toBe(true);
  });

  it('refuse ce qui n en est pas', () => {
    // Le magasin relit des fichiers du disque, que rien ne garantit intacts :
    // un JSON tronque ou d'une autre version doit etre ecarte, pas charge.
    for (const bidon of [null, undefined, 42, 'texte', {}, { sessionId: 'x' }, []]) {
      expect(isSessionHistoryRecord(bidon), JSON.stringify(bidon)).toBe(false);
    }
  });
});
