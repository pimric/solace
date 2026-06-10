const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const COUNTRY_GEO_DATA = {
    'Afghanistan': { lat: 33.93, lng: 67.71 },
    'Algeria': { lat: 28.03, lng: 1.65 },
    'Angola': { lat: -11.20, lng: 17.87 },
    'France': { lat: 46.22, lng: 2.21 },
    'Ukraine': { lat: 48.37, lng: 31.16 },
    'Yemen': { lat: 15.55, lng: 48.51 },
    'Sudan': { lat: 12.86, lng: 30.21 },
    'Syria': { lat: 34.80, lng: 38.99 }
};

class MemorialService {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'solace.db'));
    }

    async getGardenData(country, year) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM conflict_data WHERE country = ? AND year = ?`;
            
            this.db.get(query, [country, year], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve([]);

                const center = COUNTRY_GEO_DATA[country] || { lat: 0, lng: 0 };
                const points = [];
                
                // On génère des points visuels proportionnels au nombre de fatalités
                // 1 point pour 10 victimes, max 150 points pour la performance Phaser
                const plantCount = Math.min(Math.ceil(row.fatalities / 5) + 1, 150); 

                for (let i = 0; i < plantCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * 0.2; 

                    points.push({
                        id: `${row.country}_${row.year}_${i}`,
                        growth_intensity: row.fatalities,
                        bot_behavior: row.fatalities > 100 ? 'anxious_search' : 'calm_patrol',
                        terrain_impact: row.year < 2024 ? 'arid_crack' : 'dry_soil',
                        position: {
                            lat: center.lat + Math.cos(angle) * radius,
                            lng: center.lng + Math.sin(angle) * radius
                        }
                    });
                }
                resolve(points);
            });
        });
    }
}

module.exports = new MemorialService();
