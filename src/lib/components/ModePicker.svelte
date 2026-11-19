<script lang="ts">
  import { TrainFront, TrainFrontTunnel, TramFront, BusFront, Ship, Waypoints } from '@lucide/svelte';
  import type { ModeGroup } from '#lib/types';

  export type ModeFilter = ModeGroup | 'all';

  let {
    value = $bindable<ModeFilter>('all')
  }: {
    value?: ModeFilter;
  } = $props();

  const MODES: { id: ModeFilter; label: string; icon: any }[] = [
    { id: 'all', label: 'All', icon: Waypoints },
    { id: 'metro', label: 'Metro', icon: TrainFrontTunnel },
    { id: 'rail', label: 'Rail', icon: TrainFront },
    { id: 'tram', label: 'Tram', icon: TramFront },
    { id: 'bus', label: 'Bus', icon: BusFront },
    { id: 'ferry', label: 'Ferry', icon: Ship }
  ];
</script>

<div class="mode-picker" role="group" aria-label="Filter by transport mode">
  {#each MODES as m (m.id)}
    <button
      class="mode-btn"
      aria-pressed={value === m.id}
      title={m.label}
      onclick={() => (value = m.id)}
    >
      <m.icon size={19} strokeWidth={2} aria-hidden="true" />
      <span>{m.label}</span>
    </button>
  {/each}
</div>
