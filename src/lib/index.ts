// Filters
export { KalmanFilter1D, KalmanFilter3D, AngleKalmanFilter } from './filters/KalmanFilter';
export type { KalmanState, KalmanConfig } from './filters/KalmanFilter';

// Services
export { PoseDetectionService, POSE_LANDMARKS } from './services/PoseDetectionService';
export type { 
  Landmark, 
  FilteredLandmark, 
  JointAngles, 
  PoseFrame, 
  PoseServiceConfig 
} from './services/PoseDetectionService';

export { SnatchRepDetector, SnatchPhase } from './services/SnatchRepDetector';
export type { 
  RepData, 
  SetData, 
  SessionData, 
  FatigueAlert, 
  SnatchDetectorConfig 
} from './services/SnatchRepDetector';

export { DataExportService } from './services/DataExportService';
export type { NotionConfig, ExportOptions } from './services/DataExportService';

// Stores
export * from './stores';
