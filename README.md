# Kettlebell Snatch Rep Detector

A real-time velocity-based training (VBT) analysis system for kettlebell snatches using camera-based pose detection. Built with SvelteKit, MediaPipe, and Kalman filtering for accurate joint angle and velocity tracking.

## Features

### Core Capabilities
- **Real-time Pose Detection**: Uses MediaPipe Pose for accurate body landmark tracking
- **Kalman Filtering**: Smooths position and velocity data for reliable metrics
- **Phase Detection**: Automatically identifies snatch phases (backswing, hike, pull, punch, lockout, drop, return)
- **Rep & Set Counting**: Automatic detection of rep start/end and set boundaries
- **Velocity Tracking**: Peak and mean velocity for each rep with trend analysis
- **Power Calculation**: Estimated power output based on kettlebell weight and movement velocity
- **Fatigue Monitoring**: Alerts when velocity or power drops below configurable thresholds
- **Joint Angle Tracking**: Real-time monitoring of shoulder, elbow, hip, knee, and spine angles

### Metrics Tracked
- Peak velocity per rep
- Mean velocity per rep
- Velocity dropoff (fatigue indicator)
- Power output (watts)
- Total work (joules)
- Lockout time
- Rep duration
- Joint angles at key positions

### Export Options
- **CSV Export**: Full session data with reps, sets, and fatigue alerts
- **JSON Export**: Raw session data for further analysis
- **Notion Integration**: Direct export to Notion database for tracking

## Installation

```bash
# Clone or extract the project
cd kettlebell-snatch-detector

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Usage

### Getting Started

1. **Grant Camera Access**: The app requires camera permission to detect poses
2. **Position Camera**: Place your device where it can see your full body during the snatch movement
3. **Set Kettlebell Weight**: Configure your KB weight in settings for accurate power calculations
4. **Choose Dominant Hand**: Select left/right or let the app auto-detect
5. **Start Session**: Click "Start Session" and begin your snatches

### During Training

- The app automatically detects each rep based on the snatch movement pattern
- Watch the **phase indicator** to see which phase you're in
- Monitor **velocity** to ensure quality reps
- Check **velocity dropoff** to gauge fatigue
- Listen for **audio alerts** when fatigue thresholds are exceeded

### Understanding the Metrics

#### Velocity
- Measured in normalized units (position change per frame)
- Higher velocity = more explosive movement
- Track velocity dropoff to know when to stop a set

#### Power
- Estimated using: `P = (m × g × h + 0.5 × m × v²) / t`
- Accounts for both potential and kinetic energy
- Useful for comparing training intensity across sessions

#### Fatigue Alerts
- **Warning** (yellow): 15% velocity drop from baseline (configurable)
- **Critical** (red): 25% velocity drop from baseline (configurable)
- Baseline is calculated from first 3 reps of each set

### Snatch Phases

| Phase | Description |
|-------|-------------|
| IDLE | Standing ready position |
| BACKSWING | Kettlebell between legs, hip hinge |
| HIKE | Initial pull from backswing |
| PULL | Explosive hip extension, KB ascending |
| PUNCH | Hand insertion at apex |
| LOCKOUT | Full overhead extension |
| DROP | Controlled descent |
| RETURN | Transition back to backswing |

## Configuration

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Kettlebell Weight | Weight in kg for power calculations | 16 |
| Dominant Hand | Left, Right, or Auto-detect | Auto |
| Warning Threshold | Velocity drop % for warning | 15% |
| Critical Threshold | Velocity drop % for critical alert | 25% |
| Sound Effects | Audio feedback for reps/alerts | On |
| Vibration | Haptic feedback (mobile) | On |
| Show Skeleton | Display pose overlay | On |
| Velocity Graph | Show real-time velocity chart | On |

### Notion Integration

1. Create a Notion Integration at https://www.notion.so/my-integrations
2. Create a database with these properties:
   - Name (title)
   - Date (date)
   - Duration (number)
   - KB Weight (number)
   - Total Sets (number)
   - Total Reps (number)
   - Avg Velocity (number)
   - Peak Velocity (number)
   - Avg Power (number)
   - Total Work (number)
   - Fatigue Alerts (number)
3. Share the database with your integration
4. Enter the API key and Database ID in settings

## Technical Architecture

### Kalman Filter

The app uses 1D constant-velocity Kalman filters for:
- **Position tracking**: Smooths noisy pose landmark positions
- **Velocity estimation**: Derives velocity from position updates
- **Angle filtering**: Reduces jitter in joint angle measurements

```
State: [position, velocity]
Measurement: position only
Process model: x_new = x + v*dt, v_new = v
```

### Phase Detection Algorithm

1. Monitors wrist position and velocity relative to body landmarks
2. Uses thresholds for vertical velocity and height ratios
3. Tracks phase transitions with hysteresis to prevent flickering
4. Requires minimum phase durations before transitions

### Power Estimation

```
Power = Work / Time
Work = Potential Energy + Kinetic Energy
     = m*g*h + 0.5*m*v²

Where:
  m = kettlebell mass (kg)
  g = 9.81 m/s²
  h = estimated vertical displacement
  v = peak velocity
```

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

Requires:
- Camera access (getUserMedia API)
- WebGL (for MediaPipe)
- ES2020+ JavaScript support

## Mobile Usage

The app is designed to work on smartphones:
- Landscape orientation recommended for better body tracking
- Use a tripod or stable phone mount
- Ensure good lighting for pose detection
- Enable vibration for haptic feedback

## Troubleshooting

### Camera Not Working
- Check browser permissions for camera access
- Ensure no other app is using the camera
- Try a different browser

### Poor Tracking
- Improve lighting in your workout area
- Wear contrasting clothing
- Ensure full body is visible in frame
- Move camera further back if needed

### Reps Not Counting
- Complete full range of motion (backswing to lockout)
- Move at moderate speed (very slow movements may not register)
- Check that the correct dominant hand is selected

## License

MIT License - See LICENSE file for details.

## Credits

- MediaPipe Pose by Google
- SvelteKit by Svelte team
- Built for Essential Fitness kettlebell training programs
