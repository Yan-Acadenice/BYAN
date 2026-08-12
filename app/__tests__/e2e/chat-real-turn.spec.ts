// The one test that reproduces what the user actually does: drive the PACKAGED
// app through its real interface, type a slash command with a message after it,
// and require an answer from the real claude binary.
//
// WHY THIS EXISTS. Every other proof in this repo is a unit test on a fake
// process or a live test on the bridge with no interface. Three bugs in a row
// shipped past all of them because each lived in the wiring BETWEEN the
// interface and the bridge:
//   - /byan sent an agent slug the CLI silently ignores
//   - a message typed while a session was opening was erased by that session
//   - "/byan salut mon reuf" applied the agent and DISCARDED the words
// A test that clicks the real window is the only one that would have caught all
// three. This is that test.
//
// SKIPPED by default: it needs the packaged binary, the real `claude`, a
// logged-in CLI and the network, and one turn costs tens of seconds. Run it
// deliberately:
//   BYAN_E2E_CHAT=1 npx playwright test __tests__/e2e/chat-real-turn.spec.ts

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

const RUN = process.env.BYAN_E2E_CHAT === '1';

test.describe('chat: a real turn through the real interface', () => {
  test.skip(!RUN, 'set BYAN_E2E_CHAT=1 to run (needs the real claude + network)');

  // A first turn on an agent is slow: measured at 20s+ of tool calls before the
  // first word, plus app cold start.
  test.setTimeout(300_000);

  test('"/byan <message>" applies the agent, keeps the message, and gets a reply', async () => {
    const launched = await launchApp({
      preconfigureProject: true,
      env: { BYAN_E2E_MOCK_SERVER_PORT: '37345', BYAN_E2E_MOCK_AUTH: '200' },
    });
    const { page, cleanup } = launched;

    try {
      // --- log in local (no cloud, no token)
      await page.getByTestId('tab-local').click();
      await page.getByTestId('local-spawn-btn').click();
      await expect(page.getByTestId('local-server-status')).toContainText('37345', { timeout: 15_000 });
      await page.getByTestId('local-submit').click();

      // --- reach the chat
      await page.getByTestId('nav-chat').click();
      const input = page.getByTestId('local-chat-input');
      await expect(input).toBeVisible({ timeout: 15_000 });

      // --- the exact thing the user typed
      await input.fill('/byan dis juste le mot PONG');
      await input.press('Enter');

      // 1. the agent is applied, and it is the slug the project declares
      await expect(page.getByTestId('local-agent-chip')).toContainText('byan', { timeout: 20_000 });

      // 2. the message is NOT eaten: the user's own words stay on screen
      await expect(page.getByText('dis juste le mot PONG')).toBeVisible({ timeout: 20_000 });

      // 3. the turn is visibly alive rather than a mute spinner
      await expect(page.getByTestId('local-activity')).toBeVisible({ timeout: 30_000 });

      // 4. an actual reply arrives. Asserting a second bubble exists is what
      //    proves the turn completed: the activity line disappears with it.
      await expect(page.getByTestId('local-activity')).toBeHidden({ timeout: 240_000 });
      // Cible un marqueur d'intention, pas une classe de style : la version
      // precedente cherchait `.rounded-xl` quand le balisage porte `rounded-2xl`,
      // donc elle comptait zero et ne prouvait rien.
      const bubbles = page.getByTestId('local-message');
      await expect
        .poll(async () => bubbles.count(), { timeout: 30_000 })
        .toBeGreaterThanOrEqual(2);

      // 5. and no error banner anywhere in the run
      await expect(page.getByRole('alert')).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  // La frise, a travers la vraie interface et le vrai pont.
  //
  // Les tests unitaires prouvent la conversion et le montage a partir de trames
  // fabriquees. Ils ne prouvent pas qu'un VRAI moteur emet les instants dont la
  // frise a besoin. Seul ce cas traverse la chaine entiere : moteur -> pont ->
  // contexte -> frise.
  //
  // Le message force un appel d'outil. Un tour sans outil ne produit aucune
  // etape, donc aucune frise — et l'affirmer serait faux, pas exigeant.
  test('un tour qui utilise un outil produit une frise lisible', async () => {
    const launched = await launchApp({
      preconfigureProject: true,
      env: { BYAN_E2E_MOCK_SERVER_PORT: '37346', BYAN_E2E_MOCK_AUTH: '200' },
    });
    const { page, cleanup } = launched;

    try {
      await page.getByTestId('tab-local').click();
      await page.getByTestId('local-spawn-btn').click();
      await expect(page.getByTestId('local-server-status')).toContainText('37346', { timeout: 15_000 });
      await page.getByTestId('local-submit').click();

      await page.getByTestId('nav-chat').click();
      const input = page.getByTestId('local-chat-input');
      await expect(input).toBeVisible({ timeout: 15_000 });

      // Avant tout tour : aucune frise. Une frise vide affirmerait un chantier
      // qui n'a pas eu lieu.
      await expect(page.getByTestId('local-work-timeline')).toHaveCount(0);

      await input.fill('lis le fichier package.json a la racine et donne-moi juste le champ version');
      await input.press('Enter');

      // Le tour se termine.
      await expect(page.getByTestId('local-activity')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('local-activity')).toBeHidden({ timeout: 240_000 });

      // La frise a survecu a la fin du tour : c'est la qu'elle sert.
      await expect(page.getByTestId('local-work-timeline')).toBeVisible({ timeout: 15_000 });

      // Fermee par defaut — troisieme profondeur de lecture, elle ne s'impose pas.
      const bouton = page.getByRole('button', { name: /le détail minute par minute/i });
      await expect(bouton).toHaveAttribute('aria-expanded', 'false');

      // Ouverte, elle montre un dessin, pas un panneau vide.
      await bouton.click();
      await expect(page.getByTestId('timeline-figure')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('timeline-empty')).toHaveCount(0);

      await expect(page.getByRole('alert')).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  // Le tour codex complet, a travers le binaire packagee.
  //
  // POURQUOI CE CAS EXISTE. Sept defauts ont ete signales de suite sur ce chemin
  // exact — refus d'agent, effort du mauvais moteur, valeur refusee par l'API,
  // libelles emprunte, panneaux qui noient la reponse. A chaque fois les tests
  // unitaires etaient verts : ils verifiaient des morceaux, pas la chaine.
  //
  // Ce cas fait ce que l'utilisateur fait : il bascule sur codex, applique un
  // agent, envoie un message, et exige une reponse SANS banniere d'erreur. C'est
  // le seul essai qui aurait attrape les sept.
  test('un tour codex avec un agent aboutit, sans banniere d erreur', async () => {
    const launched = await launchApp({
      preconfigureProject: true,
      env: { BYAN_E2E_MOCK_SERVER_PORT: '37347', BYAN_E2E_MOCK_AUTH: '200' },
    });
    const { page, cleanup } = launched;

    try {
      await page.getByTestId('tab-local').click();
      await page.getByTestId('local-spawn-btn').click();
      await expect(page.getByTestId('local-server-status')).toContainText('37347', { timeout: 15_000 });
      await page.getByTestId('local-submit').click();

      await page.getByTestId('nav-chat').click();
      const input = page.getByTestId('local-chat-input');
      await expect(input).toBeVisible({ timeout: 15_000 });

      // 1. basculer sur codex. Le bouton n'est actif que si le binaire est la.
      const codex = page.getByTestId('local-engine-codex');
      await expect(codex).toBeEnabled({ timeout: 20_000 });
      await codex.click();
      await expect(codex).toHaveAttribute('aria-pressed', 'true');

      // 2. appliquer l'agent ET envoyer, en une commande. C'est ce qui etait
      //    refuse avant : « codex ne permet pas de choisir un agent ».
      await input.fill('/byan dis juste le mot PONG');
      await input.press('Enter');

      // 3. l'agent est POSE, pas refuse.
      await expect(page.getByTestId('local-agent-chip')).toContainText('byan', { timeout: 20_000 });

      // 4. le tour vit, puis se termine.
      await expect(page.getByTestId('local-activity')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('local-activity')).toBeHidden({ timeout: 240_000 });

      // 5. une reponse est arrivee.
      const bubbles = page.getByTestId('local-message');
      await expect.poll(async () => bubbles.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

      // 6. AUCUNE banniere d'erreur. C'est le coeur du cas : les sept defauts se
      //    terminaient tous par une erreur affichee ici.
      await expect(page.getByRole('alert')).toHaveCount(0);

      // 7. et pas de message de refus d'agent, meme hors banniere.
      await expect(page.getByText(/ne permet pas de choisir un agent/i)).toHaveCount(0);
      await expect(page.getByText(/Niveau d.effort invalide/i)).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
