<script lang="ts">
  import { Sun, Moon, Monitor } from '@lucide/svelte';
  import { theme } from '#lib/theme.svelte';

  const ICON = { auto: Monitor, light: Sun, dark: Moon } as const;
  const LABEL = { auto: 'Auto (system)', light: 'Light', dark: 'Dark' } as const;
  const Icon = $derived(ICON[theme.choice]);
</script>

<button
  class="wp-btn wp-btn--icon"
  onclick={() => theme.cycle()}
  title="Theme: {LABEL[theme.choice]} — click to cycle (auto → light → dark)"
  aria-label="Theme: {LABEL[theme.choice]}. Activate to cycle theme."
>
  <Icon size={18} aria-hidden="true" />
</button>
