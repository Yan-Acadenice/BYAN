// byan-web.ts — IPC handlers that bridge the renderer to the byan_web REST API.
//
// Pattern: one handler per byanWeb.* channel, each delegating to byan-api-client.
// No fetch logic here — keep handlers thin so they are trivially testable.

import type { IpcMain } from 'electron';
import { IPC_CHANNELS, ByanApiListOpts } from '../../shared/ipc-contract';
import { wrap } from './_error';
import {
  fetchMe,
  fetchProjects,
  fetchProject,
  fetchMemory,
  fetchKnowledge,
  fetchCustomAgents,
  fetchSessions,
} from '../byan-api-client';

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.byanWeb.me, wrap(() => fetchMe()));

  ipcMain.handle(IPC_CHANNELS.byanWeb.projectsList, wrap(() => fetchProjects()));

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.projectsGet,
    wrap((_evt, id: string) => fetchProject(id))
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.memoryList,
    wrap((_evt, opts?: ByanApiListOpts) => fetchMemory(opts ?? {}))
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.knowledgeList,
    wrap((_evt, opts?: ByanApiListOpts) => fetchKnowledge(opts ?? {}))
  );

  ipcMain.handle(IPC_CHANNELS.byanWeb.customAgentsList, wrap(() => fetchCustomAgents()));

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.sessionsList,
    wrap((_evt, opts?: Pick<ByanApiListOpts, 'projectId' | 'limit'>) => fetchSessions(opts ?? {}))
  );
}
