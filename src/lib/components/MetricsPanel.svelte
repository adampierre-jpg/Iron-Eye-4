<script lang="ts">
  import type { RepData, SetData } from '$lib/services/SnatchRepDetector';

  export let reps: RepData[] = [];
  export let sets: SetData[] = [];
  export let currentSet: number = 0;

  $: latestSet = sets.length > 0 ? sets[sets.length - 1] : null;
  $: currentSetReps = reps.filter(r => !sets.some(s => s.reps.includes(r)));

  function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function getVelocityClass(velocity: number, baseline: number): string {
    if (!baseline) return '';
    const drop = ((baseline - velocity) / baseline) * 100;
    if (drop > 25) return 'critical';
    if (drop > 15) return 'warning';
    if (drop < -5) return 'improved';
    return '';
  }
</script>

<div class="metrics-panel">
  <!-- Current Set Progress -->
  {#if currentSetReps.length > 0}
    <div class="current-set">
      <h3>Current Set</h3>
      <div class="set-stats">
        <div class="stat">
          <span class="label">Reps</span>
          <span class="value">{currentSetReps.length}</span>
        </div>
        <div class="stat">
          <span class="label">Avg Vel</span>
          <span class="value">
            {(currentSetReps.reduce((a, r) => a + r.peakVelocity, 0) / currentSetReps.length).toFixed(3)}
          </span>
        </div>
        <div class="stat">
          <span class="label">Avg Power</span>
          <span class="value">
            {Math.round(currentSetReps.reduce((a, r) => a + r.power, 0) / currentSetReps.length)} W
          </span>
        </div>
      </div>
      
      <div class="rep-bars">
        {#each currentSetReps as rep, i}
          {@const baseline = currentSetReps[0]?.peakVelocity || rep.peakVelocity}
          {@const heightPercent = Math.min(100, (rep.peakVelocity / baseline) * 100)}
          <div 
            class="rep-bar {getVelocityClass(rep.peakVelocity, baseline)}"
            style="height: {heightPercent}%"
            title="Rep {rep.repNumber}: {rep.peakVelocity.toFixed(3)}"
          >
            <span class="rep-label">{rep.repNumber}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Completed Sets -->
  {#if sets.length > 0}
    <div class="completed-sets">
      <h3>Completed Sets</h3>
      <div class="sets-list">
        {#each sets as set}
          <div class="set-card">
            <div class="set-header">
              <span class="set-number">Set {set.setNumber}</span>
              <span class="set-hand">{set.hand === 'left' ? '🤚' : '✋'}</span>
            </div>
            <div class="set-details">
              <div class="detail">
                <span>{set.totalReps}</span>
                <span class="detail-label">reps</span>
              </div>
              <div class="detail">
                <span>{set.averageVelocity.toFixed(2)}</span>
                <span class="detail-label">avg vel</span>
              </div>
              <div class="detail">
                <span>{Math.round(set.averagePower)}</span>
                <span class="detail-label">W</span>
              </div>
              <div class="detail dropoff {set.velocityDropoff > 25 ? 'critical' : set.velocityDropoff > 15 ? 'warning' : ''}">
                <span>{set.velocityDropoff.toFixed(0)}%</span>
                <span class="detail-label">drop</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Last Set Summary -->
  {#if latestSet}
    <div class="last-set-summary">
      <h3>Last Set Analysis</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Peak Velocity</span>
          <span class="summary-value">{latestSet.peakVelocity.toFixed(3)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Fatigue Factor</span>
          <span class="summary-value {latestSet.fatigueFactor > 0.5 ? 'warning' : ''}">
            {(latestSet.fatigueFactor * 100).toFixed(0)}%
          </span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Duration</span>
          <span class="summary-value">{formatTime(latestSet.duration)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">KB Weight</span>
          <span class="summary-value">{latestSet.kettlebellWeight} kg</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .metrics-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  h3 {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6B7280;
    margin: 0 0 0.75rem 0;
  }

  .current-set {
    background: #1A1A21;
    padding: 1rem;
    border-radius: 12px;
  }

  .set-stats {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat {
    flex: 1;
    text-align: center;
  }

  .stat .label {
    display: block;
    font-size: 0.75rem;
    color: #6B7280;
    margin-bottom: 0.25rem;
  }

  .stat .value {
    font-size: 1.25rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    color: #F5F5F7;
  }

  .rep-bars {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 80px;
    padding-top: 20px;
  }

  .rep-bar {
    flex: 1;
    min-width: 20px;
    background: linear-gradient(to top, #10B981, #34D399);
    border-radius: 4px 4px 0 0;
    position: relative;
    transition: height 0.3s ease;
  }

  .rep-bar.warning {
    background: linear-gradient(to top, #F59E0B, #FCD34D);
  }

  .rep-bar.critical {
    background: linear-gradient(to top, #EF4444, #F87171);
  }

  .rep-bar.improved {
    background: linear-gradient(to top, #3B82F6, #60A5FA);
  }

  .rep-label {
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.625rem;
    color: #6B7280;
  }

  .completed-sets {
    background: #1A1A21;
    padding: 1rem;
    border-radius: 12px;
    max-height: 200px;
    overflow-y: auto;
  }

  .sets-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .set-card {
    background: #252530;
    padding: 0.75rem;
    border-radius: 8px;
  }

  .set-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .set-number {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .set-hand {
    font-size: 1rem;
  }

  .set-details {
    display: flex;
    gap: 0.75rem;
  }

  .detail {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .detail span:first-child {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .detail-label {
    font-size: 0.625rem;
    color: #6B7280;
    text-transform: uppercase;
  }

  .detail.dropoff.warning span:first-child {
    color: #F59E0B;
  }

  .detail.dropoff.critical span:first-child {
    color: #EF4444;
  }

  .last-set-summary {
    background: #1A1A21;
    padding: 1rem;
    border-radius: 12px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .summary-label {
    font-size: 0.75rem;
    color: #6B7280;
  }

  .summary-value {
    font-size: 1.125rem;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    color: #F5F5F7;
  }

  .summary-value.warning {
    color: #F59E0B;
  }
</style>
