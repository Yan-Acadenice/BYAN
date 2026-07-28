// Lot 5 — les deux vides, sur les cinq pages de liste.
//
// Ce que ces tests verrouillent, et pourquoi : avant le lot 5 les cinq pages
// rendaient UN bloc pour deux faits differents, donc « ce projet n'a jamais ete
// configure » et « ton filtre ne matche rien » arrivaient dans les memes mots,
// avec la meme (absence de) porte de sortie. Un test qui se contenterait de
// verifier « il y a un vide » ne pourrait pas echouer sur cette regression : on
// assert donc la DISTINCTION (l'attribut data-empty), le texte propre a chaque
// cas, et le fait que chaque vide porte SA sortie et pas celle de l'autre.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

import Agents from '../pages/Agents';
import Memory from '../pages/Memory';
import Knowledge from '../pages/Knowledge';
import Projects from '../pages/Projects';
import McpServers from '../pages/McpServers';
import { I18nProvider } from '../i18n/I18nContext';
import { ToastProvider } from '../components/toast/ToastContext';

// ---------------------------------------------------------------------------
// Harnais
// ---------------------------------------------------------------------------

const openProjectDialog = vi.fn();
const install = vi.fn();
const record = vi.fn();
const storeSet = vi.fn();
let storeValues: Record<string, unknown> = {};

function mountApi(over: {
  agents?: unknown[];
  memory?: unknown[];
  knowledge?: unknown[];
  projects?: unknown[];
  mcp?: unknown[];
} = {}) {
  Object.defineProperty(window, 'byanApi', {
    configurable: true,
    writable: true,
    value: {
      byanWeb: {
        customAgents: { list: vi.fn().mockResolvedValue(over.agents ?? []) },
        memory: { list: vi.fn().mockResolvedValue(over.memory ?? []) },
        knowledge: { list: vi.fn().mockResolvedValue(over.knowledge ?? []) },
        projects: { list: vi.fn().mockResolvedValue(over.projects ?? []), get: vi.fn() },
        sessions: { list: vi.fn().mockResolvedValue([]) },
      },
      mcp: {
        list: vi.fn().mockResolvedValue(over.mcp ?? []),
        start: vi.fn(), stop: vi.fn(), status: vi.fn(),
        add: vi.fn(), update: vi.fn(), delete: vi.fn(),
      },
      fs: { openProjectDialog },
      projectsLocal: { install, record },
      store: {
        get: vi.fn(async (k: string) => storeValues[k] ?? null),
        set: storeSet,
      },
    },
  });
  Object.defineProperty(window, 'byanEvents', {
    configurable: true,
    writable: true,
    value: { on: () => () => {} },
  });
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider initialLocale="fr">
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

function agent(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id, slug: name.toLowerCase(), name, title: null, icon: null, color: null,
    role: null, identity: null, communication_style: null, principles: [], menu: [],
    soul: null, tao: null, knowledge: [], model_preferences: {}, parent_slug: null,
    created_by: 'local', status: 'local',
    created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
    ...extra,
  };
}

function memoryEntry(id: string, content: string) {
  return {
    id, project_id: 'p', node_id: null, user_id: null, cli_source: 'local',
    session_id: null, layer: 'session', category: null, content, metadata: null,
    pinned: false, accessed_at: null,
    created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
  };
}

function knowledgeEntry(id: string, title: string) {
  return {
    id, title, content: '', category: null, tags: null, project_id: 'p',
    node_id: null, path: `${title}.md`,
    created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z',
  };
}

function project(id: string, name: string, updated: string) {
  return {
    id, name, description: null, type: 'local', visibility: 'private',
    taxonomy_type: null, my_role: 'owner', root_node_id: null, metadata_tree: null,
    created_at: updated, updated_at: updated,
  };
}

function mcpServer(id: string) {
  return {
    id, name: id, transport: 'stdio', command: 'node', args: [], enabled: true,
    status: { state: 'stopped' as const },
  };
}

beforeEach(() => {
  storeValues = {};
  openProjectDialog.mockResolvedValue('/home/yan/monprojet');
  install.mockResolvedValue({ ok: true, verify: { passed: 3, total: 3, failed: [] }, launch: null });
  record.mockResolvedValue(undefined);
  storeSet.mockResolvedValue(undefined);
  mountApi();
});

afterEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// La distinction elle-meme : les deux vides ne sont pas le meme bloc
// ---------------------------------------------------------------------------

describe('les deux vides sont distincts', () => {
  it('rend VID-0 quand rien n existe, VID-F quand le filtre cache tout', async () => {
    // VID-0 : liste vide a la source.
    const first = render(<Providers><Agents /></Providers>);
    await waitFor(() => expect(screen.getByTestId('agents-empty-never')).toBeTruthy());
    expect(screen.getByTestId('agents-empty-never').getAttribute('data-empty')).toBe('vide');
    expect(screen.queryByTestId('agents-empty-filtered')).toBeNull();
    first.unmount();

    // VID-F : la source a des agents, le filtre n en laisse aucun.
    mountApi({ agents: [agent('a1', 'Winston')] });
    render(<Providers><Agents /></Providers>);
    await waitFor(() => expect(screen.getByTestId('agents-filter')).toBeTruthy());
    fireEvent.change(screen.getByTestId('agents-filter'), { target: { value: 'audit' } });

    await waitFor(() => expect(screen.getByTestId('agents-empty-filtered')).toBeTruthy());
    expect(screen.getByTestId('agents-empty-filtered').getAttribute('data-empty')).toBe('filtre');
    // Le vide « jamais initialise » ne doit PAS apparaitre : c est exactement la
    // confusion que le lot 5 supprime.
    expect(screen.queryByTestId('agents-empty-never')).toBeNull();
  });

  it('donne a chaque vide SA sortie, et pas celle de l autre', async () => {
    const first = render(<Providers><Agents /></Providers>);
    await waitFor(() => expect(screen.getByTestId('agents-empty-never')).toBeTruthy());
    // VID-0 sort par la configuration, pas par un effacement de filtre.
    expect(screen.getByTestId('agents-empty-never-action').textContent).toMatch(/Configurer ce projet/);
    expect(screen.queryByText(/Effacer le filtre/i)).toBeNull();
    first.unmount();

    mountApi({ agents: [agent('a1', 'Winston')] });
    render(<Providers><Agents /></Providers>);
    await waitFor(() => expect(screen.getByTestId('agents-filter')).toBeTruthy());
    fireEvent.change(screen.getByTestId('agents-filter'), { target: { value: 'audit' } });
    await waitFor(() => expect(screen.getByTestId('agents-empty-filtered-clear')).toBeTruthy());
    // VID-F sort par l effacement du filtre, pas par la configuration.
    expect(screen.getByTestId('agents-empty-filtered-clear').textContent).toMatch(/Effacer le filtre/);
    expect(screen.queryByText(/Configurer ce projet/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VID-F : la requete est rendue a l utilisateur, et le total est dit
// ---------------------------------------------------------------------------

describe('VID-F rend la requete et le total', () => {
  it('cite la requete tapee entre guillemets et compte le total', async () => {
    mountApi({ agents: [agent('a1', 'Winston'), agent('a2', 'Amelia'), agent('a3', 'Mary')] });
    render(<Providers><Agents /></Providers>);
    await waitFor(() => expect(screen.getByTestId('agents-filter')).toBeTruthy());
    fireEvent.change(screen.getByTestId('agents-filter'), { target: { value: 'audit' } });

    const empty = await waitFor(() => screen.getByTestId('agents-empty-filtered'));
    // La requete revient a l utilisateur : il relit ce qu il a tape.
    expect(empty.textContent).toMatch(/Aucun agent ne correspond à/);
    expect(empty.textContent).toContain('audit');
    // Et il apprend combien existent, filtre ignore.
    expect(empty.textContent).toMatch(/3 agents au total/);
  });

  it('accorde au feminin et au singulier', async () => {
    mountApi({ memory: [memoryEntry('m1', 'une seule entree')] });
    render(<Providers><Memory /></Providers>);
    await waitFor(() => expect(screen.getByTestId('memory-filter')).toBeTruthy());
    fireEvent.change(screen.getByTestId('memory-filter'), { target: { value: 'zzz' } });

    const empty = await waitFor(() => screen.getByTestId('memory-empty-filtered'));
    expect(empty.textContent).toMatch(/Aucune entrée de mémoire ne correspond à/);
    // Un seul element : singulier, pas « 1 entrées ».
    expect(empty.textContent).toMatch(/1 entrée de mémoire au total/);
  });

  it('efface le filtre et rend la liste', async () => {
    mountApi({ knowledge: [knowledgeEntry('k1', 'Merise')] });
    render(<Providers><Knowledge /></Providers>);
    await waitFor(() => expect(screen.getByTestId('knowledge-filter')).toBeTruthy());
    fireEvent.change(screen.getByTestId('knowledge-filter'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByTestId('knowledge-empty-filtered')).toBeTruthy());

    fireEvent.click(screen.getByTestId('knowledge-empty-filtered-clear'));

    await waitFor(() => expect(screen.getByText('Merise')).toBeTruthy());
    expect(screen.queryByTestId('knowledge-empty-filtered')).toBeNull();
    expect((screen.getByTestId('knowledge-filter') as HTMLInputElement).value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// VID-0 : la sortie configure vraiment le projet et relit la page
// ---------------------------------------------------------------------------

describe('VID-0 sort par la configuration du projet', () => {
  it('choisit un dossier, installe, pose la racine, puis relit la liste', async () => {
    const listAgents = vi.fn()
      .mockResolvedValueOnce([])                       // premier chargement : vide
      .mockResolvedValue([agent('a1', 'Winston')]);    // apres configuration
    mountApi();
    (window.byanApi.byanWeb.customAgents.list as unknown) = listAgents;

    render(<Providers><Agents /></Providers>);
    await waitFor(() => expect(screen.getByTestId('agents-empty-never')).toBeTruthy());

    fireEvent.click(screen.getByTestId('agents-empty-never-action'));

    await waitFor(() => expect(install).toHaveBeenCalledWith({ projectRoot: '/home/yan/monprojet' }));
    // La racine courante est posee : sans elle, la page Serveurs MCP relirait le
    // meme neant et le bouton serait une commande muette.
    expect(storeSet).toHaveBeenCalledWith('onboarding.projectRoot', '/home/yan/monprojet');
    // Et la liste est relue, donc l action a un effet visible. Le nom apparait
    // deux fois : dans la ligne de liste et dans le panneau de detail.
    await waitFor(() => expect(screen.getAllByText('Winston').length).toBeGreaterThan(0));
  });

  it('ne touche a rien quand le choix du dossier est annule', async () => {
    openProjectDialog.mockResolvedValue(null);
    render(<Providers><Agents /></Providers>);
    await waitFor(() => expect(screen.getByTestId('agents-empty-never')).toBeTruthy());

    fireEvent.click(screen.getByTestId('agents-empty-never-action'));

    await waitFor(() => expect(openProjectDialog).toHaveBeenCalled());
    expect(install).not.toHaveBeenCalled();
    expect(storeSet).not.toHaveBeenCalled();
    expect(screen.getByTestId('agents-empty-never')).toBeTruthy();
  });

  it('rend la trace de la commande meme quand la liste reste vide', async () => {
    // La memoire ne se remplit pas en configurant : sans trace, le bouton
    // serait une commande muette (regle 3 de la passation).
    render(<Providers><Memory /></Providers>);
    await waitFor(() => expect(screen.getByTestId('memory-empty-never')).toBeTruthy());

    fireEvent.click(screen.getByTestId('memory-empty-never-action'));

    await waitFor(() => expect(screen.getByTestId('install-panel')).toBeTruthy());
    expect(screen.getByTestId('install-panel').textContent).toMatch(/Terminé : 3\/3/);
    // La liste est toujours vide, et c est dit sans mentir.
    expect(screen.getByTestId('memory-empty-never')).toBeTruthy();
  });

  it('rend l echec de la configuration au lieu de le taire', async () => {
    install.mockRejectedValue(new Error('gabarits introuvables'));
    render(<Providers><Knowledge /></Providers>);
    await waitFor(() => expect(screen.getByTestId('knowledge-empty-never')).toBeTruthy());

    fireEvent.click(screen.getByTestId('knowledge-empty-never-action'));

    await waitFor(() => expect(screen.getByTestId('install-panel')).toBeTruthy());
    expect(screen.getByTestId('install-panel').textContent).toMatch(/Échec : gabarits introuvables/);
  });
});

// ---------------------------------------------------------------------------
// Le controle de filtre n existe pas quand il ne peut rien filtrer (regle 1)
// ---------------------------------------------------------------------------

describe('le filtre est absent quand il ne peut rien faire', () => {
  it.each([
    ['Agents', <Agents key="a" />, 'agents-filter'],
    ['Mémoire', <Memory key="m" />, 'memory-filter'],
    ['Connaissance', <Knowledge key="k" />, 'knowledge-filter'],
    ['Projets', <Projects key="p" />, 'projects-filter'],
  ])('%s : pas de champ de filtre sur VID-0', async (_name, element, testId) => {
    render(<Providers>{element}</Providers>);
    await waitFor(() => expect(screen.getByText(/^Aucun/)).toBeTruthy());
    // Grise, il promettrait une capacite et la retirerait. Il est absent.
    expect(screen.queryByTestId(testId)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Projets : deux filtres, un seul bouton de sortie qui les remet tous a zero
// ---------------------------------------------------------------------------

describe('Projets — VID-F compose ses deux filtres', () => {
  const vieux = project('p1', 'Ancien', '2020-01-01T00:00:00Z');

  it('nomme la periode quand seul le filtre Récents cache tout', async () => {
    mountApi({ projects: [vieux] });
    render(<Providers><Projects /></Providers>);
    await waitFor(() => expect(screen.getByText('Ancien')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Récents' }));

    const empty = await waitFor(() => screen.getByTestId('projects-empty-filtered'));
    // Pas de requete tapee : la phrase dit la portee, en clair, pas « recent ».
    expect(empty.textContent).toMatch(/Aucun projet parmi les projets touchés depuis 3 jours/);
    expect(empty.textContent).toMatch(/1 projet au total sur cette machine/);
  });

  it('compose la requete et la periode quand les deux filtrent', async () => {
    mountApi({ projects: [vieux] });
    render(<Providers><Projects /></Providers>);
    await waitFor(() => expect(screen.getByText('Ancien')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Récents' }));
    fireEvent.change(screen.getByTestId('projects-filter'), { target: { value: 'audit' } });

    const empty = await waitFor(() => screen.getByTestId('projects-empty-filtered'));
    expect(empty.textContent).toContain('audit');
    expect(empty.textContent).toMatch(/parmi les projets touchés depuis 3 jours/);
  });

  it('remet les DEUX filtres a zero : sinon le vide reviendrait aussitot', async () => {
    mountApi({ projects: [vieux] });
    render(<Providers><Projects /></Providers>);
    await waitFor(() => expect(screen.getByText('Ancien')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Récents' }));
    fireEvent.change(screen.getByTestId('projects-filter'), { target: { value: 'audit' } });
    await waitFor(() => expect(screen.getByTestId('projects-empty-filtered')).toBeTruthy());

    fireEvent.click(screen.getByTestId('projects-empty-filtered-clear'));

    await waitFor(() => expect(screen.getByText('Ancien')).toBeTruthy());
    expect((screen.getByTestId('projects-filter') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Tous' }).getAttribute('aria-pressed')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Serveurs MCP : VID-0 a deux causes, et chacune a sa sortie
// ---------------------------------------------------------------------------

describe('Serveurs MCP — VID-0 nomme sa cause', () => {
  it('sans racine de projet : dit qu il n y a pas de fichier a lire, propose de configurer', async () => {
    mountApi({ mcp: [] }); // store.get renvoie null : aucune racine
    render(<Providers><McpServers /></Providers>);

    const empty = await waitFor(() => screen.getByTestId('mcp-empty-no-project'));
    expect(empty.textContent).toMatch(/Aucun projet configuré/);
    expect(empty.textContent).toMatch(/\.mcp\.json/);
    expect(screen.getByTestId('mcp-empty-no-project-action').textContent).toMatch(/Configurer ce projet/);
    // « Ajouter » ne peut que repondre UNAVAILABLE sans racine : il est absent
    // du DOM plutot que grise (regle 1).
    expect(screen.queryByTestId('mcp-add-btn')).toBeNull();
    expect(screen.queryByTestId('mcp-empty-never')).toBeNull();
  });

  it('avec une racine mais aucun serveur : nomme le dossier et propose d en ajouter', async () => {
    storeValues['onboarding.projectRoot'] = '/home/yan/monprojet';
    mountApi({ mcp: [] });
    render(<Providers><McpServers /></Providers>);

    const empty = await waitFor(() => screen.getByTestId('mcp-empty-never'));
    expect(empty.textContent).toMatch(/Aucun serveur MCP dans ce projet/);
    // Le dossier est nomme : l utilisateur sait QUEL .mcp.json a ete lu.
    expect(empty.textContent).toContain('/home/yan/monprojet');
    expect(screen.getByTestId('mcp-empty-never-action').textContent).toMatch(/Ajouter un serveur MCP/);
    expect(screen.queryByTestId('mcp-empty-no-project')).toBeNull();
    // Ici la racine existe, donc l action du haut est offerte.
    expect(screen.getByTestId('mcp-add-btn')).toBeTruthy();
  });

  it('ouvre le formulaire depuis la sortie du vide', async () => {
    storeValues['onboarding.projectRoot'] = '/home/yan/monprojet';
    mountApi({ mcp: [] });
    render(<Providers><McpServers /></Providers>);
    await waitFor(() => expect(screen.getByTestId('mcp-empty-never')).toBeTruthy());

    fireEvent.click(screen.getByTestId('mcp-empty-never-action'));

    // Le formulaire d ajout est monte : l action produit un changement visible.
    // (McpServerFormModal ne porte pas role="dialog" — hors perimetre du lot 5 —
    // donc on assert sur son titre.)
    await waitFor(() => expect(screen.getByText(/Add MCP server/i)).toBeTruthy());
  });

  it('un .mcp.json casse ne se lit pas comme un projet vide', async () => {
    storeValues['onboarding.projectRoot'] = '/home/yan/monprojet';
    mountApi({ mcp: [] });
    (window.byanApi.mcp.list as unknown) = vi.fn().mockRejectedValue(new Error('JSON invalide ligne 4'));
    render(<Providers><McpServers /></Providers>);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(within(screen.getByRole('alert')).getByText(/JSON invalide ligne 4/)).toBeTruthy();
    expect(screen.queryByTestId('mcp-empty-never')).toBeNull();
    expect(screen.queryByTestId('mcp-empty-no-project')).toBeNull();
  });

  it('ne rend aucun vide quand des serveurs existent', async () => {
    storeValues['onboarding.projectRoot'] = '/home/yan/monprojet';
    mountApi({ mcp: [mcpServer('byan')] });
    render(<Providers><McpServers /></Providers>);

    await waitFor(() => expect(screen.getByText('byan')).toBeTruthy());
    expect(screen.queryByTestId('mcp-empty-never')).toBeNull();
    expect(screen.queryByTestId('mcp-empty-no-project')).toBeNull();
  });
});
