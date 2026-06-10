const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'solace.db');
const db = new sqlite3.Database(dbPath);

// On crée un fichier temporaire pour stocker vos données si besoin, 
// ou on les traite directement ici.
const rawDataPath = path.join(__dirname, 'acled_raw.txt');

async function runImport() {
    if (!fs.existsSync(rawDataPath)) {
        console.error("Erreur: Le fichier acled_raw.txt est introuvable.");
        return;
    }

    const content = fs.readFileSync(rawDataPath, 'utf8');
    const lines = content.trim().split('\n');

    console.log(`Début de l'importation de ${lines.length - 1} entrées...`);

    db.serialize(() => {
        // Création de la table
        db.run(`CREATE TABLE IF NOT EXISTS conflict_data (
            country TEXT,
            year INTEGER,
            fatalities INTEGER,
            PRIMARY KEY (country, year)
        )`);

        const stmt = db.prepare("INSERT OR REPLACE INTO conflict_data (country, year, fatalities) VALUES (?, ?, ?)");

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split('\t');
            if (row.length >= 3) {
                stmt.run(row[0].trim(), parseInt(row[1]), parseInt(row[2]));
            }
        }

        stmt.finalize();
    });

    db.close((err) => {
        if (err) console.error(err.message);
        console.log("Importation dans solace.db terminée avec succès.");
    });
}

runImport();
