# Overdue Calculation - Complete Explanation

## Step-by-Step Calculation Process

### 1. Starting Point: Opening Balance
- **Source**: Uploaded via "Upload Balance" button
- **Stored in**: `dealers.opening_balance`
- **Example**: Opening Balance = 100,000

### 2. Daily Transactions Collection

#### Sales (Uploaded via "Upload Sales")
- **Stored in**: `daily_sales` table
- **Columns**: `dealer_code`, `transaction_date`, `sales_amount`, `sales_quantity`
- **Example**: 
  - Day 1: Sales = 50,000
  - Day 2: Sales = 20,000

#### Collections (Uploaded via "Upload Collection")
- **Stored in**: `daily_collections` table
- **Columns**: `dealer_code`, `transaction_date`, `collection_amount`
- **Example**:
  - Day 1: Collection = 30,000
  - Day 2: Collection = 40,000

### 3. Calculate Closing Balance (Day-by-Day)

**Formula**: `Closing Balance = Opening Balance + Sales - Collection`

**Process**:
1. Start with Opening Balance
2. For each date in the range (sorted chronologically):
   - **Opening Balance (for the day)** = Previous Day's Closing Balance
   - **Daily Sales** = Sum of all `sales_amount` for that date
   - **Daily Collection** = Sum of all `collection_amount` for that date
   - **Closing Balance** = Opening + Sales - Collection
3. Final Closing Balance = Last day's closing balance

**Example Calculation**:
```
Day 1:
  Opening = 100,000
  Sales = 50,000
  Collection = 30,000
  Closing = 100,000 + 50,000 - 30,000 = 120,000

Day 2:
  Opening = 120,000 (previous day's closing)
  Sales = 20,000
  Collection = 40,000
  Closing = 120,000 + 20,000 - 40,000 = 100,000

Final Closing Balance = 100,000
```

### 4. Calculate Overdue Amounts

After calculating the final closing balance, overdue is calculated using simple subtraction:

#### Lower Limit Overdue
**Formula**: `Lower Overdue = Closing Balance - Lower Limit`

**Business Rule**: 
- Checked on **FIRST DAY** of billing cycle
- **Positive value** = Violation (balance above lower limit on day 1)
- **Negative value** = No violation (balance below lower limit on day 1)

**Example**:
```
Closing Balance = 100,000
Lower Limit = 100,000
Lower Overdue = 100,000 - 100,000 = 0 (No violation)
```

**Another Example**:
```
Closing Balance = 90,000
Lower Limit = 100,000
Lower Overdue = 90,000 - 100,000 = -10,000 (No violation, below limit)
```

**Violation Example**:
```
Closing Balance = 120,000
Lower Limit = 100,000
Lower Overdue = 120,000 - 100,000 = 20,000 (VIOLATION - above limit on day 1)
```

#### Upper Limit Overdue
**Formula**: `Upper Overdue = Closing Balance - Upper Limit`

**Business Rule**:
- Monitored **DURING the entire cycle**
- **Positive value** = Violation (balance exceeded upper limit)
- **Negative value** = No violation (balance within upper limit)

**Example**:
```
Closing Balance = 100,000
Upper Limit = 150,000
Upper Overdue = 100,000 - 150,000 = -50,000 (No violation, within limit)
```

**Violation Example**:
```
Closing Balance = 200,000
Upper Limit = 150,000
Upper Overdue = 200,000 - 150,000 = 50,000 (VIOLATION - exceeded upper limit)
```

### 5. Store Results

The calculated values are stored in:
- `dealers.closing_balance` - Updated with final calculated balance
- `overdue_report` table:
  - `lower_limit_overdue` - Calculated lower overdue
  - `upper_limit_overdue` - Calculated upper overdue
  - `current_date` - Date of calculation
  - `year`, `month`, `days_into_month` - For reporting

### 6. Additional Monitoring: Close to Lower Limit

**Condition**: Dealer is close to lower limit in last week of cycle

**Formula**:
1. Check if current date is in last 7 days of billing cycle
2. Check if: `Lower Limit ≤ Closing Balance ≤ Lower Limit + Threshold`
   - Threshold = Minimum of (20% of Lower Limit) or 10,000

**Example**:
```
Lower Limit = 100,000
Closing Balance = 110,000
Threshold = min(100,000 * 0.2, 10,000) = min(20,000, 10,000) = 10,000

Check: 100,000 ≤ 110,000 ≤ 100,000 + 10,000
       100,000 ≤ 110,000 ≤ 110,000 ✓

If in last week of cycle → Flagged as "Close to Lower Limit"
```

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Upload Opening Balance                                  │
│    Opening Balance = 100,000                               │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Upload Daily Sales                                      │
│    Day 1: 50,000                                           │
│    Day 2: 20,000                                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Upload Daily Collections                                │
│    Day 1: 30,000                                           │
│    Day 2: 40,000                                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Calculate Balance (Day-by-Day)                          │
│    Day 1: 100,000 + 50,000 - 30,000 = 120,000              │
│    Day 2: 120,000 + 20,000 - 40,000 = 100,000              │
│    Final Closing Balance = 100,000                         │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Calculate Overdue                                       │
│    Lower Overdue = 100,000 - 100,000 = 0                   │
│    Upper Overdue = 100,000 - 150,000 = -50,000            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Store & Display                                         │
│    - Update dealers.closing_balance                        │
│    - Store in overdue_report table                         │
│    - Display in Overdue Report                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Points

1. **Opening Balance** is the starting point for all calculations
2. **Closing Balance** is calculated day-by-day: `Closing = Opening + Sales - Collection`
3. **Overdue** is calculated from final closing balance:
   - `Lower Overdue = Closing Balance - Lower Limit`
   - `Upper Overdue = Closing Balance - Upper Limit`
4. **Positive overdue** = Violation
5. **Negative overdue** = No violation
6. All calculations are stored in `dealer_balance_history` for audit trail

## Code Location

- **Balance Calculation**: `server/routes/overdue.js` - `/calculate-balance` endpoint (line ~1360)
- **Overdue Calculation**: `server/routes/overdue.js` - Lines ~1565-1567
- **Report Display**: `server/routes/overdue.js` - `/report` endpoint (line ~35)

