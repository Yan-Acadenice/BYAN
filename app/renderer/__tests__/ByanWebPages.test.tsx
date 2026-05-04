// Smoke tests for byan_web-wired pages.
// Strategy: mock window.byanApi.byanWeb and verify pages mount without crash.
// We do not assert on specific rendered content — that would couple to API data.
// We DO assert that loading states and empty states render correctly.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../pages/Dashboard';
import Projects from '../pages/Projects';
import Agents from '../pages/Agents';
import Memory from '../pages/Memory';
import Knowledge from '../pages/Knowledge';
import Sessions from '../pages/Sessions';
import ProjectDetail from '../pages/ProjectDetail';

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
    expect(screen.getByText(/Loading dashboard/i)).toBeTruthy();
  });

  it('renders KPI cards when data resolves', async () => {
    render(<Dashboard onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Active projects')).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText(/Could not load dashboard/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });
});

// ---------- Projects ----------

describe('Projects', () => {
  it('shows loading then empty state', async () => {
    render(<Projects />);
    expect(screen.getByText(/Loading projects/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/No projects found/i)).toBeTruthy());
  });

  it('shows error + Retry on API failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      projects: { list: vi.fn().mockRejectedValue(new Error('Unauthorized')), get: vi.fn() },
    });
    render(<Projects />);
    await waitFor(() => expect(screen.getByText(/Could not load projects/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
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
    expect(screen.getByText(/Loading agents/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/No custom agents yet/i)).toBeTruthy());
  });

  it('shows error + Retry on failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      customAgents: { list: vi.fn().mockRejectedValue(new Error('Error')) },
    });
    render(<Agents />);
    await waitFor(() => expect(screen.getByText(/Could not load agents/i)).toBeTruthy());
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
    expect(screen.getByText(/Loading memory/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/No memory entries yet/i)).toBeTruthy());
  });

  it('shows error + Retry on failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      memory: { list: vi.fn().mockRejectedValue(new Error('Fail')) },
    });
    render(<Memory />);
    await waitFor(() => expect(screen.getByText(/Could not load memory/i)).toBeTruthy());
  });
});

// ---------- Knowledge ----------

describe('Knowledge', () => {
  it('shows loading then empty state', async () => {
    render(<Knowledge />);
    expect(screen.getByText(/Loading knowledge/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/No knowledge entries yet/i)).toBeTruthy());
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
    expect(screen.getByText(/Loading sessions/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/No sessions yet/i)).toBeTruthy());
  });

  it('shows error + Retry on failure', async () => {
    mountByanApi({
      ...defaultByanWebApi(),
      sessions: { list: vi.fn().mockRejectedValue(new Error('Fail')) },
    });
    render(<Sessions />);
    await waitFor(() => expect(screen.getByText(/Could not load sessions/i)).toBeTruthy());
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
    expect(screen.getByText(/Loading project/i)).toBeTruthy();
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
