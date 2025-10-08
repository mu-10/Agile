//Used to populate database by fetching charging stations using open charge map API

require('dotenv').config({ quiet: true });
const ChargingStationDB = require('./database');

async function runMigration() {
  console.log('Starting charging station database migration...');
  
  const db = new ChargingStationDB();
  
  try {
    // Check if we already have data
    const existingCount = db.getStationCount();
    console.log(`Current stations in database: ${existingCount}`);
    
    if (existingCount > 0) {
      console.log('Database already contains data. This will update existing records.');
    }
    
    // Run migration
    const result = await db.migrateFromAPI();
    
    if (result.success) {
      console.log(`Migration completed successfully!`);
      console.log(`Total stations migrated: ${result.count}`);
      console.log(`Total stations in database: ${db.getStationCount()}`);
    } else {
      console.error(`Migration failed: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;