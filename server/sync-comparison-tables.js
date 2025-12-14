const db = require('./db');

console.log('Syncing comparison tables with existing data...');

// Sync ABP vs Achievement
const syncABPvsAchievement = `
  REPLACE INTO abp_vs_achievement 
  (dealer_code, dealer_name, territory_name, year, month, abp_target_amount, abp_target_quantity, achievement_amount, achievement_quantity, amount_percentage, quantity_percentage)
  SELECT 
    d.dealer_code,
    d.dealer_name,
    COALESCE(t.territory_name, 'N/A') as territory_name,
    COALESCE(abp.year, ach.year) as year,
    COALESCE(abp.month, ach.month) as month,
    COALESCE(abp.target_amount, 0) as abp_target_amount,
    COALESCE(abp.abp_quantity, 0) as abp_target_quantity,
    COALESCE(ach.achievement_amount, 0) as achievement_amount,
    COALESCE(ach.achievement_quantity, 0) as achievement_quantity,
    CASE 
      WHEN COALESCE(abp.target_amount, 0) > 0 THEN (COALESCE(ach.achievement_amount, 0) / abp.target_amount) * 100
      ELSE 0
    END as amount_percentage,
    CASE 
      WHEN COALESCE(abp.abp_quantity, 0) > 0 THEN (COALESCE(ach.achievement_quantity, 0) / abp.abp_quantity) * 100
      ELSE 0
    END as quantity_percentage
  FROM (
    SELECT DISTINCT dealer_code, year, month FROM abp_targets
    UNION
    SELECT DISTINCT dealer_code, year, month FROM achievements
  ) AS combined
  INNER JOIN dealers d ON d.dealer_code = combined.dealer_code
  LEFT JOIN territories t ON d.territory_id = t.id
  LEFT JOIN abp_targets abp ON d.dealer_code = abp.dealer_code 
    AND combined.year = abp.year AND combined.month = abp.month
  LEFT JOIN achievements ach ON d.dealer_code = ach.dealer_code 
    AND combined.year = ach.year AND combined.month = ach.month
`;

// Sync Forecast vs Achievement
const syncForecastVsAchievement = `
  REPLACE INTO forecast_vs_achievement 
  (dealer_code, dealer_name, territory_name, year, month, forecast_target_amount, forecast_target_quantity, achievement_amount, achievement_quantity, amount_percentage, quantity_percentage)
  SELECT 
    d.dealer_code,
    d.dealer_name,
    COALESCE(t.territory_name, 'N/A') as territory_name,
    COALESCE(fc.year, ach.year) as year,
    COALESCE(fc.month, ach.month) as month,
    COALESCE(fc.target_amount, 0) as forecast_target_amount,
    COALESCE(fc.forecast_quantity, 0) as forecast_target_quantity,
    COALESCE(ach.achievement_amount, 0) as achievement_amount,
    COALESCE(ach.achievement_quantity, 0) as achievement_quantity,
    CASE 
      WHEN COALESCE(fc.target_amount, 0) > 0 THEN (COALESCE(ach.achievement_amount, 0) / fc.target_amount) * 100
      ELSE 0
    END as amount_percentage,
    CASE 
      WHEN COALESCE(fc.forecast_quantity, 0) > 0 THEN (COALESCE(ach.achievement_quantity, 0) / fc.forecast_quantity) * 100
      ELSE 0
    END as quantity_percentage
  FROM (
    SELECT DISTINCT dealer_code, year, month FROM forecast_targets
    UNION
    SELECT DISTINCT dealer_code, year, month FROM achievements
  ) AS combined
  INNER JOIN dealers d ON d.dealer_code = combined.dealer_code
  LEFT JOIN territories t ON d.territory_id = t.id
  LEFT JOIN forecast_targets fc ON d.dealer_code = fc.dealer_code 
    AND combined.year = fc.year AND combined.month = fc.month
  LEFT JOIN achievements ach ON d.dealer_code = ach.dealer_code 
    AND combined.year = ach.year AND combined.month = ach.month
`;

db.query(syncABPvsAchievement, (err1) => {
  if (err1) {
    console.error('Error syncing ABP vs Achievement:', err1.message);
    process.exit(1);
  } else {
    console.log('✓ ABP vs Achievement synced successfully');
    
    db.query(syncForecastVsAchievement, (err2) => {
      if (err2) {
        console.error('Error syncing Forecast vs Achievement:', err2.message);
        process.exit(1);
      } else {
        console.log('✓ Forecast vs Achievement synced successfully');
        console.log('\nDone! Both tables are synced with existing data.');
        process.exit(0);
      }
    });
  }
});

