# Achievement Percentage Calculation Logic

## Overview
The achievement percentage is calculated based on the **Effective Target** for each dealer-month combination.

## Effective Target Priority
The system uses the following priority to determine the effective target:

1. **Forecast Target** (if exists) - Monthly forecast targets override ABP targets
2. **ABP Target** (if no Forecast) - Annual Business Plan target for that month
3. **0** (if neither exists)

## Achievement Data
- **Source**: Sales Register file (aggregated by dealer, year, month)
- **Format**: Total amounts only (no category breakdown like ET, IPS, Solar, etc.)
- **Columns Used**:
  - Dealer Code
  - Order Date (to determine year/month)
  - Actual Invoice Amount (aggregated sum)

## Achievement Percentage Formula

```
Achievement % = (Achievement Amount / Effective Target) × 100
```

### Calculation Logic:
1. If **Forecast Target** exists and > 0:
   - `Achievement % = (Achievement / Forecast Target) × 100`

2. Else if **ABP Target** exists and > 0:
   - `Achievement % = (Achievement / ABP Target) × 100`

3. Else:
   - `Achievement % = 0`

## Example Scenarios

### Scenario 1: Forecast Exists
- ABP Target: 100,000
- Forecast Target: 120,000
- Achievement: 110,000
- **Effective Target**: 120,000 (Forecast)
- **Achievement %**: (110,000 / 120,000) × 100 = **91.67%**

### Scenario 2: Only ABP Exists
- ABP Target: 100,000
- Forecast Target: NULL
- Achievement: 95,000
- **Effective Target**: 100,000 (ABP)
- **Achievement %**: (95,000 / 100,000) × 100 = **95.00%**

### Scenario 3: No Target
- ABP Target: NULL
- Forecast Target: NULL
- Achievement: 50,000
- **Effective Target**: 0
- **Achievement %**: **0%** (cannot calculate without target)

## Notes
- Achievements are **aggregated totals** - no category-level breakdown
- The percentage is calculated **per dealer per month**
- Forecast targets **always override** ABP targets when both exist
- If target is 0, percentage is set to 0 (to avoid division by zero)

