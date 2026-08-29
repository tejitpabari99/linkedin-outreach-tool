import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

export function GET() {
  const cfg = config.loadConfig();
  const bundle = { config: cfg, weeks: {} };
  for (const weekKey of weeks.listWeekKeys()) {
    bundle.weeks[weekKey] = weeks.readWeek(weekKey, cfg);
  }
  const today = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="linkedin-outreach-export-${today}.json"`
    }
  });
}
