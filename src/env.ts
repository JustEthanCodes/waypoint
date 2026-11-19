/**
 * Explicit environment variable definitions for Waypoint.
 * See https://svelte.dev/docs/kit/environment-variables
 */
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  PUBLIC_CONTACT_URL: {
    public: true,
    description:
      'Public URL for the Waypoint project — shown on the site and sent upstream to Transitous. Required by their usage policy.',
    schema: (v) => v?.trim() || 'https://github.com/waypoint-app/waypoint'
  },
  TRANSITLAND_API_KEY: {
    description:
      'Optional fallback for departures when Transitous is unreachable. Free Interline account. Server-side only, never shipped to the client.',
    schema: (v) => v
  },
  MOBILITY_DATABASE_REFRESH_TOKEN: {
    description:
      'Optional. Used by the nightly ETL to query the Mobility Database catalog. CI only, never shipped to the client.',
    schema: (v) => v
  }
});
