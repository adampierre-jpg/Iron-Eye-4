/**
 * Kettlebell Snatch Rep Detector
 * 
 * Detects snatch phases, counts reps, tracks sets, and calculates metrics
 */

import type { PoseFrame, FilteredLandmark, JointAngles } from './PoseDetectionService';
import { KalmanFilter1D } from '../filters/KalmanFilter';

// Snatch movement phases
export enum SnatchPhase {
  IDLE = 'idle',
  BACKSWING = 'backswing',      // KB between legs, hinge position
  HIKE = 'hike',                // Initial pull from backswing
  PULL = 'pull',                // Explosive hip drive, KB ascending
  PUNCH = 'punch',              // Hand insertion, KB at/near apex
  LOCKOUT = 'lockout',          // Full overhead extension
  DROP = 'drop',                // Controlled descent
  RETURN = 'return',            // Back to backswing position
}

export interface RepData {
  repNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  peakVelocity: number;
  meanVelocity: number;
  peakHeight: number;
  lockoutTime: number;
  phases: {
    phase: SnatchPhase;
    startTime: number;
    endTime: number;
    duration: number;
  }[];
  jointAngles: {
    maxShoulderAbduction: number;
    maxElbowAngle: number;
    minHipAngle: number;
    lockoutShoulderAngle: number;
  };
  power: number;          // Watts (estimated)
  hand: 'left' | 'right';
}

export interface SetData {
  setNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  hand: 'left' | 'right';
  reps: RepData[];
  totalReps: number;
  averageVelocity: number;
  peakVelocity: number;
  velocityDropoff: number;     // Percentage drop from first rep
  averagePower: number;
  fatigueFactor: number;       // 0-1, higher = more fatigue
  kettlebellWeight: number;
}

export interface SessionData {
  sessionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  kettlebellWeight: number;
  sets: SetData[];
  totalReps: number;
  totalSets: number;
  averageVelocity: number;
  peakVelocity: number;
  averagePower: number;
  totalWork: number;          // Joules (estimated)
  fatigueAlerts: FatigueAlert[];
}

export interface FatigueAlert {
  timestamp: number;
  setNumber: number;
  repNumber: number;
  type: 'velocity_drop' | 'form_degradation' | 'power_drop';
  message: string;
  severity: 'warning' | 'critical';
  velocityDropPercent?: number;
}

export interface SnatchDetectorConfig {
  kettlebellWeight: number;          // kg
  velocityThresholds: {
    backswingMin: number;            // Min vertical velocity to detect backswing
    pullMin: number;                 // Min velocity for pull phase
    lockoutMax: number;              // Max velocity at lockout
  };
  positionThresholds: {
    backswingHeightRatio: number;    // KB position relative to hip height
    lockoutHeightRatio: number;      // KB position relative to shoulder height
  };
  fatigueThresholds: {
    velocityDropWarning: number;     // % drop for warning
    velocityDropCritical: number;    // % drop for critical
    powerDropWarning: number;
    powerDropCritical: number;
  };
  setDetection: {
    maxRepGap: number;               // Max ms between reps in same set
    minRepsForSet: number;           // Min reps to count as a set
  };
}

const DEFAULT_CONFIG: SnatchDetectorConfig = {
  kettlebellWeight: 16,
  velocityThresholds: {
    backswingMin: -0.15,
    pullMin: 0.2,
    lockoutMax: 0.05,
  },
  positionThresholds: {
    backswingHeightRatio: 0.7,       // Below hip level
    lockoutHeightRatio: 0.3,         // Above shoulder level
  },
  fatigueThresholds: {
    velocityDropWarning: 15,
    velocityDropCritical: 25,
    powerDropWarning: 20,
    powerDropCritical: 35,
  },
  setDetection: {
    maxRepGap: 5000,                 // 5 seconds
    minRepsForSet: 1,
  },
};

type RepCallback = (rep: RepData) => void;
type SetCallback = (set: SetData) => void;
type PhaseCallback = (phase: SnatchPhase) => void;
type FatigueCallback = (alert: FatigueAlert) => void;

export class SnatchRepDetector {
  private config: SnatchDetectorConfig;
  private currentPhase: SnatchPhase = SnatchPhase.IDLE;
  private phaseStartTime: number = 0;
  private phaseHistory: { phase: SnatchPhase; startTime: number; endTime: number }[] = [];
  
  // Current rep tracking
  private repInProgress = false;
  private currentRepStartTime: number = 0;
  private velocityHistory: { time: number; velocity: number }[] = [];
  private heightHistory: { time: number; height: number }[] = [];
  private angleHistory: { time: number; angles: JointAngles }[] = [];
  
  // Set tracking
  private currentSetStartTime: number = 0;
  private currentSetReps: RepData[] = [];
  private lastRepEndTime: number = 0;
  
  // Session tracking
  private sessionStartTime: number = 0;
  private sets: SetData[] = [];
  private fatigueAlerts: FatigueAlert[] = [];
  
  // Reference velocities for fatigue detection
  private baselineVelocities: number[] = [];
  private baselinePowers: number[] = [];
  
  // Velocity filter for smoother detection
  private velocityFilter: KalmanFilter1D;
  
  // Callbacks
  private repCallbacks: RepCallback[] = [];
  private setCallbacks: SetCallback[] = [];
  private phaseCallbacks: PhaseCallback[] = [];
  private fatigueCallbacks: FatigueCallback[] = [];

  // State
  private isActive = false;
  private currentHand: 'left' | 'right' = 'right';
  private setCounter = 0;
  private repCounter = 0;

  constructor(config: Partial<SnatchDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.velocityFilter = new KalmanFilter1D({
      processNoise: 0.1,
      measurementNoise: 0.2,
    });
  }

  start(hand: 'left' | 'right' = 'right'): void {
    this.isActive = true;
    this.currentHand = hand;
    this.sessionStartTime = performance.now();
    this.currentSetStartTime = this.sessionStartTime;
    this.reset();
  }

  stop(): SessionData {
    this.isActive = false;
    
    // Finalize current set if there are reps
    if (this.currentSetReps.length >= this.config.setDetection.minRepsForSet) {
      this.finalizeSet();
    }
    
    const endTime = performance.now();
    
    return this.getSessionData(endTime);
  }

  pause(): void {
    this.isActive = false;
  }

  resume(): void {
    this.isActive = true;
  }

  reset(): void {
    this.currentPhase = SnatchPhase.IDLE;
    this.phaseStartTime = 0;
    this.phaseHistory = [];
    this.repInProgress = false;
    this.currentRepStartTime = 0;
    this.velocityHistory = [];
    this.heightHistory = [];
    this.angleHistory = [];
    this.velocityFilter.reset();
  }

  processFrame(frame: PoseFrame): void {
    if (!this.isActive) return;

    const { timestamp, wristPosition, wristSpeed, jointAngles, shoulderHeight, hipHeight } = frame;
    
    // Filter velocity for smoother detection
    const filteredState = this.velocityFilter.update(-wristPosition.velocityY, timestamp);
    const verticalVelocity = filteredState.velocity;
    
    // Normalize height relative to body
    const normalizedHeight = 1 - wristPosition.y; // Invert so higher = larger value
    const heightRatio = (hipHeight - wristPosition.y) / (hipHeight - shoulderHeight);
    
    // Store history
    this.velocityHistory.push({ time: timestamp, velocity: verticalVelocity });
    this.heightHistory.push({ time: timestamp, height: normalizedHeight });
    this.angleHistory.push({ time: timestamp, angles: { ...jointAngles } });
    
    // Keep history bounded
    const maxHistoryLength = 300; // ~10 seconds at 30fps
    if (this.velocityHistory.length > maxHistoryLength) {
      this.velocityHistory.shift();
      this.heightHistory.shift();
      this.angleHistory.shift();
    }
    
    // Detect phase transitions
    const newPhase = this.detectPhase(verticalVelocity, heightRatio, jointAngles, timestamp);
    
    if (newPhase !== this.currentPhase) {
      this.onPhaseChange(this.currentPhase, newPhase, timestamp);
    }
    
    // Check for set gap
    if (this.currentSetReps.length > 0 && 
        timestamp - this.lastRepEndTime > this.config.setDetection.maxRepGap &&
        this.currentPhase === SnatchPhase.IDLE) {
      this.finalizeSet();
      this.currentSetStartTime = timestamp;
    }
  }

  private detectPhase(
    velocity: number,
    heightRatio: number,
    angles: JointAngles,
    timestamp: number
  ): SnatchPhase {
    const { velocityThresholds, positionThresholds } = this.config;
    
    // Get relevant angles based on current hand
    const shoulderAngle = this.currentHand === 'left' 
      ? angles.leftShoulderAbduction 
      : angles.rightShoulderAbduction;
    const elbowAngle = this.currentHand === 'left' 
      ? angles.leftElbow 
      : angles.rightElbow;
    const hipAngle = this.currentHand === 'left'
      ? angles.leftHip
      : angles.rightHip;

    switch (this.currentPhase) {
      case SnatchPhase.IDLE:
        // Transition to BACKSWING when KB drops below hip with downward velocity
        if (velocity < velocityThresholds.backswingMin && 
            heightRatio < positionThresholds.backswingHeightRatio) {
          return SnatchPhase.BACKSWING;
        }
        break;

      case SnatchPhase.BACKSWING:
        // Transition to HIKE when velocity reverses (starts going up)
        if (velocity > 0 && heightRatio < positionThresholds.backswingHeightRatio) {
          return SnatchPhase.HIKE;
        }
        break;

      case SnatchPhase.HIKE:
        // Transition to PULL when velocity exceeds pull threshold
        if (velocity > velocityThresholds.pullMin) {
          return SnatchPhase.PULL;
        }
        // Return to backswing if velocity drops without reaching pull
        if (velocity < velocityThresholds.backswingMin) {
          return SnatchPhase.BACKSWING;
        }
        break;

      case SnatchPhase.PULL:
        // Transition to PUNCH when KB is near shoulder height and velocity decreasing
        if (heightRatio > positionThresholds.lockoutHeightRatio * 0.7 &&
            velocity < this.getPeakVelocityInPhase() * 0.5) {
          return SnatchPhase.PUNCH;
        }
        break;

      case SnatchPhase.PUNCH:
        // Transition to LOCKOUT when velocity is low and height is near max
        if (Math.abs(velocity) < velocityThresholds.lockoutMax &&
            heightRatio > positionThresholds.lockoutHeightRatio &&
            shoulderAngle > 150) { // Arm overhead
          return SnatchPhase.LOCKOUT;
        }
        break;

      case SnatchPhase.LOCKOUT:
        // Transition to DROP when KB starts descending
        if (velocity < -0.1) {
          return SnatchPhase.DROP;
        }
        break;

      case SnatchPhase.DROP:
        // Transition to RETURN as KB descends past shoulder
        if (heightRatio < positionThresholds.lockoutHeightRatio * 0.7) {
          return SnatchPhase.RETURN;
        }
        break;

      case SnatchPhase.RETURN:
        // Transition to BACKSWING to start next rep, or IDLE if movement stops
        if (velocity < velocityThresholds.backswingMin && 
            heightRatio < positionThresholds.backswingHeightRatio) {
          return SnatchPhase.BACKSWING;
        }
        // Transition to IDLE if movement stops
        if (Math.abs(velocity) < 0.05 && this.getPhaseDuration(timestamp) > 500) {
          return SnatchPhase.IDLE;
        }
        break;
    }

    return this.currentPhase;
  }

  private onPhaseChange(oldPhase: SnatchPhase, newPhase: SnatchPhase, timestamp: number): void {
    // Record phase end
    if (this.phaseStartTime > 0) {
      this.phaseHistory.push({
        phase: oldPhase,
        startTime: this.phaseStartTime,
        endTime: timestamp,
      });
    }

    // Start new phase
    this.currentPhase = newPhase;
    this.phaseStartTime = timestamp;

    // Notify callbacks
    for (const callback of this.phaseCallbacks) {
      callback(newPhase);
    }

    // Handle rep start/end
    if (newPhase === SnatchPhase.BACKSWING && !this.repInProgress) {
      // Start of new rep
      this.repInProgress = true;
      this.currentRepStartTime = timestamp;
      this.phaseHistory = [];
    } else if (oldPhase === SnatchPhase.LOCKOUT && newPhase === SnatchPhase.DROP) {
      // Rep complete at end of lockout
      if (this.repInProgress) {
        this.finalizeRep(timestamp);
      }
    } else if (newPhase === SnatchPhase.IDLE && this.repInProgress) {
      // Rep abandoned or incomplete
      this.repInProgress = false;
      this.phaseHistory = [];
    }
  }

  private finalizeRep(timestamp: number): void {
    const repStartTime = this.currentRepStartTime;
    const repEndTime = timestamp;
    const duration = repEndTime - repStartTime;

    // Calculate metrics
    const repVelocities = this.velocityHistory.filter(
      v => v.time >= repStartTime && v.time <= repEndTime
    );
    const repHeights = this.heightHistory.filter(
      h => h.time >= repStartTime && h.time <= repEndTime
    );
    const repAngles = this.angleHistory.filter(
      a => a.time >= repStartTime && a.time <= repEndTime
    );

    const peakVelocity = Math.max(...repVelocities.map(v => v.velocity));
    const meanVelocity = repVelocities.reduce((sum, v) => sum + v.velocity, 0) / repVelocities.length;
    const peakHeight = Math.max(...repHeights.map(h => h.height));

    // Find lockout duration
    const lockoutPhase = this.phaseHistory.find(p => p.phase === SnatchPhase.LOCKOUT);
    const lockoutTime = lockoutPhase ? lockoutPhase.endTime - lockoutPhase.startTime : 0;

    // Calculate joint angle extremes
    const jointAngles = {
      maxShoulderAbduction: Math.max(...repAngles.map(a => 
        this.currentHand === 'left' ? a.angles.leftShoulderAbduction : a.angles.rightShoulderAbduction
      )),
      maxElbowAngle: Math.max(...repAngles.map(a =>
        this.currentHand === 'left' ? a.angles.leftElbow : a.angles.rightElbow
      )),
      minHipAngle: Math.min(...repAngles.map(a =>
        this.currentHand === 'left' ? a.angles.leftHip : a.angles.rightHip
      )),
      lockoutShoulderAngle: lockoutPhase && repAngles.length > 0
        ? repAngles[repAngles.length - 1].angles[this.currentHand === 'left' ? 'leftShoulderAbduction' : 'rightShoulderAbduction']
        : 0,
    };

    // Calculate power (estimated)
    // Power = Work / Time = (Force * Distance) / Time = (m * g * h) / t
    // Using velocity-based estimate: P = F * v ≈ m * a * v
    const power = this.calculatePower(peakVelocity, meanVelocity, duration);

    this.repCounter++;

    const repData: RepData = {
      repNumber: this.repCounter,
      startTime: repStartTime,
      endTime: repEndTime,
      duration,
      peakVelocity,
      meanVelocity,
      peakHeight,
      lockoutTime,
      phases: this.phaseHistory.map(p => ({
        phase: p.phase,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: p.endTime - p.startTime,
      })),
      jointAngles,
      power,
      hand: this.currentHand,
    };

    this.currentSetReps.push(repData);
    this.lastRepEndTime = repEndTime;

    // Check fatigue
    this.checkFatigue(repData);

    // Update baseline (first 3 reps)
    if (this.baselineVelocities.length < 3) {
      this.baselineVelocities.push(peakVelocity);
      this.baselinePowers.push(power);
    }

    // Reset for next rep
    this.repInProgress = false;
    this.phaseHistory = [];

    // Notify callbacks
    for (const callback of this.repCallbacks) {
      callback(repData);
    }
  }

  private finalizeSet(): void {
    if (this.currentSetReps.length < this.config.setDetection.minRepsForSet) {
      this.currentSetReps = [];
      return;
    }

    this.setCounter++;
    const reps = [...this.currentSetReps];
    const endTime = this.lastRepEndTime;

    // Calculate set metrics
    const velocities = reps.map(r => r.peakVelocity);
    const powers = reps.map(r => r.power);
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const peakVel = Math.max(...velocities);
    const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;

    // Velocity dropoff: compare last rep to first rep
    const firstRepVel = velocities[0];
    const lastRepVel = velocities[velocities.length - 1];
    const velocityDropoff = ((firstRepVel - lastRepVel) / firstRepVel) * 100;

    // Fatigue factor: weighted combination of velocity and power drop
    const fatigueFactor = Math.min(1, Math.max(0, velocityDropoff / 50 + 
      (powers[0] - powers[powers.length - 1]) / powers[0] / 2));

    const setData: SetData = {
      setNumber: this.setCounter,
      startTime: this.currentSetStartTime,
      endTime,
      duration: endTime - this.currentSetStartTime,
      hand: this.currentHand,
      reps,
      totalReps: reps.length,
      averageVelocity: avgVelocity,
      peakVelocity: peakVel,
      velocityDropoff,
      averagePower: avgPower,
      fatigueFactor,
      kettlebellWeight: this.config.kettlebellWeight,
    };

    this.sets.push(setData);
    this.currentSetReps = [];
    this.baselineVelocities = [];
    this.baselinePowers = [];

    // Notify callbacks
    for (const callback of this.setCallbacks) {
      callback(setData);
    }
  }

  private calculatePower(peakVelocity: number, meanVelocity: number, duration: number): number {
    const mass = this.config.kettlebellWeight;
    const g = 9.81;
    
    // Estimate vertical displacement from velocity profile
    // Using kinematic equations with average velocity
    const estimatedHeight = meanVelocity * (duration / 1000) * 0.5; // Rough estimate
    
    // Power = Work / Time = mgh / t
    // Also factor in kinetic energy: 0.5 * m * v^2
    const potentialWork = mass * g * Math.abs(estimatedHeight);
    const kineticWork = 0.5 * mass * (peakVelocity ** 2);
    
    const totalWork = potentialWork + kineticWork;
    const power = totalWork / (duration / 1000);
    
    return Math.round(power);
  }

  private checkFatigue(rep: RepData): void {
    if (this.baselineVelocities.length < 3) return;

    const baselineVel = this.baselineVelocities.reduce((a, b) => a + b, 0) / this.baselineVelocities.length;
    const baselinePower = this.baselinePowers.reduce((a, b) => a + b, 0) / this.baselinePowers.length;

    const velocityDrop = ((baselineVel - rep.peakVelocity) / baselineVel) * 100;
    const powerDrop = ((baselinePower - rep.power) / baselinePower) * 100;

    const { fatigueThresholds } = this.config;

    // Check velocity drop
    if (velocityDrop >= fatigueThresholds.velocityDropCritical) {
      this.emitFatigueAlert({
        timestamp: rep.endTime,
        setNumber: this.setCounter + 1,
        repNumber: rep.repNumber,
        type: 'velocity_drop',
        message: `Critical velocity drop: ${velocityDrop.toFixed(1)}% below baseline`,
        severity: 'critical',
        velocityDropPercent: velocityDrop,
      });
    } else if (velocityDrop >= fatigueThresholds.velocityDropWarning) {
      this.emitFatigueAlert({
        timestamp: rep.endTime,
        setNumber: this.setCounter + 1,
        repNumber: rep.repNumber,
        type: 'velocity_drop',
        message: `Velocity dropping: ${velocityDrop.toFixed(1)}% below baseline`,
        severity: 'warning',
        velocityDropPercent: velocityDrop,
      });
    }

    // Check power drop
    if (powerDrop >= fatigueThresholds.powerDropCritical) {
      this.emitFatigueAlert({
        timestamp: rep.endTime,
        setNumber: this.setCounter + 1,
        repNumber: rep.repNumber,
        type: 'power_drop',
        message: `Critical power drop: ${powerDrop.toFixed(1)}% below baseline`,
        severity: 'critical',
      });
    } else if (powerDrop >= fatigueThresholds.powerDropWarning) {
      this.emitFatigueAlert({
        timestamp: rep.endTime,
        setNumber: this.setCounter + 1,
        repNumber: rep.repNumber,
        type: 'power_drop',
        message: `Power dropping: ${powerDrop.toFixed(1)}% below baseline`,
        severity: 'warning',
      });
    }
  }

  private emitFatigueAlert(alert: FatigueAlert): void {
    this.fatigueAlerts.push(alert);
    for (const callback of this.fatigueCallbacks) {
      callback(alert);
    }
  }

  private getPeakVelocityInPhase(): number {
    const phaseVelocities = this.velocityHistory.filter(
      v => v.time >= this.phaseStartTime
    );
    return phaseVelocities.length > 0 
      ? Math.max(...phaseVelocities.map(v => v.velocity))
      : 0;
  }

  private getPhaseDuration(currentTime: number): number {
    return currentTime - this.phaseStartTime;
  }

  getSessionData(endTime: number = performance.now()): SessionData {
    const allReps = this.sets.flatMap(s => s.reps);
    const allVelocities = allReps.map(r => r.peakVelocity);
    const allPowers = allReps.map(r => r.power);

    return {
      sessionId: `session_${this.sessionStartTime}`,
      startTime: this.sessionStartTime,
      endTime,
      duration: endTime - this.sessionStartTime,
      kettlebellWeight: this.config.kettlebellWeight,
      sets: [...this.sets],
      totalReps: allReps.length,
      totalSets: this.sets.length,
      averageVelocity: allVelocities.length > 0 
        ? allVelocities.reduce((a, b) => a + b, 0) / allVelocities.length 
        : 0,
      peakVelocity: allVelocities.length > 0 ? Math.max(...allVelocities) : 0,
      averagePower: allPowers.length > 0
        ? allPowers.reduce((a, b) => a + b, 0) / allPowers.length
        : 0,
      totalWork: allPowers.reduce((sum, p, i) => 
        sum + p * (allReps[i].duration / 1000), 0),
      fatigueAlerts: [...this.fatigueAlerts],
    };
  }

  // Callback registration
  onRep(callback: RepCallback): () => void {
    this.repCallbacks.push(callback);
    return () => {
      const idx = this.repCallbacks.indexOf(callback);
      if (idx !== -1) this.repCallbacks.splice(idx, 1);
    };
  }

  onSet(callback: SetCallback): () => void {
    this.setCallbacks.push(callback);
    return () => {
      const idx = this.setCallbacks.indexOf(callback);
      if (idx !== -1) this.setCallbacks.splice(idx, 1);
    };
  }

  onPhaseChange(callback: PhaseCallback): () => void {
    this.phaseCallbacks.push(callback);
    return () => {
      const idx = this.phaseCallbacks.indexOf(callback);
      if (idx !== -1) this.phaseCallbacks.splice(idx, 1);
    };
  }

  onFatigue(callback: FatigueCallback): () => void {
    this.fatigueCallbacks.push(callback);
    return () => {
      const idx = this.fatigueCallbacks.indexOf(callback);
      if (idx !== -1) this.fatigueCallbacks.splice(idx, 1);
    };
  }

  // Getters
  getCurrentPhase(): SnatchPhase {
    return this.currentPhase;
  }

  getCurrentSetReps(): RepData[] {
    return [...this.currentSetReps];
  }

  getConfig(): SnatchDetectorConfig {
    return { ...this.config };
  }

  setKettlebellWeight(weight: number): void {
    this.config.kettlebellWeight = weight;
  }

  switchHand(hand: 'left' | 'right'): void {
    // Finalize current set before switching
    if (this.currentSetReps.length > 0) {
      this.finalizeSet();
    }
    this.currentHand = hand;
    this.currentSetStartTime = performance.now();
  }

  isRepInProgress(): boolean {
    return this.repInProgress;
  }
}
