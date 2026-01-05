<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { 
    sessionState, 
    realtimeMetrics, 
    reps, 
    sets, 
    fatigueAlerts,
    velocityHistory,
    cameraState,
    settings,
    sessionSummary,
    latestFatigueAlert,
    velocityDropoff,
    startSession,
    stopSession,
    togglePause,
    switchHand,
    addRep,
    addSet,
    addFatigueAlert,
    updateRealtimeVelocity,
    updatePhase,
    updateJointAngles,
    resetSession,
  } from '$lib/stores';
  import { PoseDetectionService } from '$lib/services/PoseDetectionService';
  import { SnatchRepDetector, type SessionData, SnatchPhase } from '$lib/services/SnatchRepDetector';
  import { DataExportService } from '$lib/services/DataExportService';
  import VelocityChart from './VelocityChart.svelte';
  import MetricsPanel from './MetricsPanel.svelte';
  import FatigueAlert from './FatigueAlert.svelte';
  import SettingsModal from './SettingsModal.svelte';

  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  let poseService: PoseDetectionService;
  let snatchDetector: SnatchRepDetector;
  let exportService: DataExportService;
  let showSettings = false;
  let completedSession: SessionData | null = null;
  let showExportModal = false;

  // Unsubscribe functions
  let unsubscribePose: (() => void) | null = null;
  let unsubscribeRep: (() => void) | null = null;
  let unsubscribeSet: (() => void) | null = null;
  let unsubscribePhase: (() => void) | null = null;
  let unsubscribeFatigue: (() => void) | null = null;

  onMount(async () => {
    exportService = new DataExportService();
    
    // Initialize pose detection
    poseService = new PoseDetectionService({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      dominantHand: $settings.dominantHand,
    });

    snatchDetector = new SnatchRepDetector({
      kettlebellWeight: $settings.kettlebellWeight,
      fatigueThresholds: {
        velocityDropWarning: $settings.fatigueWarningThreshold,
        velocityDropCritical: $settings.fatigueCriticalThreshold,
        powerDropWarning: 20,
        powerDropCritical: 35,
      },
    });

    try {
      await poseService.initialize(videoElement, canvasElement);
      cameraState.update(s => ({ ...s, isInitialized: true, hasPermission: true }));
    } catch (error) {
      cameraState.update(s => ({ 
        ...s, 
        error: error instanceof Error ? error.message : 'Failed to initialize camera',
        hasPermission: false,
      }));
    }

    // Set up pose processing callback
    unsubscribePose = poseService.onPose((frame) => {
      if ($sessionState.isActive && !$sessionState.isPaused) {
        snatchDetector.processFrame(frame);
        updateRealtimeVelocity(frame.wristSpeed, frame.timestamp);
        updateJointAngles(frame.jointAngles);
      }
    });

    // Set up snatch detector callbacks
    unsubscribeRep = snatchDetector.onRep((rep) => {
      addRep(rep);
      playSound('rep');
      if ($settings.vibrationEnabled && navigator.vibrate) {
        navigator.vibrate(50);
      }
    });

    unsubscribeSet = snatchDetector.onSet((set) => {
      addSet(set);
      playSound('set');
    });

    unsubscribePhase = snatchDetector.onPhaseChange((phase) => {
      updatePhase(phase);
    });

    unsubscribeFatigue = snatchDetector.onFatigue((alert) => {
      addFatigueAlert(alert);
      playSound(alert.severity === 'critical' ? 'critical' : 'warning');
      if ($settings.vibrationEnabled && navigator.vibrate) {
        navigator.vibrate(alert.severity === 'critical' ? [100, 50, 100] : [100]);
      }
    });
  });

  onDestroy(() => {
    if (poseService) {
      poseService.stop();
    }
    unsubscribePose?.();
    unsubscribeRep?.();
    unsubscribeSet?.();
    unsubscribePhase?.();
    unsubscribeFatigue?.();
  });

  async function handleStart() {
    if (!$cameraState.isInitialized) {
      console.error('Camera not initialized');
      return;
    }

    resetSession();
    await poseService.start();
    cameraState.update(s => ({ ...s, isRunning: true }));
    
    snatchDetector.setKettlebellWeight($settings.kettlebellWeight);
    const hand = $settings.dominantHand === 'auto' ? 'right' : $settings.dominantHand;
    snatchDetector.start(hand);
    poseService.setDominantHand(hand);
    startSession($settings.kettlebellWeight, hand);
  }

  function handleStop() {
    completedSession = snatchDetector.stop();
    poseService.stop();
    cameraState.update(s => ({ ...s, isRunning: false }));
    stopSession();
    showExportModal = true;
  }

  function handlePause() {
    if ($sessionState.isPaused) {
      snatchDetector.resume();
    } else {
      snatchDetector.pause();
    }
    togglePause();
  }

  function handleSwitchHand() {
    const newHand = $sessionState.dominantHand === 'left' ? 'right' : 'left';
    snatchDetector.switchHand(newHand);
    poseService.setDominantHand(newHand);
    switchHand(newHand);
  }

  function handleExportCSV() {
    if (completedSession) {
      exportService.downloadCSV(completedSession);
    }
  }

  function handleExportJSON() {
    if (completedSession) {
      exportService.downloadJSON(completedSession);
    }
  }

  async function handleExportNotion() {
    if (!completedSession) return;
    
    if (!$settings.notionApiKey || !$settings.notionDatabaseId) {
      alert('Please configure Notion API key and Database ID in settings');
      return;
    }

    exportService.setNotionConfig({
      apiKey: $settings.notionApiKey,
      databaseId: $settings.notionDatabaseId,
    });

    const result = await exportService.exportToNotion(completedSession);
    if (result.success) {
      alert('Successfully exported to Notion!');
    } else {
      alert(`Failed to export: ${result.error}`);
    }
  }

  function closeExportModal() {
    showExportModal = false;
    completedSession = null;
  }

  // Audio feedback
  const audioContext = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;
  
  function playSound(type: 'rep' | 'set' | 'warning' | 'critical') {
    if (!$settings.soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch (type) {
      case 'rep':
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.1;
        break;
      case 'set':
        oscillator.frequency.value = 1320;
        gainNode.gain.value = 0.15;
        break;
      case 'warning':
        oscillator.frequency.value = 440;
        gainNode.gain.value = 0.2;
        break;
      case 'critical':
        oscillator.frequency.value = 220;
        gainNode.gain.value = 0.3;
        break;
    }
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  }

  function getPhaseColor(phase: SnatchPhase): string {
    const colors: Record<SnatchPhase, string> = {
      [SnatchPhase.IDLE]: '#6B7280',
      [SnatchPhase.BACKSWING]: '#3B82F6',
      [SnatchPhase.HIKE]: '#8B5CF6',
      [SnatchPhase.PULL]: '#F59E0B',
      [SnatchPhase.PUNCH]: '#EF4444',
      [SnatchPhase.LOCKOUT]: '#10B981',
      [SnatchPhase.DROP]: '#6366F1',
      [SnatchPhase.RETURN]: '#14B8A6',
    };
    return colors[phase] || '#6B7280';
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
</script>

<div class="snatch-detector">
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <h1>🏋️ Snatch Rep Detector</h1>
      <span class="subtitle">VBT Analysis System</span>
    </div>
    <div class="header-right">
      <button class="settings-btn" on:click={() => showSettings = true}>
        ⚙️ Settings
      </button>
    </div>
  </header>

  <main class="main-content">
    <!-- Video/Canvas Section -->
    <section class="video-section">
      <div class="video-container">
        <video 
          bind:this={videoElement} 
          class="video-element"
          playsinline
          muted
        ></video>
        <canvas 
          bind:this={canvasElement} 
          class="canvas-overlay"
          width="1280"
          height="720"
        ></canvas>

        <!-- Phase Indicator -->
        {#if $sessionState.isActive}
          <div 
            class="phase-indicator"
            style="background-color: {getPhaseColor($sessionState.currentPhase)}"
          >
            {$sessionState.currentPhase.toUpperCase()}
          </div>
        {/if}

        <!-- Camera Error -->
        {#if $cameraState.error}
          <div class="camera-error">
            <span>📷</span>
            <p>{$cameraState.error}</p>
            <button on:click={handleStart}>Retry</button>
          </div>
        {/if}

        <!-- Session Timer -->
        {#if $sessionState.isActive}
          <div class="session-timer">
            {formatDuration($sessionSummary.duration)}
          </div>
        {/if}
      </div>

      <!-- Controls -->
      <div class="controls">
        {#if !$sessionState.isActive}
          <button class="btn btn-start" on:click={handleStart} disabled={!$cameraState.isInitialized}>
            ▶️ Start Session
          </button>
        {:else}
          <button class="btn btn-pause" on:click={handlePause}>
            {$sessionState.isPaused ? '▶️ Resume' : '⏸️ Pause'}
          </button>
          <button class="btn btn-switch" on:click={handleSwitchHand}>
            🔄 Switch ({$sessionState.dominantHand === 'left' ? 'L→R' : 'R→L'})
          </button>
          <button class="btn btn-stop" on:click={handleStop}>
            ⏹️ End Session
          </button>
        {/if}
      </div>
    </section>

    <!-- Metrics Section -->
    <section class="metrics-section">
      <!-- Real-time Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Reps</span>
          <span class="stat-value">{$realtimeMetrics.repCount}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Sets</span>
          <span class="stat-value">{$realtimeMetrics.setCount}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Peak Velocity</span>
          <span class="stat-value">{$realtimeMetrics.peakVelocity.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Last Rep</span>
          <span class="stat-value trend-{$realtimeMetrics.velocityTrend}">
            {$realtimeMetrics.lastRepVelocity.toFixed(2)}
            {#if $realtimeMetrics.velocityTrend === 'up'}↑{:else if $realtimeMetrics.velocityTrend === 'down'}↓{/if}
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">KB Weight</span>
          <span class="stat-value">{$settings.kettlebellWeight} kg</span>
        </div>
        <div class="stat-card velocity-dropoff" class:warning={$velocityDropoff > $settings.fatigueWarningThreshold} class:critical={$velocityDropoff > $settings.fatigueCriticalThreshold}>
          <span class="stat-label">Velocity Drop</span>
          <span class="stat-value">{$velocityDropoff.toFixed(1)}%</span>
        </div>
      </div>

      <!-- Joint Angles -->
      {#if $realtimeMetrics.jointAngles && $settings.showSkeleton}
        <div class="angles-panel">
          <h3>Joint Angles</h3>
          <div class="angles-grid">
            <div class="angle-item">
              <span>Shoulder Abd</span>
              <span>{($sessionState.dominantHand === 'left' 
                ? $realtimeMetrics.jointAngles.leftShoulderAbduction 
                : $realtimeMetrics.jointAngles.rightShoulderAbduction).toFixed(0)}°</span>
            </div>
            <div class="angle-item">
              <span>Elbow</span>
              <span>{($sessionState.dominantHand === 'left' 
                ? $realtimeMetrics.jointAngles.leftElbow 
                : $realtimeMetrics.jointAngles.rightElbow).toFixed(0)}°</span>
            </div>
            <div class="angle-item">
              <span>Hip</span>
              <span>{($sessionState.dominantHand === 'left' 
                ? $realtimeMetrics.jointAngles.leftHip 
                : $realtimeMetrics.jointAngles.rightHip).toFixed(0)}°</span>
            </div>
            <div class="angle-item">
              <span>Spine</span>
              <span>{$realtimeMetrics.jointAngles.spine.toFixed(0)}°</span>
            </div>
          </div>
        </div>
      {/if}

      <!-- Velocity Chart -->
      {#if $settings.showVelocityGraph}
        <div class="chart-container">
          <h3>Velocity Over Time</h3>
          <VelocityChart data={$velocityHistory} />
        </div>
      {/if}

      <!-- Recent Reps -->
      {#if $reps.length > 0}
        <div class="recent-reps">
          <h3>Recent Reps</h3>
          <div class="reps-list">
            {#each $reps.slice(-5).reverse() as rep}
              <div class="rep-item">
                <span class="rep-number">#{rep.repNumber}</span>
                <span class="rep-velocity">
                  Peak: {rep.peakVelocity.toFixed(3)}
                </span>
                <span class="rep-power">{rep.power}W</span>
                <span class="rep-duration">{rep.duration.toFixed(0)}ms</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  </main>

  <!-- Fatigue Alert Overlay -->
  {#if $latestFatigueAlert}
    <FatigueAlert alert={$latestFatigueAlert} />
  {/if}

  <!-- Settings Modal -->
  {#if showSettings}
    <SettingsModal on:close={() => showSettings = false} />
  {/if}

  <!-- Export Modal -->
  {#if showExportModal && completedSession}
    <div class="modal-overlay" on:click={closeExportModal}>
      <div class="export-modal" on:click|stopPropagation>
        <h2>Session Complete!</h2>
        <div class="session-summary">
          <p><strong>Duration:</strong> {formatDuration(completedSession.duration)}</p>
          <p><strong>Total Reps:</strong> {completedSession.totalReps}</p>
          <p><strong>Total Sets:</strong> {completedSession.totalSets}</p>
          <p><strong>Peak Velocity:</strong> {completedSession.peakVelocity.toFixed(3)}</p>
          <p><strong>Avg Power:</strong> {completedSession.averagePower.toFixed(0)} W</p>
        </div>
        <div class="export-buttons">
          <button class="btn btn-export" on:click={handleExportCSV}>
            📊 Download CSV
          </button>
          <button class="btn btn-export" on:click={handleExportJSON}>
            📄 Download JSON
          </button>
          <button class="btn btn-export btn-notion" on:click={handleExportNotion}>
            📝 Export to Notion
          </button>
        </div>
        <button class="btn btn-close" on:click={closeExportModal}>
          Close
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  :root {
    --bg-primary: #0F0F12;
    --bg-secondary: #1A1A21;
    --bg-tertiary: #252530;
    --text-primary: #F5F5F7;
    --text-secondary: #A1A1AA;
    --accent-orange: #FF6B35;
    --accent-green: #10B981;
    --accent-blue: #3B82F6;
    --accent-purple: #8B5CF6;
    --warning: #F59E0B;
    --critical: #EF4444;
    --border-radius: 12px;
    --shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  }

  .snatch-detector {
    min-height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--bg-tertiary);
  }

  .header-left h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(135deg, var(--accent-orange), var(--accent-purple));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .settings-btn {
    background: var(--bg-tertiary);
    border: none;
    color: var(--text-primary);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .settings-btn:hover {
    background: var(--bg-primary);
  }

  .main-content {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 1600px;
    margin: 0 auto;
  }

  @media (max-width: 1024px) {
    .main-content {
      grid-template-columns: 1fr;
    }
  }

  .video-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .video-container {
    position: relative;
    background: var(--bg-secondary);
    border-radius: var(--border-radius);
    overflow: hidden;
    aspect-ratio: 16/9;
  }

  .video-element {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
  }

  .canvas-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .phase-indicator {
    position: absolute;
    top: 1rem;
    left: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    box-shadow: var(--shadow);
  }

  .session-timer {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .camera-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    gap: 1rem;
  }

  .camera-error span {
    font-size: 3rem;
  }

  .controls {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-start {
    background: var(--accent-green);
    color: white;
  }

  .btn-start:hover:not(:disabled) {
    background: #059669;
  }

  .btn-pause {
    background: var(--accent-blue);
    color: white;
  }

  .btn-switch {
    background: var(--accent-purple);
    color: white;
  }

  .btn-stop {
    background: var(--critical);
    color: white;
  }

  .metrics-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .stat-card {
    background: var(--bg-secondary);
    padding: 1rem;
    border-radius: var(--border-radius);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
  }

  .trend-up {
    color: var(--accent-green);
  }

  .trend-down {
    color: var(--critical);
  }

  .velocity-dropoff.warning {
    border-left: 3px solid var(--warning);
  }

  .velocity-dropoff.critical {
    border-left: 3px solid var(--critical);
    background: rgba(239, 68, 68, 0.1);
  }

  .angles-panel {
    background: var(--bg-secondary);
    padding: 1rem;
    border-radius: var(--border-radius);
  }

  .angles-panel h3 {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 0.75rem 0;
  }

  .angles-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .angle-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
  }

  .angle-item span:last-child {
    font-family: 'JetBrains Mono', monospace;
    color: var(--accent-blue);
  }

  .chart-container {
    background: var(--bg-secondary);
    padding: 1rem;
    border-radius: var(--border-radius);
  }

  .chart-container h3 {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 0.75rem 0;
  }

  .recent-reps {
    background: var(--bg-secondary);
    padding: 1rem;
    border-radius: var(--border-radius);
  }

  .recent-reps h3 {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 0.75rem 0;
  }

  .reps-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .rep-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 8px;
    font-size: 0.875rem;
  }

  .rep-number {
    font-weight: 600;
    color: var(--accent-orange);
    min-width: 36px;
  }

  .rep-velocity {
    flex: 1;
    font-family: 'JetBrains Mono', monospace;
  }

  .rep-power {
    color: var(--accent-green);
    font-family: 'JetBrains Mono', monospace;
  }

  .rep-duration {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .export-modal {
    background: var(--bg-secondary);
    padding: 2rem;
    border-radius: var(--border-radius);
    max-width: 480px;
    width: 90%;
    box-shadow: var(--shadow);
  }

  .export-modal h2 {
    margin: 0 0 1.5rem 0;
    text-align: center;
  }

  .session-summary {
    background: var(--bg-tertiary);
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .session-summary p {
    margin: 0.5rem 0;
    display: flex;
    justify-content: space-between;
  }

  .export-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .btn-export {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    width: 100%;
    text-align: center;
  }

  .btn-export:hover {
    background: var(--bg-primary);
  }

  .btn-notion {
    background: linear-gradient(135deg, #000000, #2d2d2d);
  }

  .btn-close {
    background: transparent;
    border: 1px solid var(--bg-tertiary);
    color: var(--text-secondary);
    width: 100%;
  }
</style>
