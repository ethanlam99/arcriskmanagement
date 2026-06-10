// INTEGRATION STUB — Phase 2 will replace with SQL Server sync (live risk engine). Do not call external services here.
//
// Phase 2 notes:
//   - listModules() will pull from a scheduled mirror or on-demand sync endpoint.
//   - getCurrentSql() will fetch the live procedure/function body from SQL Server.
//   - Consider a webhook on engine commits to invalidate the local mirror.

import type { EngineModule } from '@/types';

let _repo: import('@/data/repository').Repository | null = null;

export function initEngineCodeSource(repo: import('@/data/repository').Repository) {
  _repo = repo;
}

function assertRepo() {
  if (!_repo) throw new Error('engineCodeSource not initialised — call initEngineCodeSource(repo) first');
  return _repo;
}

export async function listModules(): Promise<EngineModule[]> {
  return assertRepo().engineModules.list();
}

export async function getModule(id: string): Promise<EngineModule | null> {
  return assertRepo().engineModules.get(id);
}

export async function getCurrentSql(moduleId: string): Promise<string> {
  const mod = await assertRepo().engineModules.get(moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);
  return mod.current_sql_code;
}

// v0.4.3: the Node.js representation analysts read/author. Phase 2 syncs this
// alongside the compiled SQL from the live engine.
export async function getCurrentNode(moduleId: string): Promise<string> {
  const mod = await assertRepo().engineModules.get(moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);
  return mod.current_node_code;
}
