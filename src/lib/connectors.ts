// Dev-tool connectors (BYOK, like the chat keys).
// Credentials live only in this browser (localStorage, memory fallback).
// The agent learns what's connected through connectorsPromptBlock() —
// execution always stays user-confirmed (Deploy / Push dialogs, upload button).
import { getVercelToken, setVercelToken, clearVercelToken } from '../adapters/providers';

export type ConnectorId = 'vercel' | 'github' | 'cloudinary' | 'supabase' | 'pexels';

export interface ConnectorDef {
  id: ConnectorId;
  label: string;
  help: string;
}

export const CONNECTOR_DEFS: ConnectorDef[] = [
  { id: 'vercel', label: 'Vercel', help: 'Deploy this project to your Vercel account.' },
  { id: 'github', label: 'GitHub', help: 'Push code straight from Zut.' },
  { id: 'cloudinary', label: 'Cloudinary', help: 'Host images (unsigned upload preset).' },
  { id: 'supabase', label: 'Supabase', help: 'Link a project so the agent can propose SQL for it.' },
  { id: 'pexels', label: 'Pexels', help: 'Stock photos for landing pages.' },
];

import { K, readKey, writeKey, removeKey } from './storage-keys';

const CONNECTOR_KEY: Record<Exclude<ConnectorId, 'vercel'>, string> = {
  github: K.connectorGithub,
  cloudinary: K.connectorCloudinary,
  supabase: K.connectorSupabase,
  pexels: K.connectorPexels,
};

export function getConnectorKey(id: ConnectorId): string | null {
  if (id === 'vercel') return getVercelToken();
  return readKey(CONNECTOR_KEY[id]);
}

export function setConnectorKey(id: ConnectorId, value: string): void {
  if (id === 'vercel') {
    setVercelToken(value);
    return;
  }
  writeKey(CONNECTOR_KEY[id], value);
}

export function clearConnectorKey(id: ConnectorId): void {
  if (id === 'vercel') {
    clearVercelToken();
    return;
  }
  removeKey(CONNECTOR_KEY[id]);
}

export function isConnectorSet(id: ConnectorId): boolean {
  return getConnectorKey(id) !== null;
}

export interface CloudinaryConfig {
  cloudName: string;
  preset: string;
}

export function getCloudinaryConfig(): CloudinaryConfig | null {
  const raw = readKey(K.connectorCloudinary);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<CloudinaryConfig>;
    if (j.cloudName && j.preset) return { cloudName: j.cloudName, preset: j.preset };
    return null;
  } catch {
    return null;
  }
}

export function setCloudinaryConfig(cloudName: string, preset: string): void {
  writeKey(K.connectorCloudinary, JSON.stringify({ cloudName, preset }));
}

export interface SupabaseLink {
  url: string;
  anon: string;
}

export function getSupabaseLink(): SupabaseLink | null {
  const raw = readKey(K.connectorSupabase);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<SupabaseLink>;
    if (j.url && j.anon) return { url: j.url, anon: j.anon };
    return null;
  } catch {
    return null;
  }
}

export function setSupabaseLink(url: string, anon: string): void {
  writeKey(K.connectorSupabase, JSON.stringify({ url, anon }));
}

export function clearSupabaseLink(): void {
  removeKey(K.connectorSupabase);
}

/** One line per connected tool, for the agent system prompt. Empty when none. */
export function connectorsPromptBlock(): string {
  const lines: string[] = [];
  if (getVercelToken()) lines.push('- Vercel: connected — offer to deploy when the user wants it live (they confirm in the Deploy dialog).');
  if (readKey(K.connectorGithub)) lines.push('- GitHub: connected — offer to push (they confirm repo + visibility in the GitHub dialog).');
  const cl = getCloudinaryConfig();
  if (cl) {
    lines.push(
      `- Cloudinary: connected (cloud "${cl.cloudName}") — reference hosted images directly with https://res.cloudinary.com/${cl.cloudName}/image/upload/... URLs in <img> tags; the user uploads via the explorer button.`,
    );
  }
  const sb = getSupabaseLink();
  if (sb) {
    lines.push(
      `- Supabase: linked project ${sb.url} — propose SQL/RLS/table designs for it; the user runs them in their own dashboard. Never invent credentials.`,
    );
  }
  if (readKey(K.connectorPexels)) lines.push('- Pexels: API key saved — suggest exact search terms for stock photos; the user fetches them.');
  if (lines.length === 0) return '';
  return ['Connected dev tools (prefer them when relevant; never invent access):', ...lines].join('\n');
}

/** Unsigned image upload (needs an unsigned preset on the Cloudinary side). */
export async function uploadToCloudinary(file: Blob, filename?: string): Promise<{ url: string }> {
  const cfg = getCloudinaryConfig();
  if (!cfg) throw new Error('Connect Cloudinary first (account settings).');
  const form = new FormData();
  form.append('file', file, filename ?? 'upload');
  form.append('upload_preset', cfg.preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = (await res.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(data?.error?.message ?? `Upload failed (${res.status})`);
  if (!data?.secure_url) throw new Error('Upload did not return a URL.');
  return { url: data.secure_url };
}

export interface PexelsPhoto {
  id: number;
  alt: string;
  thumb: string;
  url: string;
  photographer: string;
}

/** Stock photo search (key from the connectors section). */
export async function searchPexels(query: string, perPage = 6): Promise<PexelsPhoto[]> {
  const key = readKey(K.connectorPexels);
  if (!key) throw new Error('Add a Pexels API key first (account settings).');
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(12, Math.max(1, perPage))}`,
    { headers: { Authorization: key } },
  );
  const data = (await res.json().catch(() => null)) as {
    photos?: Array<{ id: number; alt?: string; src?: { medium?: string; large?: string }; url?: string; photographer?: string }>;
    error?: string;
  } | null;
  if (!res.ok) throw new Error(data?.error ?? `Search failed (${res.status})`);
  return (data?.photos ?? []).map((p) => ({
    id: p.id,
    alt: p.alt ?? '',
    thumb: p.src?.medium ?? '',
    url: p.src?.large ?? p.url ?? '',
    photographer: p.photographer ?? '',
  }));
}
