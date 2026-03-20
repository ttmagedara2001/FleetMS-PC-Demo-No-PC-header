# Robot Fleet Implementation

## ✅ **Implementation Complete**

5 robots have been defined per device with full data retrieval for real-time and historical data.

---

## 📋 **Robot Registry**

### **deviceTestUC**
| Robot ID | Name | Type | Zone |
|----------|------|------|------|
| R-001 | Alpha | Transport | Zone A |
| R-002 | Beta | Inspection | Zone B |
| R-003 | Gamma | Assembly | Zone C |
| R-004 | Delta | Quality Control | Zone D |
| R-005 | Epsilon | Maintenance | Zone E |

### **device0011233**
| Robot ID | Name | Type | Zone |
|----------|------|------|------|
| R-101 | Orion | Transport | Sector 1 |
| R-102 | Nova | Inspection | Sector 2 |
| R-103 | Pulsar | Assembly | Sector 3 |
| R-104 | Quasar | Quality Control | Sector 4 |
| R-105 | Nebula | Maintenance | Sector 5 |

### **device9988**
| Robot ID | Name | Type | Zone |
|----------|------|------|------|
| R-201 | Atlas | Transport | Bay 1 |
| R-202 | Titan | Inspection | Bay 2 |
| R-203 | Helios | Assembly | Bay 3 |
| R-204 | Apollo | Quality Control | Bay 4 |
| R-205 | Zeus | Maintenance | Bay 5 |

---

## 🔧 **Files Created/Modified**

### **New Files**
- `src/config/robotRegistry.js` - Central robot definitions

### **Modified Files**
- `src/contexts/DeviceContext.jsx` - Robot state initialization
- `src/pages/Analysis.jsx` - Robot sensor chart

---

## 📊 **Data Flow Architecture**

### **Real-Time Data (WebSocket)**
```
IoT Devices
    ↓
MQTT Topics: fleetMS/robots/<robotID>/<sensor>
    ↓
WebSocket: /topic/stream/<deviceID>
    ↓
DeviceContext → currentRobots state
    ↓
Dashboard/Analysis pages
```

### **Historical Data (HTTP)**
```
User requests historical data
    ↓
HTTP POST /get-stream-data/device
    ↓
Filter by topics: fleetMS/robots/<robotID>/*
    ↓
Transform to chart data
    ↓
Analysis page chart display
```

### **Task Assignments (HTTP State)**
```
User assigns task
    ↓
HTTP POST /update-state-details
Topic: fleetMS/robots/<robotID>/task
    ↓
Backend stores state
    ↓
HTTP GET /get-state-details
    ↓
Task History table display
```

---

## 🎨 **Analysis Page - New Features**

### **Robot Sensor Data Chart**
- Bar chart showing Battery, Temperature, Humidity for all 5 robots
- Robot selector tabs for filtering
- Robot detail cards with individual sensor values
- Auto-refresh every 30 seconds

### **Task History Table**
- Shows assigned tasks from HTTP state
- Displays Task ID, Task Name, Robot ID, Status
- Auto-refresh every 30 seconds

---

## 📡 **MQTT Topic Structure**

### **Stream Topics (Real-time Sensor Data)**
```
fleetMS/robots/<robotID>/battery      → Battery percentage
fleetMS/robots/<robotID>/temperature  → Temperature °C
fleetMS/robots/<robotID>/humidity     → Humidity %
fleetMS/robots/<robotID>/location     → X, Y coordinates
fleetMS/robots/<robotID>/status       → Active/Idle/Charging/Error
```

### **State Topics (Persistent State)**
```
fleetMS/robots/<robotID>/task         → Current task assignment
fleetMS/robots/<robotID>/settings     → Robot configuration
```

---

## 🔄 **Auto-Refresh Behavior**

| Data Type | Interval | API Endpoint |
|-----------|----------|--------------|
| Environmental Sensors | 30s | `/get-stream-data/device` |
| Robot Sensor Data | 30s | `/get-stream-data/device` |
| Robot Task Data | 30s | `/get-state-details/device` |

---

## 📱 **Usage**

### **Access Robot Data in Components**
```javascript
import { useDevice } from '../contexts/DeviceContext';

function MyComponent() {
    const { currentRobots, selectedDeviceId } = useDevice();
    
    // currentRobots = {
    //   'R-001': { id: 'R-001', name: 'Alpha', battery: 85, ... },
    //   'R-002': { id: 'R-002', name: 'Beta', battery: 92, ... },
    //   ...
    // }
    
    return (
        <div>
            {Object.values(currentRobots).map(robot => (
                <RobotCard key={robot.id} robot={robot} />
            ))}
        </div>
    );
}
```

### **Get Robots for a Device**
```javascript
import { getRobotsForDevice } from '../config/robotRegistry';

const robots = getRobotsForDevice('deviceTestUC');
// Returns: [{ id: 'R-001', name: 'Alpha', ... }, ...]
```

### **Assign Task to Robot**
```javascript
import { assignTaskToRobot } from '../services/api';

await assignTaskToRobot(
    'deviceTestUC',
    'R-001',
    {
        taskId: 'TSK-001',
        taskName: 'Transport Material',
        location: 'Zone A → Zone B',
        priority: 'High',
        status: 'Assigned'
    }
);
```

---

## ✅ **Checklist**

- [x] Robot registry configuration created
- [x] 5 robots per device defined
- [x] DeviceContext updated with robot state
- [x] Robot sensor data chart added to Analysis
- [x] Real-time data flow configured (WebSocket)
- [x] Historical data flow configured (HTTP)
- [x] Task assignment API ready
- [x] Auto-refresh every 30 seconds
- [x] Robot detail cards with sensor values

---

## 🚀 **Ready to Use!**

The robot fleet implementation is complete. Navigate to the Analysis page to see:
1. **Historical Sensor Trends** - Environmental data chart
2. **Robot Sensor Data** - Bar chart with all 5 robots
3. **Robot Detail Cards** - Individual sensor values
4. **Task History** - Active task assignments

