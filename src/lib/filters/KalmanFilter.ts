/**
 * Kalman Filter Implementation for Position and Velocity Tracking
 * 
 * Uses a 1D constant velocity model for each dimension (x, y, z)
 * State vector: [position, velocity]
 * Measurement: position only
 */

export interface KalmanState {
  position: number;
  velocity: number;
  positionVariance: number;
  velocityVariance: number;
  covariance: number;
}

export interface KalmanConfig {
  processNoise: number;      // Q - how much we expect the system to change
  measurementNoise: number;  // R - how noisy our measurements are
  initialPositionVariance: number;
  initialVelocityVariance: number;
}

export class KalmanFilter1D {
  private state: KalmanState;
  private config: KalmanConfig;
  private lastTimestamp: number | null = null;

  constructor(config: Partial<KalmanConfig> = {}) {
    this.config = {
      processNoise: config.processNoise ?? 0.1,
      measurementNoise: config.measurementNoise ?? 0.5,
      initialPositionVariance: config.initialPositionVariance ?? 1.0,
      initialVelocityVariance: config.initialVelocityVariance ?? 1.0,
    };

    this.state = {
      position: 0,
      velocity: 0,
      positionVariance: this.config.initialPositionVariance,
      velocityVariance: this.config.initialVelocityVariance,
      covariance: 0,
    };
  }

  reset(initialPosition: number = 0): void {
    this.state = {
      position: initialPosition,
      velocity: 0,
      positionVariance: this.config.initialPositionVariance,
      velocityVariance: this.config.initialVelocityVariance,
      covariance: 0,
    };
    this.lastTimestamp = null;
  }

  /**
   * Predict step - advance the state based on the motion model
   */
  private predict(dt: number): void {
    const { processNoise } = this.config;
    const { position, velocity, positionVariance, velocityVariance, covariance } = this.state;

    // State transition: x_new = x + v*dt, v_new = v
    this.state.position = position + velocity * dt;
    // velocity stays the same in prediction

    // Covariance prediction with process noise
    // P = F * P * F^T + Q
    const dt2 = dt * dt;
    this.state.positionVariance = positionVariance + 2 * dt * covariance + dt2 * velocityVariance + processNoise * dt2;
    this.state.velocityVariance = velocityVariance + processNoise;
    this.state.covariance = covariance + dt * velocityVariance + processNoise * dt;
  }

  /**
   * Update step - incorporate a new measurement
   */
  update(measurement: number, timestamp: number): KalmanState {
    // Calculate dt
    let dt = 1 / 30; // Default to ~30fps if no previous timestamp
    if (this.lastTimestamp !== null) {
      dt = (timestamp - this.lastTimestamp) / 1000; // Convert ms to seconds
      dt = Math.max(0.001, Math.min(dt, 0.5)); // Clamp dt to reasonable range
    }
    this.lastTimestamp = timestamp;

    // Predict
    this.predict(dt);

    const { measurementNoise } = this.config;
    const { position, velocity, positionVariance, velocityVariance, covariance } = this.state;

    // Kalman gain calculation
    // K = P * H^T * (H * P * H^T + R)^-1
    // H = [1, 0] for position-only measurement
    const innovation = measurement - position;
    const innovationVariance = positionVariance + measurementNoise;
    
    const kalmanGainPosition = positionVariance / innovationVariance;
    const kalmanGainVelocity = covariance / innovationVariance;

    // State update
    this.state.position = position + kalmanGainPosition * innovation;
    this.state.velocity = velocity + kalmanGainVelocity * innovation;

    // Covariance update
    // P = (I - K*H) * P
    this.state.positionVariance = (1 - kalmanGainPosition) * positionVariance;
    this.state.velocityVariance = velocityVariance - kalmanGainVelocity * covariance;
    this.state.covariance = (1 - kalmanGainPosition) * covariance;

    return { ...this.state };
  }

  getState(): KalmanState {
    return { ...this.state };
  }

  getPosition(): number {
    return this.state.position;
  }

  getVelocity(): number {
    return this.state.velocity;
  }
}

/**
 * 3D Kalman Filter for tracking position and velocity in 3D space
 */
export class KalmanFilter3D {
  private filterX: KalmanFilter1D;
  private filterY: KalmanFilter1D;
  private filterZ: KalmanFilter1D;

  constructor(config: Partial<KalmanConfig> = {}) {
    this.filterX = new KalmanFilter1D(config);
    this.filterY = new KalmanFilter1D(config);
    this.filterZ = new KalmanFilter1D(config);
  }

  reset(initialPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): void {
    this.filterX.reset(initialPosition.x);
    this.filterY.reset(initialPosition.y);
    this.filterZ.reset(initialPosition.z);
  }

  update(
    measurement: { x: number; y: number; z: number },
    timestamp: number
  ): {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
  } {
    const stateX = this.filterX.update(measurement.x, timestamp);
    const stateY = this.filterY.update(measurement.y, timestamp);
    const stateZ = this.filterZ.update(measurement.z, timestamp);

    return {
      position: {
        x: stateX.position,
        y: stateY.position,
        z: stateZ.position,
      },
      velocity: {
        x: stateX.velocity,
        y: stateY.velocity,
        z: stateZ.velocity,
      },
    };
  }

  getPosition(): { x: number; y: number; z: number } {
    return {
      x: this.filterX.getPosition(),
      y: this.filterY.getPosition(),
      z: this.filterZ.getPosition(),
    };
  }

  getVelocity(): { x: number; y: number; z: number } {
    return {
      x: this.filterX.getVelocity(),
      y: this.filterY.getVelocity(),
      z: this.filterZ.getVelocity(),
    };
  }

  getSpeed(): number {
    const vel = this.getVelocity();
    return Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  }
}

/**
 * Specialized filter for joint angle tracking
 */
export class AngleKalmanFilter {
  private filter: KalmanFilter1D;

  constructor(config: Partial<KalmanConfig> = {}) {
    this.filter = new KalmanFilter1D({
      processNoise: config.processNoise ?? 0.05,
      measurementNoise: config.measurementNoise ?? 0.3,
      ...config,
    });
  }

  reset(initialAngle: number = 0): void {
    this.filter.reset(initialAngle);
  }

  /**
   * Update with angle measurement, handling wraparound
   */
  update(angleDegrees: number, timestamp: number): { angle: number; angularVelocity: number } {
    const state = this.filter.update(angleDegrees, timestamp);
    return {
      angle: state.position,
      angularVelocity: state.velocity,
    };
  }

  getAngle(): number {
    return this.filter.getPosition();
  }

  getAngularVelocity(): number {
    return this.filter.getVelocity();
  }
}
