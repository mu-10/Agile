const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const path = require('path');

class ChargingStationDB {
  constructor(dbPath = './charging_stations.db') {
    this.db = new Database(dbPath, { verbose: null });
    this.initializeDatabase();
  }

  initializeDatabase() {
    // Create charging stations table with proper indexes
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS charging_stations (
        id INTEGER PRIMARY KEY,
        title TEXT,
        address TEXT,
        town TEXT,
        state TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        number_of_points INTEGER,
        status_type TEXT,
        operator TEXT,
        connections TEXT, -- JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create indexes for performance
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_latitude ON charging_stations(latitude)',
      'CREATE INDEX IF NOT EXISTS idx_longitude ON charging_stations(longitude)',
      'CREATE INDEX IF NOT EXISTS idx_lat_lng ON charging_stations(latitude, longitude)'
    ];

    this.db.exec(createTableSQL);
    createIndexes.forEach(indexSQL => this.db.exec(indexSQL));
  }

  async migrateFromAPI() {
    console.log('Starting migration from Open Charge Map API...');
    
    try {
      // Fetch all charging stations from Sweden
      const apiUrl = "https://api.openchargemap.io/v3/poi/?output=json&countrycode=SE&maxresults=10000";
      
      console.log('Fetching data from Open Charge Map API...');
      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Chargify/1.0 (migration@email.com)",
          "X-API-Key": process.env.OPEN_CHARGE_MAP_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const stations = await response.json();
      console.log(`Fetched ${stations.length} stations from API`);

      // Prepare insert statement
      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO charging_stations 
        (id, title, address, town, state, latitude, longitude, number_of_points, status_type, operator, connections, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      // Begin transaction for better performance
      const insertMany = this.db.transaction((stations) => {
        let inserted = 0;
        for (const station of stations) {
          if (station.AddressInfo?.Latitude && station.AddressInfo?.Longitude) {
            insertStmt.run(
              station.ID,
              station.AddressInfo?.Title || null,
              station.AddressInfo?.AddressLine1 || null,
              station.AddressInfo?.Town || null,
              station.AddressInfo?.StateOrProvince || null,
              station.AddressInfo.Latitude,
              station.AddressInfo.Longitude,
              station.NumberOfPoints || null,
              station.StatusType?.Title || null,
              station.OperatorInfo?.Title || null,
              JSON.stringify(station.Connections || [])
            );
            inserted++;
          }
        }
        return inserted;
      });

      const insertedCount = insertMany(stations);
      console.log(`Successfully migrated ${insertedCount} charging stations to database`);
      
      return { success: true, count: insertedCount };
    } catch (error) {
      console.error('Migration failed:', error);
      return { success: false, error: error.message };
    }
  }

  getStationsInBounds(north, south, east, west, maxResults = 500) {
    const query = `
      SELECT 
        id, title, address, town, state, latitude, longitude, 
        number_of_points, status_type, operator, connections
      FROM charging_stations 
      WHERE latitude BETWEEN ? AND ? 
        AND longitude BETWEEN ? AND ?
      LIMIT ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(south, north, west, east, maxResults);

    // Transform to match API format
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      address: row.address,
      town: row.town,
      state: row.state,
      latitude: row.latitude,
      longitude: row.longitude,
      numberOfPoints: row.number_of_points,
      statusType: row.status_type,
      operator: row.operator,
      connections: row.connections ? JSON.parse(row.connections).map(conn => ({
        type: conn.ConnectionType?.Title,
        level: conn.Level?.Title,
        powerKW: conn.PowerKW,
        quantity: conn.Quantity,
      })) : []
    }));
  }

  getAllStations(maxResults = 500) {
    const query = `
      SELECT 
        id, title, address, town, state, latitude, longitude, 
        number_of_points, status_type, operator, connections
      FROM charging_stations 
      LIMIT ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(maxResults);

    // Transform to match API format
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      address: row.address,
      town: row.town,
      state: row.state,
      latitude: row.latitude,
      longitude: row.longitude,
      numberOfPoints: row.number_of_points,
      statusType: row.status_type,
      operator: row.operator,
      connections: row.connections ? JSON.parse(row.connections).map(conn => ({
        type: conn.ConnectionType?.Title,
        level: conn.Level?.Title,
        powerKW: conn.PowerKW,
        quantity: conn.Quantity,
      })) : []
    }));
  }

  getStationCount() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM charging_stations');
    return stmt.get().count;
  }

  close() {
    this.db.close();
  }
}

module.exports = ChargingStationDB;