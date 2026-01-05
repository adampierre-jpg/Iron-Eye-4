<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { settings, updateSettings } from '$lib/stores';
  import { fade, fly } from 'svelte/transition';

  const dispatch = createEventDispatcher();

  let localSettings = { ...$settings };

  function handleSave() {
    updateSettings(localSettings);
    dispatch('close');
  }

  function handleCancel() {
    dispatch('close');
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      dispatch('close');
    }
  }

  const kettlebellOptions = [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48];
</script>

<div 
  class="modal-backdrop" 
  on:click={handleBackdropClick}
  transition:fade={{ duration: 200 }}
>
  <div 
    class="modal-content"
    transition:fly={{ y: 20, duration: 300 }}
  >
    <header class="modal-header">
      <h2>⚙️ Settings</h2>
      <button class="close-btn" on:click={handleCancel}>✕</button>
    </header>

    <div class="modal-body">
      <!-- Training Settings -->
      <section class="settings-section">
        <h3>Training</h3>
        
        <div class="setting-item">
          <label for="kb-weight">Kettlebell Weight</label>
          <select id="kb-weight" bind:value={localSettings.kettlebellWeight}>
            {#each kettlebellOptions as weight}
              <option value={weight}>{weight} kg</option>
            {/each}
          </select>
        </div>

        <div class="setting-item">
          <label for="dominant-hand">Dominant Hand</label>
          <select id="dominant-hand" bind:value={localSettings.dominantHand}>
            <option value="auto">Auto-detect</option>
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>
      </section>

      <!-- Fatigue Thresholds -->
      <section class="settings-section">
        <h3>Fatigue Detection</h3>
        
        <div class="setting-item">
          <label for="fatigue-warning">
            Warning Threshold
            <span class="hint">{localSettings.fatigueWarningThreshold}% velocity drop</span>
          </label>
          <input 
            type="range" 
            id="fatigue-warning" 
            min="5" 
            max="30" 
            step="1"
            bind:value={localSettings.fatigueWarningThreshold}
          />
        </div>

        <div class="setting-item">
          <label for="fatigue-critical">
            Critical Threshold
            <span class="hint">{localSettings.fatigueCriticalThreshold}% velocity drop</span>
          </label>
          <input 
            type="range" 
            id="fatigue-critical" 
            min="15" 
            max="50" 
            step="1"
            bind:value={localSettings.fatigueCriticalThreshold}
          />
        </div>
      </section>

      <!-- Feedback Settings -->
      <section class="settings-section">
        <h3>Feedback</h3>
        
        <div class="setting-item toggle">
          <label for="sound-enabled">Sound Effects</label>
          <label class="switch">
            <input 
              type="checkbox" 
              id="sound-enabled" 
              bind:checked={localSettings.soundEnabled}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-item toggle">
          <label for="vibration-enabled">Vibration (Mobile)</label>
          <label class="switch">
            <input 
              type="checkbox" 
              id="vibration-enabled" 
              bind:checked={localSettings.vibrationEnabled}
            />
            <span class="slider"></span>
          </label>
        </div>
      </section>

      <!-- Display Settings -->
      <section class="settings-section">
        <h3>Display</h3>
        
        <div class="setting-item toggle">
          <label for="show-skeleton">Show Skeleton Overlay</label>
          <label class="switch">
            <input 
              type="checkbox" 
              id="show-skeleton" 
              bind:checked={localSettings.showSkeleton}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-item toggle">
          <label for="show-velocity">Show Velocity Graph</label>
          <label class="switch">
            <input 
              type="checkbox" 
              id="show-velocity" 
              bind:checked={localSettings.showVelocityGraph}
            />
            <span class="slider"></span>
          </label>
        </div>
      </section>

      <!-- Notion Integration -->
      <section class="settings-section">
        <h3>Notion Integration</h3>
        
        <div class="setting-item vertical">
          <label for="notion-api-key">API Key</label>
          <input 
            type="password" 
            id="notion-api-key" 
            placeholder="secret_..."
            bind:value={localSettings.notionApiKey}
          />
        </div>

        <div class="setting-item vertical">
          <label for="notion-database">Database ID</label>
          <input 
            type="text" 
            id="notion-database" 
            placeholder="Enter database ID..."
            bind:value={localSettings.notionDatabaseId}
          />
        </div>

        <p class="notion-hint">
          Get your API key from <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener">
            Notion Integrations
          </a>
        </p>
      </section>
    </div>

    <footer class="modal-footer">
      <button class="btn btn-cancel" on:click={handleCancel}>Cancel</button>
      <button class="btn btn-save" on:click={handleSave}>Save Settings</button>
    </footer>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 150;
    padding: 1rem;
  }

  .modal-content {
    background: #1A1A21;
    border-radius: 16px;
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 48px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #252530;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .close-btn {
    background: none;
    border: none;
    color: #6B7280;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .close-btn:hover {
    color: #F5F5F7;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .settings-section {
    margin-bottom: 1.5rem;
  }

  .settings-section:last-child {
    margin-bottom: 0;
  }

  .settings-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6B7280;
    margin: 0 0 1rem 0;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .setting-item.toggle {
    padding: 0.5rem 0;
  }

  .setting-item.vertical {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }

  .setting-item label {
    font-size: 0.9375rem;
    color: #F5F5F7;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .hint {
    font-size: 0.75rem;
    color: #6B7280;
  }

  select, input[type="text"], input[type="password"] {
    background: #252530;
    border: 1px solid #333340;
    border-radius: 8px;
    color: #F5F5F7;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    min-width: 140px;
  }

  select:focus, input:focus {
    outline: none;
    border-color: #3B82F6;
  }

  input[type="range"] {
    width: 140px;
    accent-color: #3B82F6;
  }

  .switch {
    position: relative;
    width: 48px;
    height: 26px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #333340;
    border-radius: 26px;
    transition: background 0.3s;
  }

  .slider::before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background: #F5F5F7;
    border-radius: 50%;
    transition: transform 0.3s;
  }

  .switch input:checked + .slider {
    background: #10B981;
  }

  .switch input:checked + .slider::before {
    transform: translateX(22px);
  }

  .notion-hint {
    font-size: 0.75rem;
    color: #6B7280;
    margin: 0.5rem 0 0 0;
  }

  .notion-hint a {
    color: #3B82F6;
    text-decoration: none;
  }

  .notion-hint a:hover {
    text-decoration: underline;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid #252530;
  }

  .btn {
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid #333340;
    color: #A1A1AA;
  }

  .btn-cancel:hover {
    background: #252530;
  }

  .btn-save {
    background: #10B981;
    color: white;
  }

  .btn-save:hover {
    background: #059669;
  }
</style>
