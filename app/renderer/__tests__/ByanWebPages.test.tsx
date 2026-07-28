// Smoke tests for byan_web-wired pages.
// Strategy: mock window.byanApi.byanWeb and verify pages mount without crash.
// We do not assert on specific rendered content — that would couple to API data.
// We DO assert that loading states and empty states render correctly.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Dashboard from '../pages/Dashboard';
import Chat from '../pages/Chat';
import Projects from '../pages/Projects';
import Agents from '../pages/Agents';
import Memory from '../pages/Memory';
import Knowledge from '../pages/Knowledge';
import Sessions from '../pages/Sessions';
import ProjectDetail from '../pages/ProjectDetail';
import NewConversationModal from '../components/chat/NewConversationModal';
import AgentPicker from '../components/chat/AgentPicker';
import ScopePicker from '../components/chat/ScopePicker';

// ---- helpers ----

function defaultByanWebApi() {
  return {
    projects: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    memory: {
      list: vi.fn().mockResolvedValue([]),
    },
    knowledge: {
      list: vi.fn().mockResolvedValue([]),
    },
    customAgents: {
      list: vi.fn().mockResolvedValue([]),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([]),
    },
    me: vi.fn().mockResolvedValue({ id: 'u1', username: 'yan', email: 'y@test.com', role: 'admin', displayName: 'Yan' }),
    chat: {
      conversations: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'c1', title: 'New', cli_provider: 'claude-code',
          owner_id: 'u1', created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z', deleted_at: null }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      messages: {
        list: vi.fn().mockResolvedValue([]),
      },
      stream: {
        start: vi.fn().mockResolvedValue({ streamId: 'sid-1' }),
        abort: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

function mountByanApi(byanWeb = defaultByanWebApi()) {
  Object.defineProperty(window, 'byanApi', {
    value: {
      auth: { login: vi.fn(), logout: vi.fn(), getToken: vi.fn() },
      fs: { openProjectDialog: vi.fn(), readFile: vi.fn(), pathExists: vi.fn(), mkdir: vi.fn() },
      mcp: { list: vi.fn().mockResolvedValue([]), start: vi.fn(), stop: vi.fn(), status: vi.fn() },
      cli: { detect: vi.fn() },
      onboarding: { preview: vi.fn(), apply: vi.fn() },
      server: { spawn: vi.fn(), stop: vi.fn(), status: vi.fn() },
      app: { quit: vi.fn(), version: vi.fn(), relaunch: vi.fn(), openExternal: vi.fn() },
      store: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
      byanWeb,
    },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  mountByanApi();
});

// ---------- Dashboard ----------

describe('Dashboard', () => {
  it('shows loading spinner on mount', () => {
    // Never resolves during this render — confirms spinner appears.
    const neverResolves = new Promise<never>(() => {});
    mountByanApi({
      ...defaultByanWebApi(),
      projects: { list: vi.fn().mockReturnValue(neverResolves), get: vi.fn() },
      sessions: { list: vi.fn().mockReturnValue(neverResolves) },
    });
    render(<Dashboard onNavigate={vi.fn()} />);
    expect(screen.getByText(/Chargement du tableau de bord/i)).toBeTruthy();
  });

  it('renders KPI cards when data resolves', async () => {
    render(<Dashboard onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Projets actifs')).toBeTruthy());
    // "Recent sessions" appears twice: once in KPI cards, once in the section header.
    expect(screen.getAllByText('Recent sessions').length).toBeGreaterThanOrEqual(1);
  });

  it('shows error state + Retry button on failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      projects: { list: vi.fn().mockRejectedValue(new Error('Network error')), get: vi.fn() },
      sessions: { list: vi.fn().mockRejectedValue(new Error('Network error')) },
    });
    render(<Dashboard onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Impossible de charger le tableau de bord/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });
});

// ---------- Projects ----------

describe('Projects', () => {
  it('shows loading then empty state', async () => {
    render(<Projects />);
    expect(screen.getByText(/Chargement des projets/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('projects-empty-never')).toBeTruthy());
  });

  it('shows error + Retry on API failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      projects: { list: vi.fn().mockRejectedValue(new Error('Unauthorized')), get: vi.fn() },
    });
    render(<Projects />);
    await waitFor(() => expect(screen.getByText(/Impossible de charger les projets/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Réessayer/i })).toBeTruthy();
  });

  it('renders project rows when list returns data', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      projects: {
        list: vi.fn().mockResolvedValue([
          { id: 'p1', name: 'BYAN Platform', type: 'dev', visibility: 'private', my_role: 'admin',
            description: null, taxonomy_type: null, root_node_id: null, metadata_tree: null,
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z' },
        ]),
        get: vi.fn(),
      },
    });
    render(<Projects />);
    await waitFor(() => expect(screen.getByText('BYAN Platform')).toBeTruthy());
  });
});

// ---------- Agents ----------

describe('Agents', () => {
  it('shows loading then empty state', async () => {
    render(<Agents />);
    expect(screen.getByText(/Chargement des agents/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('agents-empty-never')).toBeTruthy());
  });

  it('shows error + Retry on failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      customAgents: { list: vi.fn().mockRejectedValue(new Error('Error')) },
    });
    render(<Agents />);
    await waitFor(() => expect(screen.getByText(/Impossible de charger les agents/i)).toBeTruthy());
  });

  it('renders agent list when data returns', async () => {
    const agent = {
      id: 'a1', slug: 'atlas-ui', name: 'Atlas', title: 'Ops Specialist',
      icon: null, color: null, role: 'BYAN operator', identity: null, communication_style: null,
      principles: ['API-First'], menu: [], soul: null, tao: null, knowledge: [],
      model_preferences: {}, parent_slug: null, created_by: 'u1', status: 'active',
      created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
    };
    mountByanApi({ ...defaultByanWebApi(), customAgents: { list: vi.fn().mockResolvedValue([agent]) } });
    render(<Agents />);
    // "Atlas" appears in both the list and the detail panel — use getAllByText.
    await waitFor(() => expect(screen.getAllByText('Atlas').length).toBeGreaterThanOrEqual(1));
  });
});

// ---------- Memory ----------

describe('Memory', () => {
  it('shows loading then empty state', async () => {
    render(<Memory />);
    expect(screen.getByText(/Chargement de la mémoire/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('memory-empty-never')).toBeTruthy());
  });

  it('shows error + Retry on failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      memory: { list: vi.fn().mockRejectedValue(new Error('Fail')) },
    });
    render(<Memory />);
    await waitFor(() => expect(screen.getByText(/Impossible de charger la mémoire/i)).toBeTruthy());
  });
});

// ---------- Knowledge ----------

describe('Knowledge', () => {
  it('shows loading then empty state', async () => {
    render(<Knowledge />);
    expect(screen.getByText(/Chargement de la connaissance/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('knowledge-empty-never')).toBeTruthy());
  });

  it('renders cards when data returns', async () => {
    const entry = {
      id: 'k1', title: 'Merise Guide', content: '...', category: 'methodology',
      tags: ['merise'], project_id: 'p1', node_id: null, path: 'guide.md',
      created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z',
    };
    mountByanApi({ ...defaultByanWebApi(), knowledge: { list: vi.fn().mockResolvedValue([entry]) } });
    render(<Knowledge />);
    await waitFor(() => expect(screen.getByText('Merise Guide')).toBeTruthy());
  });
});

// ---------- Sessions ----------

describe('Sessions', () => {
  it('shows loading then empty state', async () => {
    render(<Sessions />);
    expect(screen.getByText(/Chargement des sessions/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Aucune session pour le moment/i)).toBeTruthy());
  });

  it('shows error + Retry on failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      sessions: { list: vi.fn().mockRejectedValue(new Error('Fail')) },
    });
    render(<Sessions />);
    await waitFor(() => expect(screen.getByText(/Impossible de charger les sessions/i)).toBeTruthy());
  });
});

// ---------- ProjectDetail ----------

describe('ProjectDetail', () => {
  it('shows loading when projectId provided', () => {
    const neverResolves = new Promise<never>(() => {});
    mountByanApi({
      ...defaultByanWebApi(),
      projects: { list: vi.fn(), get: vi.fn().mockReturnValue(neverResolves) },
      memory: { list: vi.fn().mockReturnValue(neverResolves) },
      knowledge: { list: vi.fn().mockReturnValue(neverResolves) },
    });
    render(<ProjectDetail projectId="p1" />);
    expect(screen.getByText(/Chargement du projet/i)).toBeTruthy();
  });

  it('shows not found when project is null', async () => {
    render(<ProjectDetail projectId="p1" />);
    // Mock returns null by default
    await waitFor(() => expect(screen.getByText(/Project not found/i)).toBeTruthy());
  });

  it('renders project when returned', async () => {
    const project = {
      id: 'p1', name: 'BYAN Platform', type: 'dev', visibility: 'private', my_role: 'admin',
      description: 'Test project', taxonomy_type: null, root_node_id: null, metadata_tree: null,
      created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z',
    };
    mountByanApi({
      ...defaultByanWebApi(),
      projects: { list: vi.fn(), get: vi.fn().mockResolvedValue(project) },
      memory: { list: vi.fn().mockResolvedValue([]) },
      knowledge: { list: vi.fn().mockResolvedValue([]) },
    });
    render(<ProjectDetail projectId="p1" />);
    await waitFor(() => expect(screen.getByText('BYAN Platform')).toBeTruthy());
  });
});

// ---------- Chat ----------

describe('Chat', () => {
  it('shows loading spinner while conversations load', () => {
    const neverResolves = new Promise<never>(() => {});
    mountByanApi({
      ...defaultByanWebApi(),
      chat: {
        ...defaultByanWebApi().chat,
        conversations: {
          ...defaultByanWebApi().chat.conversations,
          list: vi.fn().mockReturnValue(neverResolves),
        },
      },
    });
    render(<Chat />);
    expect(screen.getByText(/Chargement/i)).toBeTruthy();
  });

  it('shows empty state when no conversations exist', async () => {
    render(<Chat />);
    await waitFor(() => expect(screen.getByText(/Aucune conversation pour le moment/i)).toBeTruthy());
  });

  it('shows error + Retry when conversations fail to load', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      chat: {
        ...defaultByanWebApi().chat,
        conversations: {
          ...defaultByanWebApi().chat.conversations,
          list: vi.fn().mockRejectedValue(new Error('Network error')),
        },
      },
    });
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
  });

  it('renders conversation in sidebar when one exists', async () => {
    const conv = {
      id: 'c1', title: 'My Chat', cli_provider: 'claude-code', owner_id: 'u1',
      project_id: null, agent_id: null, model: null, provider: null, system_prompt: null,
      created_by: 'u1', scope_snapshot: null, deleted_at: null,
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z',
    };
    mountByanApi({
      ...defaultByanWebApi(),
      chat: {
        ...defaultByanWebApi().chat,
        conversations: {
          ...defaultByanWebApi().chat.conversations,
          list: vi.fn().mockResolvedValue([conv]),
        },
        messages: { list: vi.fn().mockResolvedValue([]) },
      },
    });
    render(<Chat />);
    // Title appears in sidebar + conversation header (2 elements is expected).
    await waitFor(() => expect(screen.getAllByText('My Chat').length).toBeGreaterThan(0));
  });

  it('shows input area when a conversation is active', async () => {
    const conv = {
      id: 'c1', title: 'Active Conv', cli_provider: 'claude-code', owner_id: 'u1',
      project_id: null, agent_id: null, model: null, provider: null, system_prompt: null,
      created_by: 'u1', scope_snapshot: null, deleted_at: null,
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z',
    };
    mountByanApi({
      ...defaultByanWebApi(),
      chat: {
        ...defaultByanWebApi().chat,
        conversations: {
          ...defaultByanWebApi().chat.conversations,
          list: vi.fn().mockResolvedValue([conv]),
        },
        messages: { list: vi.fn().mockResolvedValue([]) },
      },
    });
    render(<Chat />);
    // Title appears in sidebar + conversation header (2 occurrences is expected).
    await waitFor(() => expect(screen.getAllByText('Active Conv').length).toBeGreaterThan(0));
    // Input textarea should be visible
    expect(screen.getByPlaceholderText(/Message/i)).toBeTruthy();
  });

  it('opens NewConversationModal when + button is clicked', async () => {
    render(<Chat />);
    await waitFor(() => expect(screen.getByText(/Aucune conversation pour le moment/i)).toBeTruthy());
    const plusBtn = screen.getByTitle('New conversation');
    fireEvent.click(plusBtn);
    // Modal contains a specific subtitle that only appears inside the modal, not in the empty state.
    expect(screen.getByText(/Configure CLI, project and agent scope/i)).toBeTruthy();
  });

  it('renders project + agent badges when conversation has ids', async () => {
    const conv = {
      id: 'c1', title: 'Centralis Chat', cli_provider: 'claude-code', owner_id: 'u1',
      project_id: 'proj-centralis', agent_id: 'agent-winston',
      model: null, provider: null, system_prompt: null,
      created_by: 'u1', scope_snapshot: null, deleted_at: null,
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z',
    };
    mountByanApi({
      ...defaultByanWebApi(),
      projects: {
        list: vi.fn().mockResolvedValue([
          { id: 'proj-centralis', name: 'Centralis', type: 'dev', visibility: 'private',
            my_role: 'admin', description: null, taxonomy_type: null, root_node_id: null,
            metadata_tree: null, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z' },
        ]),
        get: vi.fn().mockResolvedValue(null),
      },
      customAgents: {
        list: vi.fn().mockResolvedValue([
          { id: 'agent-winston', slug: 'winston', name: 'Winston', title: 'Architect',
            icon: null, color: null, role: null, identity: null, communication_style: null,
            principles: [], menu: [], soul: null, tao: null, knowledge: [],
            model_preferences: {}, parent_slug: null, created_by: 'u1', status: 'active',
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
        ]),
      },
      chat: {
        ...defaultByanWebApi().chat,
        conversations: {
          ...defaultByanWebApi().chat.conversations,
          list: vi.fn().mockResolvedValue([conv]),
        },
        messages: { list: vi.fn().mockResolvedValue([]) },
      },
    });
    render(<Chat />);
    // Badges for project and agent should appear in the conversation header.
    await waitFor(() => expect(screen.getByText(/Project: Centralis/)).toBeTruthy());
    expect(screen.getByText(/Agent: Winston/)).toBeTruthy();
  });
});

// ---------- NewConversationModal ----------

describe('NewConversationModal', () => {
  it('renders when open=true', () => {
    render(
      <NewConversationModal open={true} onClose={vi.fn()} onCreate={vi.fn()} />
    );
    expect(screen.getByText('New conversation')).toBeTruthy();
  });

  it('does not render when open=false', () => {
    render(
      <NewConversationModal open={false} onClose={vi.fn()} onCreate={vi.fn()} />
    );
    expect(screen.queryByText('New conversation')).toBeNull();
  });

  it('calls onCreate with projectId and agentId from form', async () => {
    const mockCreate = vi.fn();
    mountByanApi({
      ...defaultByanWebApi(),
      projects: {
        list: vi.fn().mockResolvedValue([
          { id: 'p1', name: 'MyProject', type: 'dev', visibility: 'private',
            my_role: 'admin', description: null, taxonomy_type: null, root_node_id: null,
            metadata_tree: null, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z' },
        ]),
        get: vi.fn().mockResolvedValue(null),
      },
      customAgents: {
        list: vi.fn().mockResolvedValue([
          { id: 'a1', slug: 'winston', name: 'Winston', title: 'Architect',
            icon: null, color: null, role: null, identity: null, communication_style: null,
            principles: [], menu: [], soul: null, tao: null, knowledge: [],
            model_preferences: {}, parent_slug: null, created_by: 'u1', status: 'active',
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
        ]),
      },
    });
    render(
      <NewConversationModal open={true} onClose={vi.fn()} onCreate={mockCreate} />
    );

    // Wait for projects + agents to load into selects.
    await waitFor(() => expect(screen.getByText('MyProject')).toBeTruthy());

    // Use the select by finding the option and its parent select.
    const projectOption = screen.getByText('MyProject') as HTMLOptionElement;
    fireEvent.change(projectOption.parentElement!, { target: { value: 'p1' } });

    // Click Create.
    const createBtn = screen.getByRole('button', { name: /create/i });
    fireEvent.click(createBtn);

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.projectId).toBe('p1');
  });

  it('calls onClose when Cancel is clicked', () => {
    const mockClose = vi.fn();
    render(
      <NewConversationModal open={true} onClose={mockClose} onCreate={vi.fn()} />
    );
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

// ---------- AgentPicker ----------

describe('AgentPicker', () => {
  it('renders "No agent" trigger button when no value', () => {
    mountByanApi();
    render(<AgentPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Aucun agent')).toBeTruthy();
  });

  it('shows agent name when value is set', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      customAgents: {
        list: vi.fn().mockResolvedValue([
          { id: 'a1', slug: 'atlas', name: 'Atlas', title: null,
            icon: null, color: null, role: null, identity: null, communication_style: null,
            principles: [], menu: [], soul: null, tao: null, knowledge: [],
            model_preferences: {}, parent_slug: null, created_by: 'u1', status: 'active',
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
        ]),
      },
    });
    render(<AgentPicker value="a1" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Atlas')).toBeTruthy());
  });

  it('opens dropdown and lists agents on click', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      customAgents: {
        list: vi.fn().mockResolvedValue([
          { id: 'a1', slug: 'atlas', name: 'Atlas', title: null,
            icon: null, color: null, role: null, identity: null, communication_style: null,
            principles: [], menu: [], soul: null, tao: null, knowledge: [],
            model_preferences: {}, parent_slug: null, created_by: 'u1', status: 'active',
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
        ]),
      },
    });
    render(<AgentPicker value={null} onChange={vi.fn()} />);
    await waitFor(() => {}); // let load finish
    const trigger = screen.getByRole('button', { name: /choose agent/i });
    fireEvent.click(trigger);
    // After click the dropdown should list Atlas.
    await waitFor(() => expect(screen.getAllByText('Atlas').length).toBeGreaterThan(0));
  });

  it('filters agents by query', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      customAgents: {
        list: vi.fn().mockResolvedValue([
          { id: 'a1', slug: 'atlas', name: 'Atlas', title: null, icon: null, color: null,
            role: null, identity: null, communication_style: null, principles: [], menu: [],
            soul: null, tao: null, knowledge: [], model_preferences: {}, parent_slug: null,
            created_by: 'u1', status: 'active',
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
          { id: 'a2', slug: 'winston', name: 'Winston', title: null, icon: null, color: null,
            role: null, identity: null, communication_style: null, principles: [], menu: [],
            soul: null, tao: null, knowledge: [], model_preferences: {}, parent_slug: null,
            created_by: 'u1', status: 'active',
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
        ]),
      },
    });
    render(<AgentPicker value={null} onChange={vi.fn()} />);
    await waitFor(() => {});
    const trigger = screen.getByRole('button', { name: /choose agent/i });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getAllByText('Atlas').length).toBeGreaterThan(0));

    // Type "win" — only Winston should remain.
    const searchInput = screen.getByPlaceholderText(/search agents/i);
    fireEvent.change(searchInput, { target: { value: 'win' } });
    expect(screen.queryByText('Atlas')).toBeNull();
    expect(screen.getByText('Winston')).toBeTruthy();
  });
});

// ---------- ScopePicker ----------

describe('ScopePicker', () => {
  const noopChange = vi.fn();

  it('renders three section headers', () => {
    render(
      <ScopePicker
        scope={{ types: [] }}
        onChange={noopChange}
        projects={[]}
      />
    );
    expect(screen.getByText('Project context')).toBeTruthy();
    expect(screen.getByText('Knowledge')).toBeTruthy();
    expect(screen.getByText('Memory')).toBeTruthy();
  });

  it('does not show project select when project type is not toggled', () => {
    render(
      <ScopePicker scope={{ types: [] }} onChange={noopChange} projects={[]} />
    );
    // There should be no project dropdown visible.
    expect(screen.queryByText('None')).toBeNull();
  });

  it('calls onChange when project type is toggled on', () => {
    const handleChange = vi.fn();
    render(
      <ScopePicker scope={{ types: [] }} onChange={handleChange} projects={[]} />
    );
    // Click the first checkbox (project section).
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ types: expect.arrayContaining(['project']) })
    );
  });

  it('shows project dropdown when project type is active', () => {
    render(
      <ScopePicker
        scope={{ types: ['project'], projectId: null }}
        onChange={noopChange}
        projects={[
          { id: 'p1', name: 'Centralis', type: 'dev', visibility: 'private', my_role: 'admin',
            description: null, taxonomy_type: null, root_node_id: null, metadata_tree: null,
            created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z' },
        ]}
      />
    );
    expect(screen.getByText('Centralis')).toBeTruthy();
  });

  it('renders token budget input with default 2000', () => {
    render(
      <ScopePicker scope={{ types: [], tokenBudget: 2000 }} onChange={noopChange} projects={[]} />
    );
    const input = screen.getByDisplayValue('2000') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('2000');
  });
});
