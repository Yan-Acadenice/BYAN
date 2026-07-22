// projects-registry (F6) — read/upsert/find against a temp ~/.byan via BYAN_HOME.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readRegistry, upsertProject, findLocalPath, registryPath } from '../projects-registry';

let home: string;
const origHome = process.env.BYAN_HOME;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-reg-'));
  process.env.BYAN_HOME = home;
});
afterEach(() => {
  if (origHome === undefined) delete process.env.BYAN_HOME;
  else process.env.BYAN_HOME = origHome;
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('projects-registry', () => {
  it('reads empty when the file is absent', () => {
    expect(readRegistry()).toEqual({ projects: [] });
    expect(registryPath()).toBe(path.join(home, '.byan', 'projects.json'));
  });

  it('reads empty when the file is corrupt or malformed', () => {
    fs.mkdirSync(path.join(home, '.byan'), { recursive: true });
    fs.writeFileSync(registryPath(), '{ not json', 'utf8');
    expect(readRegistry()).toEqual({ projects: [] });
    // Wrong shape (no projects array) also degrades to empty.
    fs.writeFileSync(registryPath(), '{"projects":"nope"}', 'utf8');
    expect(readRegistry()).toEqual({ projects: [] });
  });

  it('upsert creates then updates by path (no duplicate)', () => {
    upsertProject({ name: 'proj', path: '/home/yan/proj', updatedAt: 't1' });
    upsertProject({ name: 'proj-renamed', path: '/home/yan/proj', updatedAt: 't2' });
    const reg = readRegistry();
    expect(reg.projects).toHaveLength(1);
    expect(reg.projects[0].name).toBe('proj-renamed');
  });

  it('derives the name from the folder basename when omitted', () => {
    const saved = upsertProject({ name: '', path: '/home/yan/mon-projet/', updatedAt: 't' });
    expect(saved.name).toBe('mon-projet');
  });

  it('persists to disk and reloads', () => {
    upsertProject({ name: 'a', path: '/p/a', updatedAt: 't' });
    const raw = JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
    expect(raw.projects[0].path).toBe('/p/a');
  });

  it('findLocalPath matches by projectId first, then by name / basename', () => {
    upsertProject({ name: 'Alpha', path: '/p/alpha', projectId: 'id-1', updatedAt: 't' });
    upsertProject({ name: 'Beta', path: '/p/beta-dir', updatedAt: 't' });

    expect(findLocalPath({ id: 'id-1' })?.path).toBe('/p/alpha');
    // Case-insensitive name match.
    expect(findLocalPath({ name: 'beta' })?.path).toBe('/p/beta-dir');
    // Basename match when name differs.
    expect(findLocalPath({ name: 'beta-dir' })?.path).toBe('/p/beta-dir');
    expect(findLocalPath({ name: 'nope' })).toBeNull();
  });

  it('upsert throws without a path', () => {
    expect(() => upsertProject({ name: 'x', path: '' })).toThrow(/path/);
  });
});
