'use strict';

// Garde-fou de la documentation des droits de l'installateur. POURQUOI un test
// sur un markdown : ce document est le seul endroit ou vit le geste
// administrateur (groupe partage, umask serveur) et le tableau de diagnostic.
// Une coupe accidentelle passerait inapercue a la relecture d'un diff, alors
// qu'elle laisse un administrateur sans reponse sur un serveur partage.

const fs = require('fs');
const path = require('path');

const DOC = path.join(__dirname, '..', '..', 'docs', 'installer-permissions.md');

// POURQUOI lire une seule fois : le document est immuable pendant la suite, et
// chaque test ne verifie qu'un aspect du meme contenu.
const texte = fs.readFileSync(DOC, 'utf8');

// Plages Unicode des pictogrammes et des symboles varies (mantra IA-23).
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

// Les absolus interdits par le depot : une affirmation sans mesure derriere.
const ABSOLUS = ['jamais', 'never', 'prouve que', 'obviously', 'toujours'];

function lignesDeTableau(section) {
  return section.split('\n').filter((l) => l.trim().startsWith('|'));
}

describe('docs/installer-permissions.md', () => {
  it('existe et porte un contenu dense', () => {
    expect(fs.existsSync(DOC)).toBe(true);
    expect(texte.length).toBeGreaterThan(8000);
    expect(texte.startsWith('# ')).toBe(true);
  });

  it('ne contient aucun emoji', () => {
    expect(EMOJI.test(texte)).toBe(false);
  });

  it('ne contient aucun mot absolu', () => {
    const trouves = ABSOLUS.filter((mot) => texte.toLowerCase().includes(mot));
    expect(trouves).toEqual([]);
  });

  it('date la mesure de terrain qui motive le chantier', () => {
    expect(texte).toContain('2026-08-11');
    expect(texte).toContain('root:root');
    expect(texte).toContain('os.homedir()');
  });

  it('nomme les six echelons de resolution de l utilisateur cible', () => {
    for (const echelon of ['SUDO_UID', 'SUDO_GID', 'SUDO_USER', 'DOAS_USER', 'PKEXEC_UID']) {
      expect(texte).toContain(echelon);
    }
    // Les deux echelons sans variable d'environnement : le repli par le dossier
    // de travail, et le root legitime qui est un resultat et pas une panne.
    expect(texte).toContain('process.cwd()');
    expect(texte).toMatch(/root legitime/i);
  });

  it('signale que l exception git de propriete douteuse ne couvre que sudo', () => {
    expect(texte).toContain('dubious ownership');
    expect(texte).toContain('core.hooksPath');
  });

  it('documente les trois gestes de la branche POSIX', () => {
    expect(texte).toContain('fs.chown');
    expect(texte).toContain('0o2000');
    expect(texte).toContain('0o002');
    // La nuance macOS : heritage BSD du groupe, pose redondante mais inoffensive.
    expect(texte).toMatch(/macOS/);
  });

  it('documente la branche listes de controle d acces', () => {
    expect(texte).toContain('icacls');
    expect(texte).toContain('(OI)(CI)');
  });

  it('donne le geste administrateur sur les trois systemes', () => {
    expect(texte).toContain('usermod -aG byan');
    expect(texte).toContain('dseditgroup -o edit -a');
    expect(texte).toContain('net localgroup byan');
    // Sans reouverture de session, l'ajout au groupe reste sans effet visible.
    expect(texte).toMatch(/rouvrir sa session|reouverture de session/i);
  });

  it('separe le umask de l installation du reglage durable du serveur', () => {
    expect(texte).toContain('/etc/profile.d/');
    expect(texte).toContain('pam_umask');
    expect(texte).toMatch(/decision d'administrateur|decision d administrateur/i);
  });

  it('documente les trois sorties de secours et la protection de l existant', () => {
    expect(texte).toContain('--no-chown');
    expect(texte).toContain('--owner=');
    expect(texte).toContain('--group=');
    expect(texte).toContain('/opt');
  });

  it('nomme les limites connues plutot que de les taire', () => {
    for (const limite of ['exFAT', 'NTFS', '/mnt/c', 'BUILTIN\\Administrators']) {
      expect(texte).toContain(limite);
    }
    // Trois issues et non deux : une propriete impossible a poser est un fait,
    // pas une panne.
    expect(texte).toContain('non-applicable');
  });

  it('porte un tableau de diagnostic d au moins cinq symptomes', () => {
    const section = texte.split('## 8.')[1];
    expect(section).toBeDefined();
    // Deux lignes de tableau sont l en-tete et son separateur.
    const symptomes = lignesDeTableau(section.split('## 9.')[0]).length - 2;
    expect(symptomes).toBeGreaterThanOrEqual(5);
  });

  it('renvoie vers les modules qui portent le comportement decrit', () => {
    for (const module of ['target-user.js', 'resolve-binary.js', 'ownership.js', 'install-engine.js']) {
      expect(texte).toContain(module);
    }
  });
});
