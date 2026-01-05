<script lang="ts">
  import SnatchDetector from '$lib/components/SnatchDetector.svelte';
</script>

<svelte:head>
  <title>Kettlebell Snatch Detector | VBT Analysis</title>
  <meta name="description" content="Real-time kettlebell snatch rep detection with velocity-based training analysis, Kalman-filtered pose estimation, and fatigue monitoring." />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
</svelte:head>

<SnatchDetector />

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0F0F12;
    color: #F5F5F7;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(body) {
    overflow-x: hidden;
  }

  :global(::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  :global(::-webkit-scrollbar-track) {
    background: #1A1A21;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: #333340;
    border-radius: 4px;
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: #4B5563;
  }
</style>
