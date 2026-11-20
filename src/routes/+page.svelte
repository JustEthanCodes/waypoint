<script lang="ts">
  import {
    Search,
    X,
    ArrowLeft,
    Info,
    LoaderCircle,
    MapPin,
    Radio,
    ChevronRight,
    ArrowRightLeft,
    Footprints,
    TrainFront,
    TrainFrontTunnel,
    TramFront,
    BusFront,
    Ship
  } from '@lucide/svelte';
  import Globe from '#lib/components/Globe.svelte';
  import TransitMap from '#lib/components/TransitMap.svelte';
  import WorldwideStop from '#lib/components/WorldwideStop.svelte';
  import StationPanel from '#lib/components/StationPanel.svelte';
  import ModePicker, { type ModeFilter } from '#lib/components/ModePicker.svelte';
  import ThemeToggle from '#lib/components/ThemeToggle.svelte';
  import { CITIES, LIVE_CITIES } from '#lib/cities';
  import type { City, GeocodeResult, StopPoint, PlanResult, PlanItinerary, PlanLeg } from '#lib/types';

  type View =
    | { kind: 'globe' }
    | { kind: 'city'; city: City }
    | { kind: 'stop'; stop: GeocodeResult };

  let view = $state<View>({ kind: 'globe' });
  let modeFilter = $state<ModeFilter>('all');
  let selectedStop = $state<StopPoint | null>(null);
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  let globeRef = $state<Globe | undefined>();
  let fromInput = $state<HTMLInputElement | undefined>();
  let toInput = $state<HTMLInputElement | undefined>();
  let searchInput = $state<HTMLInputElement | undefined>();

  // ── Journey planner (A → B) ─────────────────────────────────────────────
  let planFrom = $state('');
  let planTo = $state('');
  let planFromResolved = $state<GeocodeResult | null>(null);
  let planToResolved = $state<GeocodeResult | null>(null);
  let fromResults = $state<GeocodeResult[]>([]);
  let toResults = $state<GeocodeResult[]>([]);
  let fromSearching = $state(false);
  let toSearching = $state(false);
  let planning = $state(false);
  let planResult = $state<PlanResult | null>(null);
  let selectedItinerary = $state(0);
  let planError = $state<string | null>(null);
  let plannerMode = $state<'plan' | 'lookup'>('plan');

  // ── Single-stop lookup (kept as a secondary affordance) ─────────────────
  let lookupQuery = $state('');
  let lookupResults = $state<GeocodeResult[]>([]);
  let lookupSearching = $state(false);

  let fromSeq = 0;
  let toSeq = 0;
  let lookupSeq = 0;

  $effect(() => {
    const q = planFrom.trim();
    if (q.length < 2) { fromResults = []; fromSearching = false; planFromResolved = null; return; }
    fromSearching = true;
    const seq = ++fromSeq;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?text=${encodeURIComponent(q)}`);
        const data = (await res.json()) as GeocodeResult[];
        if (seq === fromSeq) fromResults = data;
      } catch { if (seq === fromSeq) fromResults = []; }
      finally { if (seq === fromSeq) fromSearching = false; }
    }, 240);
    return () => clearTimeout(t);
  });

  $effect(() => {
    const q = planTo.trim();
    if (q.length < 2) { toResults = []; toSearching = false; planToResolved = null; return; }
    toSearching = true;
    const seq = ++toSeq;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?text=${encodeURIComponent(q)}`);
        const data = (await res.json()) as GeocodeResult[];
        if (seq === toSeq) toResults = data;
      } catch { if (seq === toSeq) toResults = []; }
      finally { if (seq === toSeq) toSearching = false; }
    }, 240);
    return () => clearTimeout(t);
  });

  $effect(() => {
    const q = lookupQuery.trim();
    if (q.length < 2) { lookupResults = []; lookupSearching = false; return; }
    lookupSearching = true;
    const seq = ++lookupSeq;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?text=${encodeURIComponent(q)}`);
        const data = (await res.json()) as GeocodeResult[];
        if (seq === lookupSeq) lookupResults = data;
      } catch { if (seq === lookupSeq) lookupResults = []; }
      finally { if (seq === lookupSeq) lookupSearching = false; }
    }, 240);
    return () => clearTimeout(t);
  });

  // Auto-plan when both endpoints are resolved
  $effect(() => {
    if (plannerMode !== 'plan') return;
    if (!planFromResolved || !planToResolved) return;
    planJourney();
  });

  async function planJourney() {
    if (!planFromResolved || !planToResolved) return;
    planning = true;
    planError = null;
    planResult = null;
    selectedItinerary = 0;
    try {
      const params = new URLSearchParams({
        from: `${planFromResolved.lat},${planFromResolved.lon}`,
        to: `${planToResolved.lat},${planToResolved.lon}`,
        time: new Date().toISOString()
      });
      const res = await fetch(`/api/plan?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      planResult = (await res.json()) as PlanResult;
      if (planResult.error) planError = planResult.error;
      else if (!planResult.itineraries.length) planError = 'No transit route found between these points.';
    } catch (err) {
      console.error('[plan]', err);
      planError = 'Journey planning is temporarily unavailable. Try again in a moment.';
    } finally {
      planning = false;
    }
  }

  function resetPlan() {
    planFrom = ''; planTo = ''; planFromResolved = null; planToResolved = null;
    fromResults = []; toResults = []; planResult = null; planError = null; selectedItinerary = 0;
  }

  function pickFrom(r: GeocodeResult) { fromResults = []; planFrom = r.name; planFromResolved = r; }
  function pickTo(r: GeocodeResult) { toResults = []; planTo = r.name; planToResolved = r; }
  function pickLookup(r: GeocodeResult) { lookupResults = []; lookupQuery = ''; view = { kind: 'stop', stop: r }; }

  // Build a GeoJSON FeatureCollection for the selected itinerary's legs
  const routeGeoJSON = $derived.by(() => {
    if (!planResult || !planResult.itineraries.length) return null;
    const it = planResult.itineraries[selectedItinerary];
    if (!it) return null;
    return {
      type: 'FeatureCollection',
      features: it.legs.map((leg: PlanLeg, i: number) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: leg.geometry },
        properties: { mode: leg.mode, color: modeColor(leg.mode), route: leg.routeShortName, index: i }
      }))
    };
  });

  function modeColor(mode: string): string {
    const m = mode.toUpperCase();
    if (m.includes('SUBWAY') || m === 'METRO' || m === 'SUBURBAN') return '#d6492b';
    if (m.includes('RAIL') || m.includes('TRAIN')) return '#2e7de4';
    if (m.includes('TRAM')) return '#25a05c';
    if (m.includes('BUS') || m.includes('COACH')) return '#c9a227';
    if (m.includes('FERRY') || m.includes('SHIP')) return '#17a589';
    if (m.includes('WALK') || m.includes('FOOT')) return '#8a8779';
    if (m.includes('BIKE')) return '#8e44ad';
    return '#6b6a63';
  }

  function formatTime(iso: string): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return iso.slice(11, 16); }
  }

  function modeIcon(mode: string) {
    const m = mode.toUpperCase();
    if (m.includes('SUBWAY') || m === 'METRO' || m === 'SUBURBAN') return TrainFrontTunnel;
    if (m.includes('RAIL') || m.includes('TRAIN')) return TrainFront;
    if (m.includes('TRAM')) return TramFront;
    if (m.includes('BUS') || m.includes('COACH')) return BusFront;
    if (m.includes('FERRY') || m.includes('SHIP')) return Ship;
    return Footprints;
  }

  function showToast(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 4200);
  }

  async function pickCity(city: City) {
    await globeRef?.flyTo(city);
    selectedStop = null;
    modeFilter = 'all';
    view = { kind: 'city', city };
  }

  function backToGlobe() {
    view = { kind: 'globe' };
    selectedStop = null;
    modeFilter = 'all';
  }

  const MODE_LABEL: Record<string, string> = {
    SUBWAY: 'Metro', RAIL: 'Rail', TRAM: 'Tram', BUS: 'Bus', COACH: 'Coach',
    FERRY: 'Ferry', GONDOLA: 'Cable', FUNICULAR: 'Funicular', CABLE_CAR: 'Cable'
  };

  // Keyboard shortcuts
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (e.key === '/' && !typing && view.kind === 'globe') {
        e.preventDefault();
        fromInput?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (typing) { (target as HTMLElement).blur(); return; }
        if (selectedStop) selectedStop = null;
        else if (view.kind === 'stop') backToGlobe();
        else if (view.kind === 'city') backToGlobe();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if view.kind === 'globe'}
  <main class="globe-layout">
    <aside class="globe-side">
      <div class="globe-side-inner nice-scroll">
        <div class="flex items-center justify-between pt-1">
          <a href="/" class="flex select-none items-center gap-2.5 no-underline" aria-label="Waypoint — home">
            <svg width="38" height="38" viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" rx="15" fill="var(--accent)"/>
              <path d="M12 42 C 22 42, 22 22, 33 22 S 45 36, 53 36" fill="none" stroke="#fdfcf8" stroke-width="5.2" stroke-linecap="round"/>
              <circle cx="12" cy="42" r="4.6" fill="#fdfcf8"/>
              <circle cx="53" cy="36" r="4.6" fill="#fdfcf8" fill-opacity="0.35" stroke="#fdfcf8" stroke-width="2"/>
            </svg>
            <span>
              <span class="block text-[1.45rem] font-extrabold leading-none tracking-tight">Waypoint</span>
              <span class="mt-1 block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Every transit system on Earth</span>
            </span>
          </a>
          <div class="flex items-center gap-1.5">
            <ThemeToggle />
            <a class="wp-btn wp-btn--icon" href="/about" aria-label="About, data credits and license">
              <Info size={18} aria-hidden="true" />
            </a>
          </div>
        </div>

        <!-- Journey planner (A → B) -->
        <div class="wp-panel p-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
              <ArrowRightLeft size={11} strokeWidth={2.5} aria-hidden="true" /> Plan a journey
            </div>
            <button class="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--ink)]" onclick={() => (plannerMode = plannerMode === 'plan' ? 'lookup' : 'plan')}>
              {plannerMode === 'plan' ? 'Look up a stop →' : '← Plan a journey'}
            </button>
          </div>

          {#if plannerMode === 'plan'}
            <div class="mt-2 flex flex-col gap-2">
              <div class="relative">
                <input class="wp-input" type="text" placeholder="From — stop or place" bind:value={planFrom} bind:this={fromInput} autocomplete="off" spellcheck="false" />
                {#if fromSearching || fromResults.length > 0}
                  <div class="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow)]">
                    {#if fromSearching && fromResults.length === 0}
                      <div class="flex items-center gap-2 px-4 py-3 text-xs text-[var(--muted)]"><LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Searching…</div>
                    {:else}
                      {#each fromResults as r (r.id)}
                        <button class="flex w-full items-center gap-3 border-b border-[var(--line)] px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]" onclick={() => pickFrom(r)}>
                          <MapPin size={15} class="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[0.83rem] font-semibold leading-snug">{r.name}</span>
                            <span class="block truncate text-[0.62rem] text-[var(--muted)]">{r.areaPath}</span>
                          </span>
                        </button>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="relative">
                <input class="wp-input" type="text" placeholder="To — stop or place" bind:value={planTo} bind:this={toInput} autocomplete="off" spellcheck="false" />
                {#if toSearching || toResults.length > 0}
                  <div class="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow)]">
                    {#if toSearching && toResults.length === 0}
                      <div class="flex items-center gap-2 px-4 py-3 text-xs text-[var(--muted)]"><LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Searching…</div>
                    {:else}
                      {#each toResults as r (r.id)}
                        <button class="flex w-full items-center gap-3 border-b border-[var(--line)] px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]" onclick={() => pickTo(r)}>
                          <MapPin size={15} class="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[0.83rem] font-semibold leading-snug">{r.name}</span>
                            <span class="block truncate text-[0.62rem] text-[var(--muted)]">{r.areaPath}</span>
                          </span>
                        </button>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
              <button class="wp-btn wp-btn--primary" disabled={!planFromResolved || !planToResolved || planning} onclick={planJourney}>
                {#if planning}<LoaderCircle size={15} class="animate-spin" aria-hidden="true" /> Planning…{:else}<ArrowRightLeft size={15} aria-hidden="true" /> Plan journey{/if}
              </button>
              {#if planError}<p class="text-xs font-semibold text-[var(--warn)]">{planError}</p>{/if}
            </div>

            {#if planResult && planResult.itineraries.length > 0}
              <div class="mt-3 flex flex-col gap-2">
                <p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {planResult.itineraries.length} routes · {planResult.from?.name} → {planResult.to?.name}
                </p>
                <div class="nice-scroll flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
                  {#each planResult.itineraries as it, i (i)}
                    <button
                      class="wp-panel w-full p-2.5 text-left transition-colors"
                      style="border-color: {selectedItinerary === i ? 'var(--accent)' : 'var(--line)'}; background: {selectedItinerary === i ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-panel))' : 'var(--bg-panel)'};"
                      onclick={() => (selectedItinerary = i)}
                    >
                      <div class="flex items-baseline justify-between gap-2">
                        <span class="text-[0.85rem] font-extrabold tracking-tight">{it.durationMinutes} min</span>
                        <span class="text-[0.62rem] font-semibold text-[var(--muted)]">
                          {it.transfers} transfer{it.transfers === 1 ? '' : 's'} · dep {formatTime(it.startTime)}
                        </span>
                      </div>
                      <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {#each it.legs as leg (leg.startTime + leg.mode)}
                          {#if leg.mode !== 'WALK' && leg.mode !== 'FOOT'}
                            <span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white" style="background: {modeColor(leg.mode)};">
                              {#if leg.routeShortName}<span class="font-mono">{leg.routeShortName}</span>{/if}
                            </span>
                          {/if}
                        {/each}
                      </div>
                    </button>
                  {/each}
                </div>

                {#if planResult.itineraries[selectedItinerary]}
                  {@const it = planResult.itineraries[selectedItinerary]!}
                  <details class="mt-1 text-[0.68rem] text-[var(--muted)]">
                    <summary class="cursor-pointer font-semibold text-[var(--ink)]">Step-by-step</summary>
                    <ol class="mt-2 flex flex-col gap-1.5">
                      {#each it.legs as leg (leg.startTime + leg.mode)}
                        {@const Icon = modeIcon(leg.mode)}
                        <li class="flex items-start gap-2">
                          <span class="mt-0.5 inline-grid h-5 w-5 shrink-0 place-items-center rounded-md text-white" style="background: {modeColor(leg.mode)};">
                            <Icon size={11} aria-hidden="true" />
                          </span>
                          <span class="min-w-0">
                            <span class="block font-semibold text-[var(--ink)]">
                              {leg.mode === 'WALK' || leg.mode === 'FOOT' ? 'Walk' : leg.routeShortName || leg.mode}
                              {#if leg.routeLongName && leg.routeShortName !== leg.routeLongName}<span class="font-normal text-[var(--muted)]"> · {leg.routeLongName}</span>{/if}
                            </span>
                            <span class="block text-[0.62rem] text-[var(--muted)]">
                              {leg.from.name} → {leg.to.name} · {formatTime(leg.startTime)}–{formatTime(leg.endTime)}
                              {#if leg.realTime}<span class="font-bold text-[var(--ok)]"> · live</span>{/if}
                            </span>
                          </span>
                        </li>
                      {/each}
                    </ol>
                  </details>
                {/if}
              </div>
            {/if}
          {:else}
            <!-- Single-stop lookup -->
            <div class="mt-2 relative">
              <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
              <input class="wp-input" type="text" placeholder="Search any stop on Earth…" bind:value={lookupQuery} bind:this={searchInput} autocomplete="off" spellcheck="false" />
              {#if lookupSearching || lookupResults.length > 0}
                <div class="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow)]">
                  {#if lookupSearching && lookupResults.length === 0}
                    <div class="flex items-center gap-2 px-4 py-3 text-xs text-[var(--muted)]"><LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Searching…</div>
                  {:else}
                    {#each lookupResults as r (r.id)}
                      <button class="flex w-full items-center gap-3 border-b border-[var(--line)] px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]" onclick={() => pickLookup(r)}>
                        <MapPin size={15} class="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-[0.83rem] font-semibold leading-snug">{r.name}</span>
                          <span class="block truncate text-[0.62rem] text-[var(--muted)]">{r.areaPath}</span>
                        </span>
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Live maps -->
        <section>
          <h2 class="mb-1.5 flex items-center gap-2 px-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            <Radio size={11} strokeWidth={3} aria-hidden="true" /> Live maps
          </h2>
          <div class="flex flex-col gap-1">
            {#each LIVE_CITIES as city (city.id)}
              <button class="city-row" onclick={() => pickCity(city)}>
                <span class="city-pin-dot" style="--pin: var(--accent)"></span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="text-[0.9rem] font-bold tracking-tight">{city.name}</span>
                    <span class="text-[0.6rem] font-semibold text-[var(--muted)]">{city.country}</span>
                  </span>
                  <span class="mt-0.5 block truncate text-[0.64rem] text-[var(--muted)]">{city.modes}</span>
                </span>
                <ChevronRight size={16} class="shrink-0 text-[var(--muted)]" aria-hidden="true" />
              </button>
            {/each}
          </div>
        </section>

        <!-- Pipeline -->
        <section class="pb-2">
          <h2 class="mb-1.5 px-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">In the pipeline <span class="font-medium normal-case tracking-normal text-[color-mix(in_srgb,var(--muted)_80%,transparent)]">— nightly ETL</span></h2>
          <div class="flex flex-wrap gap-1.5 px-1">
            {#each CITIES.filter((c) => c.status === 'planned') as city (city.id)}
              <button
                class="rounded-lg border border-dashed border-[var(--line)] px-2.5 py-1.5 text-left text-[0.68rem] font-semibold text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
                title="{city.name} — map data is being added to the nightly ETL. Search any stop there worldwide today."
                onclick={() => showToast(`${city.name} joins the map once its GTFS feed passes validation — search any stop there on the globe today.`)}
              >
                {city.name}
              </button>
            {/each}
          </div>
        </section>
      </div>

      <footer class="border-t border-[var(--line)] px-5 py-2.5 text-[0.58rem] leading-relaxed text-[var(--muted)]">
        Open source (MIT) · Transitous + OpenStreetMap + CARTO · <a class="underline hover:text-[var(--ink)]" href="/about">Sources & licenses →</a>
      </footer>
    </aside>

    <div class="globe-stage">
      <Globe bind:this={globeRef} onPickCity={pickCity} onPlannedCity={(c) => showToast(`${c.name} — map data in the nightly ETL queue. Stop search works there worldwide today.`)} route={routeGeoJSON} />
      <div class="overlay overlay-bottom-right glass pointer-events-none select-none px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        Drag to spin · Scroll to zoom
      </div>
    </div>
  </main>

{:else if view.kind === 'city'}
  <main class="map-shell">
    <TransitMap city={view.city} {modeFilter} {selectedStop} onSelectStop={(s) => (selectedStop = s)} />
    <div class="overlay overlay-top-left">
      <button class="wp-btn glass" style="border: 0" onclick={backToGlobe} aria-label="Back to the globe">
        <ArrowLeft size={17} aria-hidden="true" />
        <span class="text-[0.8rem]">Globe</span>
      </button>
      <div class="glass max-w-[calc(100vw-6.5rem)] px-3 py-2 sm:max-w-[220px]">
        <p class="truncate text-[0.85rem] font-extrabold leading-none tracking-tight sm:text-[0.92rem]">{view.city.name}</p>
        <p class="mt-1 hidden items-center gap-1.5 text-[0.56rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)] sm:flex">
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ok)]"></span> Live map · {view.city.country}
        </p>
      </div>
    </div>
    <div class="overlay overlay-top-center">
      <ModePicker bind:value={modeFilter} />
    </div>
    <div class="overlay overlay-top-right">
      <ThemeToggle />
      <a class="wp-btn wp-btn--icon" href="/about" aria-label="Data credits and license"><Info size={17} aria-hidden="true" /></a>
    </div>
    {#if selectedStop}
      <StationPanel stop={selectedStop} onClose={() => (selectedStop = null)} />
    {/if}
  </main>

{:else}
  <main class="map-shell">
    <WorldwideStop stop={view.stop} />
    <div class="overlay overlay-top-left">
      <button class="wp-btn glass" style="border: 0" onclick={backToGlobe} aria-label="Back to the globe">
        <ArrowLeft size={17} aria-hidden="true" />
        <span class="text-[0.8rem]">Globe</span>
      </button>
      <div class="glass px-3.5 py-2">
        <p class="max-w-[26ch] truncate text-[0.92rem] font-extrabold leading-none tracking-tight">{view.stop.name}</p>
        <p class="mt-1 text-[0.56rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{view.stop.areaPath || view.stop.country || 'Worldwide'}</p>
      </div>
    </div>
    <div class="overlay overlay-top-right">
      <ThemeToggle />
      <a class="wp-btn wp-btn--icon" href="/about" aria-label="Data credits and license"><Info size={17} aria-hidden="true" /></a>
    </div>
    <div class="overlay overlay-bottom-left glass px-3 py-2 text-[0.62rem] text-[var(--muted)]">
      Stop geometry isn't bundled for this region yet — departures are live, the network map is coming.<br />
      <a class="underline hover:text-[var(--ink)]" href="/about">How Waypoint's data works →</a>
    </div>
    <StationPanel stop={view.stop} onClose={backToGlobe} />
  </main>
{/if}

{#if toast}
  <div class="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
    <p class="glass max-w-[92vw] px-4 py-2.5 text-center text-[0.78rem] font-medium leading-snug">{toast}</p>
  </div>
{/if}
