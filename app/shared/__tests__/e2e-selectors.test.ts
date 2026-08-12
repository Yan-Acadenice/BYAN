// Un essai de bout en bout ne cible JAMAIS une classe de style.
//
// CE QUI S'EST PASSE (2026-08-05). L'essai qui devait prouver « une reponse
// arrive » cherchait `.rounded-xl` alors que le balisage porte `rounded-2xl`. Il
// comptait donc zero bulle et ne pouvait pas reussir. Il etait la depuis des
// semaines, vert, et creux — parce qu'il n'avait jamais tourne, et le jour ou il
// a tourne il a echoue sur son propre selecteur, pas sur l'application.
//
// POURQUOI C'EST UN PIEGE STRUCTUREL, pas une etourderie. Une classe utilitaire
// est de l'APPARENCE : elle change au premier coup de peinture, sans que personne
// pense a l'essai qui s'y accrochait. Un `data-testid` est une INTENTION : on ne
// le renomme pas par accident en ajustant un arrondi.
//
// CE FICHIER EST LA REGLE, pas un commentaire qui l'enonce.
//
// La difference compte. J'avais d'abord ecrit dans deux commentaires « on cible
// l'intention, pas l'apparence » en appelant ca une regle. Un commentaire
// n'impose rien : il informe qui le lit. Celui-ci ECHOUE quand on le viole, et
// c'est la seule forme qu'une regle peut prendre dans un depot.
//
// LIMITE ASSUMEE : ce garde-fou couvre l'apparence. L'autre lecon du jour — « on
// mesure la ou ca decide » (l'API et pas l'aide du CLI, une machine au repos et
// pas saturee) — n'est PAS mecanisable : aucun test ne sait dire si on a interroge
// la bonne autorite. C'est une habitude, et pretendre qu'elle est « dans le code »
// serait exactement le maquillage que ce fichier corrige.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// Le dossier des essais, atteint depuis shared/__tests__/. Ce fichier vit ICI et
// pas a cote des essais parce que la configuration de vitest ne collecte que
// main/, preload/, shared/ et renderer/ : place dans __tests__/ a la racine, il
// n'aurait JAMAIS tourne. Constate en le lancant, le 2026-08-05 — un garde-fou
// non collecte est exactement le defaut vert et creux qu'il denonce.
const E2E_DIR = path.join(__dirname, '..', '..', '__tests__', 'e2e');

// Les prefixes des classes utilitaires du projet. Un selecteur qui commence par
// un point suivi de l'un d'eux vise une apparence.
const STYLE_PREFIXES = [
  'rounded', 'bg-', 'text-', 'flex', 'grid', 'px-', 'py-', 'mt-', 'mb-', 'gap-',
  'border', 'font-', 'w-', 'h-', 'max-w', 'min-h', 'absolute', 'relative', 'inline',
  'hover:', 'focus', 'opacity', 'shadow', 'space-',
];

function specFiles(): string[] {
  try {
    return fs.readdirSync(E2E_DIR)
      .filter((name) => name.endsWith('.spec.ts'))
      .map((name) => path.join(E2E_DIR, name));
  } catch {
    return [];
  }
}

// Les selecteurs CSS passes a `locator(...)`, avec leur ligne.
export function styleSelectors(source: string): { line: number; selector: string }[] {
  const found: { line: number; selector: string }[] = [];
  source.split('\n').forEach((text, index) => {
    // `locator('...')` — la seule porte par laquelle un selecteur CSS entre.
    //
    // La chaine se lit jusqu'a son guillemet FERMANT du meme type, pas jusqu'au
    // premier guillemet rencontre : un selecteur contient souvent un guillemet
    // double a l'interieur (`'[data-testid="x"] .rounded-xl'`), et s'arreter
    // dessus coupait la chaine avant la classe fautive. Premiere version de ce
    // garde-fou : il ne detectait RIEN, y compris l'exemple qu'on lui donne
    // exprès — c'est son propre autotest qui l'a attrape, le 2026-08-05.
    for (const match of text.matchAll(/locator\(\s*(['"`])((?:(?!\1)[\s\S])*)\1/g)) {
      const selector = match[2] ?? '';
      // Un `[data-testid=...]` est une intention, meme dans un locator.
      const classes = selector.match(/\.[A-Za-z][\w:/[\]-]*/g) ?? [];
      for (const cls of classes) {
        const bare = cls.slice(1);
        if (STYLE_PREFIXES.some((prefix) => bare.startsWith(prefix))) {
          found.push({ line: index + 1, selector });
        }
      }
    }
  });
  return found;
}

describe('les essais de bout en bout ciblent une intention, pas une apparence', () => {
  it('trouve bien les fichiers a verifier', () => {
    // Sans ce cas, un dossier renomme rendrait le garde-fou muet — vert et creux,
    // exactement le defaut qu'il est cense empecher.
    expect(specFiles().length).toBeGreaterThan(0);
  });

  it('aucun essai ne cible une classe de style', () => {
    const fautes: string[] = [];
    for (const file of specFiles()) {
      for (const hit of styleSelectors(fs.readFileSync(file, 'utf8'))) {
        fautes.push(`${path.basename(file)}:${hit.line} -> ${hit.selector}`);
      }
    }
    // Le message porte le fichier, la ligne et le selecteur : de quoi corriger
    // sans relire tout le dossier.
    expect(fautes, `Cible un data-testid plutot qu'une classe :\n${fautes.join('\n')}`).toEqual([]);
  });

  it('le detecteur reconnait une classe de style', () => {
    // Un garde-fou qui ne detecte rien passerait toujours. On le prouve sur
    // l'exemple exact qui a echoue.
    const faute = styleSelectors(`const b = page.locator('[data-testid="x"] .rounded-xl');`);
    expect(faute).toHaveLength(1);
    expect(faute[0].line).toBe(1);
  });

  it('laisse passer un selecteur d intention', () => {
    expect(styleSelectors(`page.locator('[data-testid="local-message"]')`)).toEqual([]);
    expect(styleSelectors(`page.getByTestId('local-message')`)).toEqual([]);
    // Un selecteur de rôle est une intention aussi.
    expect(styleSelectors(`page.locator('[role="alert"]')`)).toEqual([]);
  });
});
