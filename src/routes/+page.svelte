<script lang="ts">
  import {
    Search,
    X,
    ArrowLeft,
    Info,
    LoaderCircle,
    MapPin,
    Radio,
    ChevronRight
  } from '@lucide/svelte';
  import Globe from '#lib/components/Globe.svelte';
  import TransitMap from '#lib/components/TransitMap.svelte';
  import WorldwideStop from '#lib/components/WorldwideStop.svelte';
  import StationPanel from '#lib/components/StationPanel.svelte';
  import ModePicker, { type ModeFilter } from '#lib/components/ModePicker.svelte';
  import ThemeToggle from '#lib/components/ThemeToggle.svelte';
  import { CITIES, LIVE_CITIES } from '#lib/cities';
  import type { City, GeocodeResult, StopPoint } from '#lib/types';

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
  let searchInput = $state<HTMLInputElement | undefined>();

  // Keyboard shortcuts: "/" focuses worldwide search, Escape backs out
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (e.key === '/' && !typing && view.kind === 'globe') {
        e.preventDefault();
        searchInput?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (typing) {
          (target as HTMLElement).blur();
          return;
        }
        if (selectedStop) selectedStop = null;
        else if (view.kind === 'stop') backToGlobe();
        else if (view.kind === 'city') backToGlobe();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Worldwide stop search (Transitous) ───────────────────────────────
  let query = $state('');
  let results = $state<GeocodeResult[]>([]);
  let searching = $state(false);
  let searchSeq = 0;

  $effect(() => {
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      searching = false;
      return;
    }
    searching = true;
    const seq = ++searchSeq;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?text=${encodeURIComponent(q)}`);
        const data = (await res.json()) as GeocodeResult[];
        if (seq === searchSeq) results = data;
      } catch {
        if (seq === searchSeq) results = [];
      } finally {
        if (seq === searchSeq) searching = false;
      }
    }, 240);
    return () => clearTimeout(t);
  });

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

  function pickResult(r: GeocodeResult) {
    results = [];
    query = '';
    view = { kind: 'stop', stop: r };
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
</script>

{#if view.kind === 'globe'}
  <!-- ════════════════════════ GLOBE (arrival) ════════════════════════ -->
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

        <!-- Worldwide search -->
        <div class="relative">
          <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
          <input
            class="wp-input"
            type="text"
            placeholder="Search any stop on Earth — try “T-Centralen”…"
            bind:value={query}
            bind:this={searchInput}
            aria-label="Search any transit stop worldwide"
            autocomplete="off"
            spellcheck="false"
          />
          {#if query.trim().length >= 2}
            <button class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)] hover:text-[var(--ink)]" onclick={() => (query = '')} aria-label="Clear search">
              <X size={15} aria-hidden="true" />
            </button>
          {/if}

          {#if searching || results.length > 0}
            <div class="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow)]">
              {#if searching && results.length === 0}
                <div class="flex items-center gap-2 px-4 py-3 text-xs text-[var(--muted)]"><LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Searching worldwide…</div>
              {:else}
                {#each results as r (r.id)}
                  <button class="flex w-full items-center gap-3 border-b border-[var(--line)] px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]" onclick={() => pickResult(r)}>
                    <MapPin size={15} class="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[0.83rem] font-semibold leading-snug">{r.name}</span>
                      <span class="block truncate text-[0.62rem] text-[var(--muted)]">{r.areaPath}</span>
                    </span>
                    <span class="flex shrink-0 gap-1">
                      {#each r.modes.slice(0, 2) as m (m)}
                        <span class="rounded-md bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-[var(--muted)]">{MODE_LABEL[m] ?? m}</span>
                      {/each}
                    </span>
                  </button>
                {/each}
                <p class="px-3.5 py-1.5 text-right text-[0.55rem] text-[var(--muted)]">Live stop search via Transitous</p>
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
      <Globe bind:this={globeRef} onPickCity={pickCity} onPlannedCity={(c) => showToast(`${c.name} — map data in the nightly ETL queue. Stop search works there worldwide today.`)} />
      <div class="overlay overlay-bottom-right glass pointer-events-none select-none px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        Drag to spin · Scroll to zoom
      </div>
    </div>
  </main>

{:else if view.kind === 'city'}
  <!-- ════════════════════════ CITY (flat Mini Metro) ════════════════════════ -->
  <main class="map-shell">
    <TransitMap city={view.city} {modeFilter} {selectedStop} onSelectStop={(s) => (selectedStop = s)} />

    <div class="overlay overlay-top-left">
      <button class="wp-btn glass" style="border: 0" onclick={backToGlobe} aria-label="Back to the globe">
        <ArrowLeft size={17} aria-hidden="true" />
        <span class="text-[0.8rem]">Globe</span>
      </button>
      <div class="glass px-3.5 py-2">
        <p class="text-[0.92rem] font-extrabold leading-none tracking-tight">{view.city.name}</p>
        <p class="mt-1 flex items-center gap-1.5 text-[0.56rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
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
  <!-- ════════════════════════ WORLDWIDE STOP (Transitous) ════════════════════════ -->
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
