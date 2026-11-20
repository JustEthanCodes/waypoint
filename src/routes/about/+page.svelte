<script lang="ts">
  import { ArrowLeft, ExternalLink, Heart, Scale, Database, CodeXml } from '@lucide/svelte';
</script>

<svelte:head>
  <title>Waypoint — About, data credits & license</title>
  <meta name="description" content="Where Waypoint's data comes from: Transitous, Mobility Database, per-feed licenses, OpenStreetMap and CARTO. How to contribute." />
</svelte:head>

<main class="nice-scroll min-h-dvh overflow-y-auto bg-[var(--bg)] text-[var(--ink)]">
  <div class="mx-auto max-w-3xl px-6 py-8">
    <a class="wp-btn wp-btn--ghost mb-6 -ml-2" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to the map</a>

    <h1 class="text-3xl font-extrabold tracking-tight">About Waypoint</h1>
    <p class="mt-2 text-[0.95rem] leading-relaxed text-[var(--muted)]">
      Waypoint draws every public transport system on Earth — metro, rail, tram, bus, ferry — as a single,
      minimalist, Mini Metro-style map. It's free, open source, and built entirely on openly available data.
    </p>

    <section class="mt-8">
      <h2 class="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]"><Database size={12} aria-hidden="true" /> Live departures</h2>
      <div class="wp-panel mt-2 p-5 text-sm leading-relaxed">
        <p><strong>Primary: <a class="underline" href="https://transitous.org" target="_blank" rel="noreferrer">Transitous</a>.</strong> A community-run, provider-neutral routing service built on the MOTIS 2 engine. No API key; queried respectfully (server-side cache, backoff) and attributed here as required by their usage policy:</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-[0.85rem] text-[var(--muted)]">
          <li><a class="underline hover:text-[var(--ink)]" href="https://transitous.org/sources/" target="_blank" rel="noreferrer">Transitous source list & licenses →</a></li>
          <li><a class="underline hover:text-[var(--ink)]" href="https://transitous.org/" target="_blank" rel="noreferrer">transitous.org</a> — consider <a class="underline hover:text-[var(--ink)]" href="https://transitous.org/donate/" target="_blank" rel="noreferrer">donating</a> to the project that makes this possible</li>
          <li>OpenStreetMap data is used (routing, tiles) and must be attributed: © OpenStreetMap contributors</li>
          <li>Vehicle motion on city maps is an <strong>estimate interpolated from scheduled service</strong> — not GPS. Realtime delays/cancellations do come from Transitous where agencies publish GTFS-Realtime</li>
        </ul>
        <p class="mt-3"><strong>Fallback: <a class="underline" href="https://transit.land" target="_blank" rel="noreferrer">Transitland</a>.</strong> Used only when Transitous is unreachable, if an API key is configured. Attribution: <a class="underline" href="https://transit.land/terms" target="_blank" rel="noreferrer">transit.land/terms</a>.</p>
      </div>
    </section>

    <section class="mt-6">
      <h2 class="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]"><Database size={12} aria-hidden="true" /> Map geometry & timetables</h2>
      <div class="wp-panel mt-2 p-5 text-sm leading-relaxed">
        <p>A nightly job downloads GTFS feeds, validates them (broken feeds never overwrite the last good map), simplifies route shapes (Douglas–Peucker) and emits the compact JSON bundles you see. Feed discovery is catalogued via the <a class="underline" href="https://mobilitydatabase.org" target="_blank" rel="noreferrer">Mobility Database</a> (6,000+ feeds, checked daily), which also supplies per-feed license metadata.</p>
        <table class="mt-3 w-full text-left text-[0.8rem]">
          <thead class="text-[var(--muted)]"><tr><th class="pb-1.5">City</th><th class="pb-1.5">Source</th><th class="pb-1.5">License</th></tr></thead>
          <tbody>
            <tr class="border-t border-[var(--line)]"><td class="py-1.5">New York City</td><td><a class="underline" href="https://new.mta.info/developers/agency/new-york-city-transit" target="_blank" rel="noreferrer">MTA Subway GTFS</a></td><td>MTA Open Data</td></tr>
            <tr class="border-t border-[var(--line)]"><td class="py-1.5">Boston</td><td><a class="underline" href="https://www.mbta.com/developers" target="_blank" rel="noreferrer">MBTA GTFS</a></td><td>MBTA Open Data</td></tr>
            <tr class="border-t border-[var(--line)]"><td class="py-1.5">Berlin</td><td><a class="underline" href="https://www.vbb.de/gtfs" target="_blank" rel="noreferrer">VBB GTFS (regional, region-filtered)</a></td><td>VBB open data (see source)</td></tr>
            <tr class="border-t border-[var(--line)]"><td class="py-1.5">Oslo</td><td><a class="underline" href="https://developer.entur.no/open-data/timetable" target="_blank" rel="noreferrer">Entur national GTFS (region-filtered)</a></td><td>NLOD</td></tr>
            <tr class="border-t border-[var(--line)]"><td class="py-1.5">Stockholm</td><td><a class="underline" href="https://eu.data.public-transport.earth/" target="_blank" rel="noreferrer">Trafiklab national GTFS (mirror, region-filtered)</a></td><td>CC0 1.0</td></tr>
            <tr class="border-t border-[var(--line)]"><td class="py-1.5">Copenhagen</td><td><a class="underline" href="https://eu.data.public-transport.earth/" target="_blank" rel="noreferrer">Rejseplanen / DOT national GTFS (mirror, region-filtered)</a></td><td>See source</td></tr>
          </tbody>
        </table>
        <p class="mt-2 text-[0.75rem] text-[var(--muted)]">More cities join as their feeds pass validation — see the globe for the live roster. Feed data remains the property of its publishers.</p>
      </div>
    </section>

    <section class="mt-6">
      <h2 class="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]"><Scale size={12} aria-hidden="true" /> License & code</h2>
      <div class="wp-panel mt-2 p-5 text-sm leading-relaxed">
        <p>Waypoint's code is <strong>MIT licensed</strong>. Map artwork is a minimalist interpretation — it is not an official depiction by any agency. Basemap tiles © CARTO, © OpenStreetMap contributors. Type: Archivo & IBM Plex Mono (Google Fonts, OFL).</p>
        <a class="wp-btn mt-3" href="https://github.com/waypoint-app/waypoint" target="_blank" rel="noreferrer"><CodeXml size={16} aria-hidden="true" /> Source on GitHub <ExternalLink size={12} aria-hidden="true" /></a>
      </div>
    </section>

    <p class="mt-8 flex items-center justify-center gap-1.5 text-[0.7rem] text-[var(--muted)]">
      Made with <Heart size={11} aria-hidden="true" /> for cities and the people who move through them.
    </p>
  </div>
</main>
