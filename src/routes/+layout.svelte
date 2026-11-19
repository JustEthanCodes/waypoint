<script lang="ts">
  import '../app.css';
  import { theme } from '#lib/theme.svelte';

  let { children } = $props();

  // Apply stored theme before paint (blocks FOUC) — also done in app.html inline script
  $effect(() => {
    document.documentElement.dataset.theme = theme.choice;
  });
</script>

{@render children()}
