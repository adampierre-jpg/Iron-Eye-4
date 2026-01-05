<script lang="ts">
  import { onMount } from 'svelte';

  // Handle service worker registration for PWA
  onMount(() => {
    if ('serviceWorker' in navigator) {
      // Could register service worker here for offline support
    }
  });
</script>

<slot />
