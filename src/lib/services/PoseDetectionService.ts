/**
 * Pose Detection Service using MediaPipe Pose
 * 
 * Handles camera access, pose estimation, and landmark extraction
 */

import { KalmanFilter3D, AngleKalmanFilter } from '../filters/KalmanFilter';

// MediaPipe Pose Landmark indices
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface FilteredLandmark extends Landmark {
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  speed: number;
}

export interface JointAngles {
  leftElbow: number;
  rightElbow: number;
  leftShoulder: number;
  rightShoulder: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  spine: number;
  leftShoulderAbduction: number;
  rightShoulderAbduction: number;
}

export interface PoseFrame {
  timestamp: number;
  landmarks: Landmark[];
  filteredLandmarks: FilteredLandmark[];
  jointAngles: JointAngles;
  dominantHand: 'left' | 'right';
  wristPosition: FilteredLandmark;
  wristSpeed: number;
  shoulderHeight: number;
  hipHeight: number;
}

export interface PoseServiceConfig {
  modelComplexity?: 0 | 1 | 2;
  smoothLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  dominantHand?: 'left' | 'right' | 'auto';
}

type PoseCallback = (frame: PoseFrame) => void;

export class PoseDetectionService {
  private pose: any = null;
  private camera: any = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private isRunning = false;
  private config: PoseServiceConfig;
  private callbacks: PoseCallback[] = [];
  
  // Kalman filters for each landmark
  private landmarkFilters: Map<number, KalmanFilter3D> = new Map();
  private angleFilters: Map<string, AngleKalmanFilter> = new Map();
  
  // Dominant hand detection
  private dominantHand: 'left' | 'right' = 'right';
  private handActivityCount = { left: 0, right: 0 };

  constructor(config: PoseServiceConfig = {}) {
    this.config = {
      modelComplexity: config.modelComplexity ?? 1,
      smoothLandmarks: config.smoothLandmarks ?? true,
      minDetectionConfidence: config.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
      dominantHand: config.dominantHand ?? 'auto',
    };
    
    this.initializeFilters();
  }

  private initializeFilters(): void {
    // Initialize Kalman filters for key landmarks
    const keyLandmarks = [
      POSE_LANDMARKS.LEFT_WRIST,
      POSE_LANDMARKS.RIGHT_WRIST,
      POSE_LANDMARKS.LEFT_ELBOW,
      POSE_LANDMARKS.RIGHT_ELBOW,
      POSE_LANDMARKS.LEFT_SHOULDER,
      POSE_LANDMARKS.RIGHT_SHOULDER,
      POSE_LANDMARKS.LEFT_HIP,
      POSE_LANDMARKS.RIGHT_HIP,
      POSE_LANDMARKS.LEFT_KNEE,
      POSE_LANDMARKS.RIGHT_KNEE,
    ];

    for (const idx of keyLandmarks) {
      this.landmarkFilters.set(idx, new KalmanFilter3D({
        processNoise: 0.1,
        measurementNoise: 0.3,
      }));
    }

    // Initialize angle filters
    const angleNames = [
      'leftElbow', 'rightElbow',
      'leftShoulder', 'rightShoulder',
      'leftHip', 'rightHip',
      'leftKnee', 'rightKnee',
      'spine', 'leftShoulderAbduction', 'rightShoulderAbduction'
    ];

    for (const name of angleNames) {
      this.angleFilters.set(name, new AngleKalmanFilter({
        processNoise: 0.05,
        measurementNoise: 0.2,
      }));
    }
  }

  async initialize(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement
  ): Promise<void> {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.canvasCtx = canvasElement.getContext('2d');

    // Dynamically import MediaPipe
    const { Pose } = await import('@mediapipe/pose');
    const { Camera } = await import('@mediapipe/camera_utils');

    this.pose = new Pose({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    this.pose.setOptions({
      modelComplexity: this.config.modelComplexity,
      smoothLandmarks: this.config.smoothLandmarks,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
    });

    this.pose.onResults((results: any) => this.onPoseResults(results));

    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        if (this.isRunning && this.pose) {
          await this.pose.send({ image: videoElement });
        }
      },
      width: 1280,
      height: 720,
    });
  }

  async start(): Promise<void> {
    if (!this.camera) {
      throw new Error('PoseDetectionService not initialized. Call initialize() first.');
    }
    this.isRunning = true;
    await this.camera.start();
  }

  stop(): void {
    this.isRunning = false;
    if (this.camera) {
      this.camera.stop();
    }
  }

  onPose(callback: PoseCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx !== -1) {
        this.callbacks.splice(idx, 1);
      }
    };
  }

  private onPoseResults(results: any): void {
    if (!results.poseLandmarks || !this.canvasCtx || !this.canvasElement) {
      return;
    }

    const timestamp = performance.now();
    const landmarks: Landmark[] = results.poseLandmarks.map((lm: any) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 0,
    }));

    // Apply Kalman filtering to key landmarks
    const filteredLandmarks = this.filterLandmarks(landmarks, timestamp);
    
    // Calculate joint angles
    const jointAngles = this.calculateJointAngles(landmarks, timestamp);
    
    // Detect dominant hand
    this.detectDominantHand(filteredLandmarks);
    
    // Get wrist data based on dominant hand
    const wristIdx = this.dominantHand === 'left' 
      ? POSE_LANDMARKS.LEFT_WRIST 
      : POSE_LANDMARKS.RIGHT_WRIST;
    const wristPosition = filteredLandmarks[wristIdx];
    
    // Calculate shoulder and hip heights for reference
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
    
    const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;
    const hipHeight = (leftHip.y + rightHip.y) / 2;

    const frame: PoseFrame = {
      timestamp,
      landmarks,
      filteredLandmarks,
      jointAngles,
      dominantHand: this.dominantHand,
      wristPosition,
      wristSpeed: wristPosition.speed,
      shoulderHeight,
      hipHeight,
    };

    // Draw visualization
    this.drawPose(results, frame);

    // Notify callbacks
    for (const callback of this.callbacks) {
      callback(frame);
    }
  }

  private filterLandmarks(landmarks: Landmark[], timestamp: number): FilteredLandmark[] {
    return landmarks.map((lm, idx) => {
      const filter = this.landmarkFilters.get(idx);
      
      if (filter && lm.visibility > 0.5) {
        const result = filter.update(
          { x: lm.x, y: lm.y, z: lm.z },
          timestamp
        );
        
        return {
          ...lm,
          x: result.position.x,
          y: result.position.y,
          z: result.position.z,
          velocityX: result.velocity.x,
          velocityY: result.velocity.y,
          velocityZ: result.velocity.z,
          speed: Math.sqrt(
            result.velocity.x ** 2 + 
            result.velocity.y ** 2 + 
            result.velocity.z ** 2
          ),
        };
      }
      
      return {
        ...lm,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0,
        speed: 0,
      };
    });
  }

  private calculateJointAngles(landmarks: Landmark[], timestamp: number): JointAngles {
    const calcAngle = (a: Landmark, b: Landmark, c: Landmark): number => {
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let angle = Math.abs((radians * 180) / Math.PI);
      if (angle > 180) angle = 360 - angle;
      return angle;
    };

    const filterAngle = (name: string, rawAngle: number): number => {
      const filter = this.angleFilters.get(name);
      if (filter) {
        return filter.update(rawAngle, timestamp).angle;
      }
      return rawAngle;
    };

    // Calculate raw angles
    const rawAngles = {
      leftElbow: calcAngle(
        landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
        landmarks[POSE_LANDMARKS.LEFT_ELBOW],
        landmarks[POSE_LANDMARKS.LEFT_WRIST]
      ),
      rightElbow: calcAngle(
        landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
        landmarks[POSE_LANDMARKS.RIGHT_ELBOW],
        landmarks[POSE_LANDMARKS.RIGHT_WRIST]
      ),
      leftShoulder: calcAngle(
        landmarks[POSE_LANDMARKS.LEFT_ELBOW],
        landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
        landmarks[POSE_LANDMARKS.LEFT_HIP]
      ),
      rightShoulder: calcAngle(
        landmarks[POSE_LANDMARKS.RIGHT_ELBOW],
        landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
        landmarks[POSE_LANDMARKS.RIGHT_HIP]
      ),
      leftHip: calcAngle(
        landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
        landmarks[POSE_LANDMARKS.LEFT_HIP],
        landmarks[POSE_LANDMARKS.LEFT_KNEE]
      ),
      rightHip: calcAngle(
        landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
        landmarks[POSE_LANDMARKS.RIGHT_HIP],
        landmarks[POSE_LANDMARKS.RIGHT_KNEE]
      ),
      leftKnee: calcAngle(
        landmarks[POSE_LANDMARKS.LEFT_HIP],
        landmarks[POSE_LANDMARKS.LEFT_KNEE],
        landmarks[POSE_LANDMARKS.LEFT_ANKLE]
      ),
      rightKnee: calcAngle(
        landmarks[POSE_LANDMARKS.RIGHT_HIP],
        landmarks[POSE_LANDMARKS.RIGHT_KNEE],
        landmarks[POSE_LANDMARKS.RIGHT_ANKLE]
      ),
      spine: this.calculateSpineAngle(landmarks),
      leftShoulderAbduction: this.calculateShoulderAbduction(landmarks, 'left'),
      rightShoulderAbduction: this.calculateShoulderAbduction(landmarks, 'right'),
    };

    // Apply Kalman filtering to angles
    return {
      leftElbow: filterAngle('leftElbow', rawAngles.leftElbow),
      rightElbow: filterAngle('rightElbow', rawAngles.rightElbow),
      leftShoulder: filterAngle('leftShoulder', rawAngles.leftShoulder),
      rightShoulder: filterAngle('rightShoulder', rawAngles.rightShoulder),
      leftHip: filterAngle('leftHip', rawAngles.leftHip),
      rightHip: filterAngle('rightHip', rawAngles.rightHip),
      leftKnee: filterAngle('leftKnee', rawAngles.leftKnee),
      rightKnee: filterAngle('rightKnee', rawAngles.rightKnee),
      spine: filterAngle('spine', rawAngles.spine),
      leftShoulderAbduction: filterAngle('leftShoulderAbduction', rawAngles.leftShoulderAbduction),
      rightShoulderAbduction: filterAngle('rightShoulderAbduction', rawAngles.rightShoulderAbduction),
    };
  }

  private calculateSpineAngle(landmarks: Landmark[]): number {
    const midShoulder = {
      x: (landmarks[POSE_LANDMARKS.LEFT_SHOULDER].x + landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].x) / 2,
      y: (landmarks[POSE_LANDMARKS.LEFT_SHOULDER].y + landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].y) / 2,
    };
    const midHip = {
      x: (landmarks[POSE_LANDMARKS.LEFT_HIP].x + landmarks[POSE_LANDMARKS.RIGHT_HIP].x) / 2,
      y: (landmarks[POSE_LANDMARKS.LEFT_HIP].y + landmarks[POSE_LANDMARKS.RIGHT_HIP].y) / 2,
    };
    
    // Angle from vertical (90 = upright)
    const angle = Math.atan2(midShoulder.x - midHip.x, midHip.y - midShoulder.y);
    return 90 - (angle * 180) / Math.PI;
  }

  private calculateShoulderAbduction(landmarks: Landmark[], side: 'left' | 'right'): number {
    const shoulderIdx = side === 'left' ? POSE_LANDMARKS.LEFT_SHOULDER : POSE_LANDMARKS.RIGHT_SHOULDER;
    const elbowIdx = side === 'left' ? POSE_LANDMARKS.LEFT_ELBOW : POSE_LANDMARKS.RIGHT_ELBOW;
    const hipIdx = side === 'left' ? POSE_LANDMARKS.LEFT_HIP : POSE_LANDMARKS.RIGHT_HIP;
    
    const shoulder = landmarks[shoulderIdx];
    const elbow = landmarks[elbowIdx];
    const hip = landmarks[hipIdx];
    
    // Vector from shoulder to elbow
    const armVec = { x: elbow.x - shoulder.x, y: elbow.y - shoulder.y };
    // Vector from shoulder to hip (torso direction)
    const torsoVec = { x: hip.x - shoulder.x, y: hip.y - shoulder.y };
    
    // Calculate angle between arm and torso
    const dot = armVec.x * torsoVec.x + armVec.y * torsoVec.y;
    const magArm = Math.sqrt(armVec.x ** 2 + armVec.y ** 2);
    const magTorso = Math.sqrt(torsoVec.x ** 2 + torsoVec.y ** 2);
    
    if (magArm === 0 || magTorso === 0) return 0;
    
    const angle = Math.acos(Math.max(-1, Math.min(1, dot / (magArm * magTorso))));
    return (angle * 180) / Math.PI;
  }

  private detectDominantHand(filteredLandmarks: FilteredLandmark[]): void {
    if (this.config.dominantHand !== 'auto') {
      this.dominantHand = this.config.dominantHand;
      return;
    }

    const leftWrist = filteredLandmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = filteredLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
    
    // Track which hand is more active (higher speed)
    if (leftWrist.speed > rightWrist.speed + 0.05) {
      this.handActivityCount.left++;
    } else if (rightWrist.speed > leftWrist.speed + 0.05) {
      this.handActivityCount.right++;
    }
    
    // Update dominant hand based on cumulative activity
    if (this.handActivityCount.left > this.handActivityCount.right + 10) {
      this.dominantHand = 'left';
    } else if (this.handActivityCount.right > this.handActivityCount.left + 10) {
      this.dominantHand = 'right';
    }
  }

  private drawPose(results: any, frame: PoseFrame): void {
    if (!this.canvasCtx || !this.canvasElement || !this.videoElement) return;

    const ctx = this.canvasCtx;
    const canvas = this.canvasElement;

    // Clear and draw video frame
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Mirror the video for selfie view
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Draw connections
    const connections = [
      [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER],
      [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
      [POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
      [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
      [POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
      [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP],
      [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
      [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP],
      [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
      [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
      [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
      [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
    ];

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // Draw skeleton
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
    ctx.lineWidth = 3;

    for (const [startIdx, endIdx] of connections) {
      const start = frame.landmarks[startIdx];
      const end = frame.landmarks[endIdx];
      
      if (start.visibility > 0.5 && end.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
        ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
        ctx.stroke();
      }
    }

    // Draw landmarks
    for (let i = 0; i < frame.landmarks.length; i++) {
      const lm = frame.landmarks[i];
      if (lm.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(
          lm.x * canvas.width,
          lm.y * canvas.height,
          5,
          0,
          2 * Math.PI
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
      }
    }

    // Highlight dominant hand wrist
    const wristIdx = frame.dominantHand === 'left' 
      ? POSE_LANDMARKS.LEFT_WRIST 
      : POSE_LANDMARKS.RIGHT_WRIST;
    const wrist = frame.landmarks[wristIdx];
    
    if (wrist.visibility > 0.5) {
      ctx.beginPath();
      ctx.arc(
        wrist.x * canvas.width,
        wrist.y * canvas.height,
        12,
        0,
        2 * Math.PI
      );
      ctx.strokeStyle = '#FF6B35';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  resetFilters(): void {
    for (const filter of this.landmarkFilters.values()) {
      filter.reset();
    }
    for (const filter of this.angleFilters.values()) {
      filter.reset();
    }
  }

  setDominantHand(hand: 'left' | 'right'): void {
    this.dominantHand = hand;
    this.config.dominantHand = hand;
    this.handActivityCount = { left: 0, right: 0 };
  }

  getDominantHand(): 'left' | 'right' {
    return this.dominantHand;
  }
}
