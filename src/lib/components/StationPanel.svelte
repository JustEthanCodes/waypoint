<script lang="ts">
  import { X, Radio, Clock, ChevronRight, Navigation, LoaderCircle, WifiOff } from '@lucide/svelte';
  import type { Departure, DeparturesResult, StopPoint } from '#lib/types';

  interface StopLike {
    name: string;
    lat: number;
    lon: number;
  }

  let {
    stop,
    onClose
  }: {
    stop: StopLike | StopPoint;
    onClose: () => void;
  } = $props();

  let result = $state<DeparturesResult | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let now = $state(Date.now());

  async function load() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams({
        name: stop.name,
        lat: String(stop.lat),
        lon: String(stop.lon),
        n: '12'
      });
      const res = await fetch(`/api/departures?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      result = (await res.json()) as DeparturesResult;
    } catch (err) {
      error = 'Live departures are temporarily unavailable.';
      console.error('[departures]', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Reload whenever the selected stop changes
    void stop.name; void stop.lat; void stop.lon;
    load();
    const refresh = setInterval(load, 30_000);
    const tick = setInterval(() => (now = Date.now()), 5_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  });

  function countdown(iso: string): string {
    const t = new Date(iso).getTime();
    const mins = Math.round((t - now) / 60000);
    if (mins <= 0) return 'now';
    if (mins === 1) return '1 min';
    return `${mins} min`;
  }

  const MODE_PILL: Record<string, string> = {
    SUBWAY: '#da291c',
    RAIL: '#80276c',
    TRAM: '#00843d',
    BUS: '#2e7de4',
    COACH: '#2e7de4',
    FERRY: '#008eaa',
    CABLE_CAR: '#8e44ad',
    GONDOLA: '#8e44ad',
    FUNICULAR: '#8e44ad'
  };

  function pillColor(dep: Departure): string {
    return MODE_PILL[dep.mode?.toUpperCase() ?? ''] ?? '#4b5563';
  }

  function timeLabel(iso: string, tz?: string): string {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
</script>

<aside class="station-panel" aria-label="Next departures">
  <header class="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        <Navigation size={11} strokeWidth={2.5} aria-hidden="true" />
        Departures
      </div>
      <h2 class="mt-0.5 truncate text-[1.05rem] font-extrabold leading-tight tracking-tight">{stop.name}</h2>
      <p class="mt-1 text-[0.65rem] text-[var(--muted)]">
        {#if result?.source === 'transitous'}
          Live via <a class="underline underline-offset-2 hover:text-[var(--ink)]" href="https://transitous.org" target="_blank" rel="noreferrer">Transitous</a> · refreshes every 30 s
        {:else if result?.source === 'transitland'}
          Live via <a class="underline underline-offset-2 hover:text-[var(--ink)]" href="https://transit.land" target="_blank" rel="noreferrer">Transitland</a> · refreshes every 30 s
        {:else if !loading}
          Live data unavailable here
        {/if}
      </p>
    </div>
    <button class="wp-btn wp-btn--ghost wp-btn--icon" onclick={onClose} aria-label="Close departures panel">
      <X size={17} aria-hidden="true" />
    </button>
  </header>

  <div class="nice-scroll flex-1 overflow-y-auto">
    {#if loading && !result}
      <div class="flex items-center justify-center gap-2 py-10 text-sm text-[var(--muted)]">
        <LoaderCircle size={17} class="animate-spin" aria-hidden="true" /> Loading departures…
      </div>
    {:else if error || result?.source === 'unavailable'}
      <div class="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <WifiOff size={22} class="text-[var(--muted)]" aria-hidden="true" />
        <p class="text-sm font-semibold">No live coverage at this stop yet</p>
        <p class="max-w-[34ch] text-xs leading-relaxed text-[var(--muted)]">
          {result?.error ?? error} Transitous keeps adding feeds daily — major stations usually work.
        </p>
        <button class="wp-btn mt-1" onclick={load}><ChevronRight size={15} aria-hidden="true" /> Retry</button>
      </div>
    {:else if result && result.departures.length === 0}
      <div class="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-[var(--muted)]">
        <Clock size={20} aria-hidden="true" />
        <p class="font-semibold text-[var(--ink)]">Nothing scheduled right now</p>
        <p class="text-xs">Service may have ended for the day (or not started yet).</p>
      </div>
    {:else if result}
      <ul>
        {#each result.departures as dep (dep.arrival + dep.displayName + dep.headsign)}
          <li class="dep-row" data-cancelled={dep.cancelled}>
            <span class="route-pill" style="--pill:{pillColor(dep)}" title={dep.agencyName}>{dep.displayName}</span>
            <span class="min-w-0">
              <span class="dep-dest block truncate text-[0.83rem] font-semibold leading-snug">{dep.headsign || dep.agencyName || '—'}</span>
              <span class="mt-0.5 flex items-center gap-1.5 text-[0.62rem] text-[var(--muted)]">
                <span class="truncate">{dep.agencyName}</span>
                {#if dep.realTime}
                  <span class="inline-flex items-center gap-0.5 font-bold uppercase tracking-wide text-[var(--ok)]"><Radio size={9} strokeWidth={3} aria-hidden="true" />live</span>
                {/if}
                {#if dep.cancelled}
                  <span class="font-bold uppercase tracking-wide text-[#c0392b]">cancelled</span>
                {/if}
              </span>
            </span>
            <span class="text-right">
              <span class="mono block text-[0.95rem] font-semibold leading-none">{countdown(dep.arrival)}</span>
              <span class="mono mt-1 block text-[0.62rem] text-[var(--muted)]">{timeLabel(dep.arrival, result.timezone)}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="border-t border-[var(--line)] px-4 py-2 text-[0.58rem] leading-relaxed text-[var(--muted)]">
    Times are local to the stop. Data: <a class="underline hover:text-[var(--ink)]" href="https://transitous.org/sources/" target="_blank" rel="noreferrer">Transitous sources</a>. Vehicles on the map are scheduled-service estimates, not GPS.
  </footer>
</aside>
