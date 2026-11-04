// 기기에 저장한 아이디어 (아키텍처 결정: 기기 저장은 SQLite). 서버에는 올리지 않는다.
import * as SQLite from 'expo-sqlite';
import type { Idea, Recipe } from '../../../shared/api';
import type { SavedIdea } from './storage';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync('idea-helper.db');
      await d.execAsync(
        'CREATE TABLE IF NOT EXISTS saved_ideas (idea_id INTEGER PRIMARY KEY NOT NULL, idea TEXT NOT NULL, recipe TEXT, saved_at TEXT NOT NULL);',
      );
      return d;
    })();
  }
  return dbPromise;
}

export async function saveIdea(idea: Idea, recipe: Recipe | null): Promise<'saved' | 'updated'> {
  const d = await db();
  const prev = await d.getFirstAsync<{ recipe: string | null }>('SELECT recipe FROM saved_ideas WHERE idea_id = ?', [idea.id]);
  const recipeJson = recipe ? JSON.stringify(recipe) : prev?.recipe ?? null;
  await d.runAsync(
    'INSERT OR REPLACE INTO saved_ideas (idea_id, idea, recipe, saved_at) VALUES (?, ?, ?, ?)',
    [idea.id, JSON.stringify(idea), recipeJson, new Date().toISOString()],
  );
  return prev ? 'updated' : 'saved';
}

export async function deleteSaved(ideaId: number): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM saved_ideas WHERE idea_id = ?', [ideaId]);
}

export async function listSaved(): Promise<SavedIdea[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ idea: string; recipe: string | null; saved_at: string }>(
    'SELECT idea, recipe, saved_at FROM saved_ideas ORDER BY saved_at DESC',
  );
  return rows.map((r) => ({ idea: JSON.parse(r.idea), recipe: r.recipe ? JSON.parse(r.recipe) : null, savedAt: r.saved_at }));
}
