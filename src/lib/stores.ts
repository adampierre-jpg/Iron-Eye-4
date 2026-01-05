/**
 * Svelte Stores for Snatch Detector Application State
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { SessionData, SetData, RepData, FatigueAlert, SnatchPhase } from './services/SnatchRepDetector';
import type { JointAngles } from './services/PoseDetectionService';

// ==================== Session State ====================

export interface SessionState {
  isActive: boolean;
  isPaused: boolean;
  startTime: number | null;
  kettlebellWeight: number;
  dominantHand: 'left' | 'right';
  currentPhase: SnatchPhase;
}

const initialSessionState: SessionState = {
  isActive: false,
  isPaused: false,
  startTime: null,
  kettlebellWeight: 16,
  dominantHand: 'right',
  currentPhase: 'idle' as SnatchPhase,
};

export const sessionState: Writable<SessionState> = writable(initialSessionState);

// ==================== Real-time Metrics ====================

export interface RealtimeMetrics {
  currentVelocity: number;
  peakVelocity: number;
  currentPower: number;
  repCount: number;
  setCount: number;
  lastRepVelocity: number;
  velocityTrend: 'up' | 'down' | 'stable';
  jointAngles: JointAngles | null;
}

const initialRealtimeMetrics: RealtimeMetrics = {
  currentVelocity: 0,
  peakVelocity: 0,
  currentPower: 0,
  repCount: 0,
  setCount: 0,
  lastRepVelocity: 0,
  velocityTrend: 'stable',
  jointAngles: null,
};

export const realtimeMetrics: Writable<RealtimeMetrics> = writable(initialRealtimeMetrics);

// ==================== Rep History ====================

export const reps: Writable<RepData[]> = writable([]);
export const sets: Writable<SetData[]> = writable([]);
export const fatigueAlerts: Writable<FatigueAlert[]> = writable([]);

// ==================== Velocity History for Charts ====================

export interface VelocityDataPoint {
  timestamp: number;
  velocity: number;
  repNumber?: number;
}

export const velocityHistory: Writable<VelocityDataPoint[]> = writable([]);

// ==================== Camera State ====================

export interface CameraState {
  isInitialized: boolean;
  isRunning: boolean;
  error: string | null;
  hasPermission: boolean;
  selectedDeviceId: string | null;
  availableDevices: MediaDeviceInfo[];
}

const initialCameraState: CameraState = {
  isInitialized: false,
  isRunning: false,
  error: null,
  hasPermission: false,
  selectedDeviceId: null,
  availableDevices: [],
};

export const cameraState: Writable<CameraState> = writable(initialCameraState);

// ==================== Settings ====================

export interface AppSettings {
  kettlebellWeight: number;
  dominantHand: 'left' | 'right' | 'auto';
  fatigueWarningThreshold: number;
  fatigueCriticalThreshold: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  showSkeleton: boolean;
  showVelocityGraph: boolean;
  notionApiKey: string;
  notionDatabaseId: string;
}

const defaultSettings: AppSettings = {
  kettlebellWeight: 16,
  dominantHand: 'auto',
  fatigueWarningThreshold: 15,
  fatigueCriticalThreshold: 25,
  soundEnabled: true,
  vibrationEnabled: true,
  showSkeleton: true,
  showVelocityGraph: true,
  notionApiKey: '',
  notionDatabaseId: '',
};

// Load settings from localStorage
function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultSettings;
  
  try {
    const saved = localStorage.getItem('snatchDetectorSettings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return defaultSettings;
}

export const settings: Writable<AppSettings> = writable(loadSettings());

// Auto-save settings
if (typeof window !== 'undefined') {
  settings.subscribe(value => {
    try {
      localStorage.setItem('snatchDetectorSettings', JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  });
}

// ==================== Derived Stores ====================

// Current session summary
export const sessionSummary: Readable<{
  duration: number;
  totalReps: number;
  totalSets: number;
  avgVelocity: number;
  peakVelocity: number;
}> = derived(
  [sessionState, reps, sets],
  ([$sessionState, $reps, $sets]) => {
    const now = Date.now();
    const duration = $sessionState.startTime ? now - $sessionState.startTime : 0;
    const velocities = $reps.map(r => r.peakVelocity);
    
    return {
      duration,
      totalReps: $reps.length,
      totalSets: $sets.length,
      avgVelocity: velocities.length > 0 
        ? velocities.reduce((a, b) => a + b, 0) / velocities.length 
        : 0,
      peakVelocity: velocities.length > 0 ? Math.max(...velocities) : 0,
    };
  }
);

// Latest fatigue alert
export const latestFatigueAlert: Readable<FatigueAlert | null> = derived(
  fatigueAlerts,
  ($fatigueAlerts) => $fatigueAlerts.length > 0 
    ? $fatigueAlerts[$fatigueAlerts.length - 1] 
    : null
);

// Velocity dropoff percentage (latest vs baseline)
export const velocityDropoff: Readable<number> = derived(
  reps,
  ($reps) => {
    if ($reps.length < 4) return 0;
    
    // Baseline from first 3 reps
    const baseline = ($reps[0].peakVelocity + $reps[1].peakVelocity + $reps[2].peakVelocity) / 3;
    const latest = $reps[$reps.length - 1].peakVelocity;
    
    return ((baseline - latest) / baseline) * 100;
  }
);

// ==================== Store Actions ====================

export function resetSession(): void {
  sessionState.set(initialSessionState);
  realtimeMetrics.set(initialRealtimeMetrics);
  reps.set([]);
  sets.set([]);
  fatigueAlerts.set([]);
  velocityHistory.set([]);
}

export function addRep(rep: RepData): void {
  reps.update(current => [...current, rep]);
  
  // Update velocity history with rep marker
  velocityHistory.update(current => [
    ...current,
    { timestamp: rep.endTime, velocity: rep.peakVelocity, repNumber: rep.repNumber }
  ]);
  
  // Update realtime metrics
  realtimeMetrics.update(current => {
    const velocityTrend = rep.peakVelocity > current.lastRepVelocity 
      ? 'up' 
      : rep.peakVelocity < current.lastRepVelocity 
        ? 'down' 
        : 'stable';
    
    return {
      ...current,
      repCount: current.repCount + 1,
      lastRepVelocity: rep.peakVelocity,
      peakVelocity: Math.max(current.peakVelocity, rep.peakVelocity),
      velocityTrend,
    };
  });
}

export function addSet(set: SetData): void {
  sets.update(current => [...current, set]);
  realtimeMetrics.update(current => ({
    ...current,
    setCount: current.setCount + 1,
  }));
}

export function addFatigueAlert(alert: FatigueAlert): void {
  fatigueAlerts.update(current => [...current, alert]);
}

export function updateRealtimeVelocity(velocity: number, timestamp: number): void {
  realtimeMetrics.update(current => ({
    ...current,
    currentVelocity: velocity,
  }));
  
  // Add to velocity history (throttled)
  velocityHistory.update(current => {
    // Keep last 300 data points (~10 seconds at 30fps)
    const newHistory = current.length > 300 
      ? current.slice(-299) 
      : current;
    return [...newHistory, { timestamp, velocity }];
  });
}

export function updatePhase(phase: SnatchPhase): void {
  sessionState.update(current => ({
    ...current,
    currentPhase: phase,
  }));
}

export function updateJointAngles(angles: JointAngles): void {
  realtimeMetrics.update(current => ({
    ...current,
    jointAngles: angles,
  }));
}

export function startSession(weight: number, hand: 'left' | 'right'): void {
  resetSession();
  sessionState.update(current => ({
    ...current,
    isActive: true,
    isPaused: false,
    startTime: Date.now(),
    kettlebellWeight: weight,
    dominantHand: hand,
  }));
}

export function stopSession(): void {
  sessionState.update(current => ({
    ...current,
    isActive: false,
    isPaused: false,
  }));
}

export function togglePause(): void {
  sessionState.update(current => ({
    ...current,
    isPaused: !current.isPaused,
  }));
}

export function switchHand(hand: 'left' | 'right'): void {
  sessionState.update(current => ({
    ...current,
    dominantHand: hand,
  }));
}

export function updateSettings(newSettings: Partial<AppSettings>): void {
  settings.update(current => ({ ...current, ...newSettings }));
}
