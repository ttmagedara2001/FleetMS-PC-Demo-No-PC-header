# GPS Coordinates and Telemetry Math

This document collects the known GPS coordinates used in examples and describes the math used to compute task completion and robot health (implemented in `src/utils/telemetryMath.js`).

**Example Robot Locations**

- R-001: (37.422033, -122.084095)
- R-002: (37.422210, -122.083850)
- R-003: (37.421920, -122.084500)
- R-004: (37.422600, -122.083950)

These values are taken from `src/examples/gps_payload_examples.json`.

**Devicetestuc workspace samples**

For quick map testing in the `devicetestuc` workspace, see `src/examples/devicetestuc_gps_samples.json` for sample payloads. Example entries include:

- `devicetestuc-R-101`: (37.422400, -122.084000) — Good battery (92%)
- `devicetestuc-R-102`: (37.422100, -122.083700) — Idle (58%)
- `devicetestuc-R-103`: (37.421800, -122.084200) — Moving (71%)
- `devicetestuc-R-104`: (37.422750, -122.083950) — Low battery (34%)
- `devicetestuc-R-105`: (37.422300, -122.084400) — Charging (16%)

**Robot Health (based on battery level)**

- Implementation: `computeRobotHealth(batteryPct)`
- Interpretation: battery percentage is mapped to a normalized health score and label.

Formula (KaTeX):

Inline: $health = \dfrac{battery_{pct}}{100}$

This yields a score in $[0,1]$. Labels (implementation thresholds):

- `Good`: $battery_{pct} \ge 70$ (score $\ge 0.70$)
- `Fair`: $40 \le battery_{pct} < 70$ (score $0.40$--$0.69$)
- `Low`: $15 \le battery_{pct} < 40$ (score $0.15$--$0.39$)
- `Critical`: $battery_{pct} < 15$ (score $< 0.15$)

Returned object fields: `{ score, label, pct }` where `score = battery_pct/100`.

**Task Completion**

The computation accepts multiple inputs and prefers explicit `task.progress` when provided.

1. If `task.progress` exists, use it directly (0-100).

2. Distance-based completion (if `initialDistance` and `remainingDistance` available):

Formula: $$completion = 1 - \frac{remainingDistance}{initialDistance}$$

This yields a fractional completion in $[0,1]$ which is converted to percentage.

3. Steps-based completion (if `stepsCompleted` and `totalSteps` available):

Formula: $$stepsScore = \frac{stepsCompleted}{totalSteps}$$

4. When both distance and steps info are available, a weighted combination is used:

Formula: $$completion = 0.7 \cdot distanceScore + 0.3 \cdot stepsScore$$

This combined fractional completion is converted to a percentage (0-100).

Implementation note: see `src/utils/telemetryMath.js` for exact behavior and fallbacks.

**Files changed / added**

- `src/utils/telemetryMath.js` — new utility implementing the formulas above.
- `src/components/dashboard/RobotFleetPanel.jsx` — updated to display robot health (label + percent) computed from battery, and to compute task completion using the new utility.

**How to test quickly**

1. Run the app as you normally do (e.g., `npm run dev` for Vite setups).
2. Open the dashboard and observe robot cards: the battery metric will now show a percent and health label (Good/Fair/Low/Critical).
3. If tasks provide `progress`, `initialDistance`/`remainingDistance`, or `stepsCompleted`/`totalSteps`, the task progress bar will reflect the computed completion.
