<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import type { VelocityDataPoint } from '$lib/stores';

  export let data: VelocityDataPoint[] = [];
  export let width = 340;
  export let height = 150;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  const padding = { top: 20, right: 20, bottom: 30, left: 50 };

  onMount(() => {
    ctx = canvas.getContext('2d');
    draw();
  });

  afterUpdate(() => {
    draw();
  });

  function draw() {
    if (!ctx || data.length < 2) return;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.fillStyle = '#1A1A21';
    ctx.fillRect(0, 0, width, height);

    // Get data range
    const velocities = data.map(d => d.velocity);
    const maxVel = Math.max(...velocities, 0.5);
    const minVel = Math.min(...velocities, -0.1);
    const velRange = maxVel - minVel;

    // Draw grid lines
    ctx.strokeStyle = '#333340';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const velValue = maxVel - (velRange / gridLines) * i;
      ctx.fillStyle = '#6B7280';
      ctx.font = '10px Inter';
      ctx.textAlign = 'right';
      ctx.fillText(velValue.toFixed(2), padding.left - 5, y + 3);
    }

    // Zero line
    if (minVel < 0 && maxVel > 0) {
      const zeroY = padding.top + chartHeight * (maxVel / velRange);
      ctx.strokeStyle = '#4B5563';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(width - padding.right, zeroY);
      ctx.stroke();
    }

    // Draw velocity line
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, '#10B981');
    gradient.addColorStop(0.5, '#3B82F6');
    gradient.addColorStop(1, '#EF4444');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    data.forEach((point, i) => {
      const x = padding.left + (chartWidth / (data.length - 1)) * i;
      const y = padding.top + chartHeight * ((maxVel - point.velocity) / velRange);
      
      if (i === 0) {
        ctx!.moveTo(x, y);
      } else {
        ctx!.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw rep markers
    ctx.fillStyle = '#FF6B35';
    data.forEach((point, i) => {
      if (point.repNumber) {
        const x = padding.left + (chartWidth / (data.length - 1)) * i;
        const y = padding.top + chartHeight * ((maxVel - point.velocity) / velRange);
        
        ctx!.beginPath();
        ctx!.arc(x, y, 6, 0, Math.PI * 2);
        ctx!.fill();

        // Rep number label
        ctx!.fillStyle = '#F5F5F7';
        ctx!.font = 'bold 9px Inter';
        ctx!.textAlign = 'center';
        ctx!.fillText(`R${point.repNumber}`, x, y - 10);
        ctx!.fillStyle = '#FF6B35';
      }
    });

    // X-axis label
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Time', width / 2, height - 5);

    // Y-axis label
    ctx.save();
    ctx.translate(12, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Velocity', 0, 0);
    ctx.restore();
  }
</script>

<canvas 
  bind:this={canvas} 
  {width} 
  {height}
  class="velocity-chart"
></canvas>

<style>
  .velocity-chart {
    width: 100%;
    height: auto;
    border-radius: 8px;
  }
</style>
