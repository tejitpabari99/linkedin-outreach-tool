import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';

export function GET() {
  try {
    const cfg = config.loadConfig();
    return json(cfg);
  } catch (e) {
    if (e instanceof config.ConfigError) return json({ error: e.message }, { status: 500 });
    throw e;
  }
}

export async function PUT({ request }) {
  const body = await request.json();
  let validated;
  try {
    validated = config.validateConfig(body);
  } catch (e) {
    if (e instanceof config.ConfigError) {
      return json({ error: e.message, details: [{ field: e.field, message: e.message }] }, { status: 400 });
    }
    throw e;
  }
  config.writeConfig(validated);
  return json({ ok: true });
}
