const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./config/db");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// CONFIGURAZIONE PERCORSO STATICO (CORAZZATA)
// __dirname indica la cartella dove si trova index.js
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// API per i prodotti
// Rotta per svuotare manualmente la cache
app.post("/api/admin/clear-cache", (req, res) => {
  const numeroElementi = Object.keys(cacheProdotti).length;

  // Svuota l'oggetto della cache
  for (let key in cacheProdotti) {
    delete cacheProdotti[key];
  }

  console.log(
    `🧹 CACHE PULITA: Rimossi ${numeroElementi} elementi dalla memoria.`
  );

  res.json({
    success: true,
    message: "Cache svuotata con successo",
    deletedItems: numeroElementi,
  });
});

app.get("/api/categorie-tree", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM categories ORDER BY name ASC"
    );
    const rows = result.rows;

    // Funzione per costruire l'albero
    const buildTree = (parentId = null) => {
      return rows
        .filter((row) => row.parent_id === parentId)
        .map((row) => ({
          ...row,
          children: buildTree(row.id),
        }));
    };

    const tree = buildTree(null);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: "Errore nel caricamento categorie" });
  }
});
// Assicurati che queste variabili siano definite fuori dalla rotta
const cacheProdotti = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minuti

app.get("/api/prodotti", async (req, res) => {
  try {
    // 1. NORMALIZZAZIONE CHIAVE CACHE
    const sortedQuery = Object.keys(req.query)
      .sort()
      .reduce((acc, key) => {
        acc[key] = req.query[key];
        return acc;
      }, {});

    const cacheKey = JSON.stringify(sortedQuery);
    const oraAttuale = Date.now();

    // 2. CONTROLLO CACHE
    if (cacheProdotti[cacheKey] && (oraAttuale - cacheProdotti[cacheKey].timestamp < CACHE_TTL)) {
      console.log(`✅ CACHE HIT: ${cacheKey}`);
      return res.json(cacheProdotti[cacheKey].data);
    }

    console.log(`🚀 CACHE MISS: Interrogazione Database per ${cacheKey}`);

    // 3. ESTRAZIONE PARAMETRI (Aggiunto brand)
    const {
      brand,         // <--- Recuperiamo il brand
      categorie,
      sottocategorie,
      prezzoMax,
      offerta,
      novita,
      search,
      sort,
      page = 1,
      limit = 6,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 4. COSTRUZIONE QUERY BASE
    let sql = `
        SELECT p.*, c1.name as subcategory_name, c2.name as main_category_name,
               COUNT(*) OVER() as total_count
        FROM products p
        LEFT JOIN categories c1 ON p.subcategory_id = c1.id
        LEFT JOIN categories c2 ON p.category_id = c2.id
        WHERE 1=1
    `;
    let params = [];
    let counter = 1;

    // --- LOGICA FILTRI ---

    // FILTRO BRAND (Nuovo!)
    if (brand && brand.trim() !== "") {
      sql += ` AND p.brand ILIKE $${counter++}`;
      params.push(brand.trim());
    }

    // FILTRO PREZZO
    if (prezzoMax) {
      sql += ` AND p.price <= $${counter++}`;
      params.push(parseFloat(prezzoMax));
    }

    // FILTRO CATEGORIE / SOTTOCATEGORIE
    if (categorie || sottocategorie) {
      let catFilters = [];
      if (categorie) {
        const list = categorie.split(",").map(Number);
        const placeholders = list.map(() => `$${counter++}`).join(",");
        catFilters.push(`p.category_id IN (${placeholders})`);
        params.push(...list);
      }
      if (sottocategorie) {
        const list = sottocategorie.split(",").map(Number);
        const p1 = list.map(() => `$${counter++}`).join(",");
        const p2 = list.map(() => `$${counter++}`).join(",");
        catFilters.push(
          `(p.subcategory_id IN (${p1}) OR p.subcategory_id IN (SELECT id FROM categories WHERE parent_id IN (${p2})))`
        );
        params.push(...list, ...list);
      }
      sql += ` AND (${catFilters.join(" OR ")})`;
    }

    // RICERCA TESTUALE
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      sql += ` AND (p.name ILIKE $${counter} OR p.description ILIKE $${counter} OR p.brand ILIKE $${counter})`;
      params.push(term);
      counter++;
    }

    if (offerta === "true") sql += " AND p.is_offer = true";
    if (novita === "true") sql += " AND p.is_featured = true";

    // --- ORDINAMENTO ---
    const sortModes = {
      cheap: "ORDER BY p.price ASC",
      expensive: "ORDER BY p.price DESC",
      new: "ORDER BY p.created_at DESC",
      alphabetical: "ORDER BY p.name ASC"
    };
    sql += ` ${sortModes[sort] || sortModes.new}`;

    // --- PAGINAZIONE ---
    sql += ` LIMIT $${counter++} OFFSET $${counter++}`;
    params.push(parseInt(limit), offset);

    // 5. ESECUZIONE
    const result = await pool.query(sql, params);

    const responseData = {
      prodotti: result.rows,
      pagination: {
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: result.rows.length > 0 
          ? Math.ceil(parseInt(result.rows[0].total_count) / parseInt(limit)) 
          : 0,
      },
    };

    // 6. SALVATAGGIO IN CACHE
    cacheProdotti[cacheKey] = {
      data: responseData,
      timestamp: Date.now(),
    };

    res.json(responseData);
  } catch (err) {
    console.error("❌ ERRORE SERVER:", err.message);
    res.status(500).json({ error: "Errore interno del server" });
  }
});


// Recupera un singolo prodotto tramite ID
app.get("/api/prodotti/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      WITH galleria AS (
        -- Prepariamo tutte le immagini in una tabella temporanea isolata
        SELECT product_id, url, false AS is_main, 1 AS priority FROM products_img WHERE product_id = $1
        UNION ALL
        SELECT id AS product_id, image_url AS url, true AS is_main, 0 AS priority FROM products WHERE id = $1
      )
      SELECT 
        p.*, 
        (
          SELECT json_agg(img ORDER BY priority ASC) 
          FROM galleria img
        ) AS images
      FROM products p
      WHERE p.id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Prodotto non trovato" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("ERRORE SQL DEFINITIVO:", err.message);
    res.status(500).json({ error: err.message });
  }
});
// Esempio rotta Express
// Esempio rotta per PostgreSQL
app.get("/api/offerte", async (req, res) => {
  try {
    // 1. Verifica che 'pool' sia definito correttamente sopra nel file
    const query = "SELECT * FROM products WHERE is_offer = true LIMIT 10;";
    const result = await pool.query(query);

    // 2. Invia solo l'array dei risultati
    res.json(result.rows);
  } catch (err) {
    // 3. QUESTO LOG È FONDAMENTALE: leggilo nel terminale di Node!
    console.error("ERRORE SERVER:", err.message);
    res.status(500).json({ error: "Errore nel database" });
  }
});

app.get("/api/novita", async (req, res) => {
  try {
    // 1. Verifica che 'pool' sia definito correttamente sopra nel file
    const query = "SELECT * FROM products WHERE is_featured = true LIMIT 10;";
    const result = await pool.query(query);

    // 2. Invia solo l'array dei risultati
    res.json(result.rows);
  } catch (err) {
    // 3. QUESTO LOG È FONDAMENTALE: leggilo nel terminale di Node!
    console.error("ERRORE SERVER:", err.message);
    res.status(500).json({ error: "Errore nel database" });
  }
});

app.get("/api/prodotti-advertising", async (req, res) => {
    try {
        const oraAttuale = new Date().toISOString(); // Formato standard ISO
        console.log("🔍 Cerco pubblicità attive per il momento:", oraAttuale);

        const query = `
            SELECT * FROM products 
            WHERE advertising_start <= $1 
              AND advertising_end >= $1
            ORDER BY created_at DESC;
        `;
        
        const result = await pool.query(query, [oraAttuale]);
        
        console.log(`✅ Prodotti trovati: ${result.rows.length}`);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Errore DB Advertising:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const bcrypt = require("bcrypt");

// Rotta per la REGISTRAZIONE
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;

  // Log di controllo: vediamo cosa arriva dal frontend
  console.log("Tentativo di registrazione per:", { username, email });

  try {
    // Verifica che i campi non siano vuoti
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Tutti i campi sono obbligatori" });
    }

    const bcrypt = require("bcrypt");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username",
      [username, email, hashedPassword]
    );

    console.log("Registrazione completata per:", username);
    res.json({ message: "Utente registrato!", user: newUser.rows[0] });
  } catch (err) {
    // LOG FONDAMENTALE: Leggi questo nel terminale di VS Code!
    console.error("ERRORE DETTAGLIATO DB:", err.message);
    console.error("CODICE ERRORE:", err.code);

    // Gestione errori specifica
    if (err.code === "23505") {
      // Codice Postgres per "Unique Violation"
      return res.status(400).json({ error: "Username o Email già in uso" });
    }

    // Se l'errore è diverso, lo mostriamo così capiamo cos'è
    res.status(500).json({ error: "Errore interno: " + err.message });
  }
});

// Rotta per il LOGIN
app.post("/api/login", async (req, res) => {
  // 1. Recupero e pulizia input
  const email = req.body.email ? req.body.email.trim().toLowerCase() : null;
  const { password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "Email e password sono obbligatorie" });
  }

  try {
    // 2. Ricerca utente
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenziali errate" });
    }

    const user = result.rows[0];

    // 3. Verifica password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: "Credenziali errate" });
    }

    // 4. Risposta strutturata per il frontend
    // Inviamo l'oggetto 'user' con dentro 'name' per far felice utils.js
    res.json({
      message: "Login effettuato!",
      user: {
        id: user.id,
        name: user.username, // Prende il valore della colonna 'username' dal DB
        email: user.email,
      },
      token: "session_token_placeholder", // Qui potrai mettere il tuo JWT in futuro
    });
  } catch (err) {
    console.error("ERRORE LOGIN:", err);
    res.status(500).json({
      error: "Errore tecnico durante l'accesso",
      detail: err.message,
    });
  }
});

// Rotta di emergenza: se visiti / e express.static fallisce, questo forza l'invio del file
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

const PORT = process.env.PORT || 5000;
//const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log("-------------------------------------------");
  console.log(`Server attivo sulla porta: ${PORT}`);
  console.log(`Cartella public cercata in: ${publicPath}`);
  console.log("-------------------------------------------");
});
