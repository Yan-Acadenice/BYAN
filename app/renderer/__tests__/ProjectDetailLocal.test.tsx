// ProjectDetail F6 — the local folder card shows when the project maps to a
// registry entry, and "Ouvrir" reveals it in the OS file manager.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectDetail from '../pages/ProjectDetail';

const mockGet = vi.fn();
const mockMem = vi.fn();
const mockKnow = vi.fn();
const mockFind = vi.fn();
const mockReveal = vi.fn();

const PROJECT = {
  id: 'p1', name: 'Mon Projet', description: null, type: 'app', visibility: 'private',
  taxonomy_type: null, my_role: 'owner', root_node_id: null,
  metadata_tree: { nodeCount: 0, maxDepth: 0, types: {} },
};

beforeEach(() => {
  Object.defineProperty(window, 'byanApi', {
    value: {
      byanWeb: {
        projects: { get: mockGet },
        memory: { list: mockMem },
        knowledge: { list: mockKnow },
      },
      projectsLocal: { find: mockFind, reveal: mockReveal },
    },
    writable: true,
    configurable: true,
  });
  mockGet.mockResolvedValue(PROJECT);
  mockMem.mockResolvedValue([]);
  mockKnow.mockResolvedValue([]);
  mockFind.mockResolvedValue(null);
  mockReveal.mockResolvedValue({ ok: true });
});

afterEach(() => vi.clearAllMocks());

describe('ProjectDetail — local folder (F6)', () => {
  it('shows the local folder card and opens it', async () => {
    mockFind.mockResolvedValue({ name: 'Mon Projet', path: '/home/yan/mon-projet' });
    render(<ProjectDetail projectId="p1" />);

    await waitFor(() => expect(screen.getByTestId('project-local-folder')).toBeInTheDocument());
    expect(screen.getByText('/home/yan/mon-projet')).toBeInTheDocument();
    // find was queried by id + name.
    expect(mockFind).toHaveBeenCalledWith({ id: 'p1', name: 'Mon Projet' });

    fireEvent.click(screen.getByTestId('project-open-folder'));
    await waitFor(() => expect(mockReveal).toHaveBeenCalledWith('/home/yan/mon-projet'));
  });

  it('hides the card when no local folder matches', async () => {
    mockFind.mockResolvedValue(null);
    render(<ProjectDetail projectId="p1" />);
    await waitFor(() => expect(screen.getByText('Mon Projet')).toBeInTheDocument());
    expect(screen.queryByTestId('project-local-folder')).not.toBeInTheDocument();
  });
});
