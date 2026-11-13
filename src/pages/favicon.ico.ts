import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env';
import { faviconResponse } from '../lib/favicon';

export const prerender = false;

// Przeglądarki i czytniki (np. feed opinii Google) pytają o /favicon.ico - oddajemy jasną wersję z panelu
export const GET: APIRoute = async ({ locals }) => faviconResponse(await getEnv(locals), 'light');
