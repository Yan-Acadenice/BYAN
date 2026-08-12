// F1 — le disque du matcher d'agent : la lecture du manifeste et du modele
// declare doit rester defensive sur un projet incomplet, et fermer la
// traversee de dossier sur un slug hostile — le meme contrat que
// claude-agents.ts, dont declaredModelForSlug herite la garde.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { declaredModelForSlug, declaredModelFromFrontMatter, loadRoster } from '../roster';

let projectRoot: string;
let fakeHome: string;
const realHome = process.env.HOME;

function writeManifest(root: string, csv: string): void {
  const dir = path.join(root, '_byan', '_config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent-manifest.csv'), csv, 'utf8');
}

function writeClaudeAgent(root: string, slug: string, body: string): void {
  const dir = path.join(root, '.claude', 'agents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}.md`), body, 'utf8');
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-roster-'));
  // declaredModelForSlug retombe sur ~/.claude/agents si le projet ne
  // declare rien : pointer HOME sur un dossier vide isole ces tests d'une
  // vraie installation BYAN sur la machine qui les fait tourner.
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-roster-home-'));
  process.env.HOME = fakeHome;
});

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  for (const d of [projectRoot, fakeHome]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('loadRoster', () => {
  it('lit le manifeste du projet choisi', () => {
    writeManifest(
      projectRoot,
      'name,displayName,title,role\n"dev","Amelia","Developer Agent","Senior Software Engineer"\n',
    );
    expect(loadRoster(projectRoot)).toEqual([
      { name: 'dev', displayName: 'Amelia', title: 'Developer Agent', role: 'Senior Software Engineer' },
    ]);
  });

  it('rend [] sans lever d exception quand _byan/ est absent', () => {
    expect(() => loadRoster(projectRoot)).not.toThrow();
    expect(loadRoster(projectRoot)).toEqual([]);
  });

  it('rend [] sur une racine de projet absente', () => {
    expect(loadRoster(null)).toEqual([]);
    expect(loadRoster(undefined)).toEqual([]);
    expect(loadRoster('')).toEqual([]);
  });

  it('lit le manifeste reel du depot sans lever d exception', () => {
    const repoRoot = path.join(__dirname, '..', '..', '..');
    expect(() => loadRoster(repoRoot)).not.toThrow();
    expect(loadRoster(repoRoot).length).toBeGreaterThan(10);
  });
});

describe('declaredModelFromFrontMatter', () => {
  it('extrait le modele declare (forme reelle des fichiers .claude/agents/)', () => {
    const def = '---\nname: bmad-bmm-dev\ndescription: dev agent\nmodel: sonnet\ncolor: blue\n---\n\n# corps\n';
    expect(declaredModelFromFrontMatter(def)).toBe('sonnet');
  });

  it('rend null quand il n y a pas de front-matter du tout', () => {
    expect(declaredModelFromFrontMatter('# pas de front-matter\n')).toBeNull();
  });

  it('rend null quand le front-matter ne declare pas de modele', () => {
    const def = '---\nname: x\ndescription: y\n---\n';
    expect(declaredModelFromFrontMatter(def)).toBeNull();
  });

  it('retire les guillemets autour de la valeur si il y en a', () => {
    const def = '---\nmodel: "opus"\n---\n';
    expect(declaredModelFromFrontMatter(def)).toBe('opus');
  });
});

describe('declaredModelForSlug', () => {
  it('lit le modele declare par un slug resolu', () => {
    writeClaudeAgent(projectRoot, 'bmad-bmm-dev', '---\nname: bmad-bmm-dev\nmodel: sonnet\n---\n\ncorps\n');
    expect(declaredModelForSlug('bmad-bmm-dev', projectRoot)).toBe('sonnet');
  });

  it('rend null pour un agent introuvable', () => {
    expect(declaredModelForSlug('inconnu', projectRoot)).toBeNull();
  });

  it('refuse un slug contenant .. ou un separateur, sans lever d exception', () => {
    expect(() => declaredModelForSlug('../../etc/passwd', projectRoot)).not.toThrow();
    expect(declaredModelForSlug('../../etc/passwd', projectRoot)).toBeNull();
    expect(declaredModelForSlug('sous/dossier', projectRoot)).toBeNull();
  });
});
