<script lang="ts">
  import { onMount } from 'svelte';
  import type { FatigueAlert as FatigueAlertType } from '$lib/services/SnatchRepDetector';
  import { fade, fly } from 'svelte/transition';

  export let alert: FatigueAlertType;

  let visible = true;
  let timeoutId: ReturnType<typeof setTimeout>;

  onMount(() => {
    // Auto-dismiss after 5 seconds
    timeoutId = setTimeout(() => {
      visible = false;
    }, 5000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  });

  function dismiss() {
    visible = false;
  }

  function getIcon(type: string): string {
    switch (type) {
      case 'velocity_drop':
        return '⚡';
      case 'power_drop':
        return '💪';
      case 'form_degradation':
        return '⚠️';
      default:
        return '⚠️';
    }
  }

  function getTitle(type: string): string {
    switch (type) {
      case 'velocity_drop':
        return 'Velocity Alert';
      case 'power_drop':
        return 'Power Alert';
      case 'form_degradation':
        return 'Form Alert';
      default:
        return 'Alert';
    }
  }
</script>

{#if visible}
  <div 
    class="fatigue-alert {alert.severity}"
    in:fly={{ y: -50, duration: 300 }}
    out:fade={{ duration: 200 }}
  >
    <div class="alert-icon">
      {getIcon(alert.type)}
    </div>
    <div class="alert-content">
      <div class="alert-header">
        <span class="alert-title">{getTitle(alert.type)}</span>
        <span class="alert-meta">Set {alert.setNumber} • Rep {alert.repNumber}</span>
      </div>
      <p class="alert-message">{alert.message}</p>
      {#if alert.velocityDropPercent}
        <div class="velocity-bar">
          <div 
            class="velocity-fill"
            style="width: {Math.min(alert.velocityDropPercent, 100)}%"
          ></div>
        </div>
      {/if}
    </div>
    <button class="dismiss-btn" on:click={dismiss}>
      ✕
    </button>
  </div>
{/if}

<style>
  .fatigue-alert {
    position: fixed;
    top: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-radius: 12px;
    background: #1A1A21;
    border: 1px solid;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 420px;
    z-index: 200;
  }

  .fatigue-alert.warning {
    border-color: #F59E0B;
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), #1A1A21);
  }

  .fatigue-alert.critical {
    border-color: #EF4444;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), #1A1A21);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
    }
    50% {
      box-shadow: 0 8px 48px rgba(239, 68, 68, 0.5);
    }
  }

  .alert-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .alert-content {
    flex: 1;
    min-width: 0;
  }

  .alert-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .alert-title {
    font-weight: 700;
    font-size: 0.875rem;
  }

  .warning .alert-title {
    color: #F59E0B;
  }

  .critical .alert-title {
    color: #EF4444;
  }

  .alert-meta {
    font-size: 0.75rem;
    color: #6B7280;
  }

  .alert-message {
    margin: 0;
    font-size: 0.875rem;
    color: #A1A1AA;
    line-height: 1.4;
  }

  .velocity-bar {
    margin-top: 0.75rem;
    height: 4px;
    background: #333340;
    border-radius: 2px;
    overflow: hidden;
  }

  .velocity-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .warning .velocity-fill {
    background: linear-gradient(90deg, #F59E0B, #EAB308);
  }

  .critical .velocity-fill {
    background: linear-gradient(90deg, #EF4444, #DC2626);
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: #6B7280;
    cursor: pointer;
    padding: 0.25rem;
    font-size: 1rem;
    line-height: 1;
    transition: color 0.2s;
  }

  .dismiss-btn:hover {
    color: #F5F5F7;
  }
</style>
