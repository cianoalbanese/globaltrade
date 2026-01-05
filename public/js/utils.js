// --- 1. VARIABILI GLOBALI DI STATO ---
let filtroCategoria = "tutti";
let testoRicerca = "";
let carrello = JSON.parse(localStorage.getItem("carrello")) || [];
let wishlist = JSON.parse(localStorage.getItem("wishlist")) || [];

// --- 2. CARICAMENTO COMPONENTI (Header/Footer) ---
async function caricaComponenti() {
  console.log("Inizializzazione componenti...");
  try {
    const [headerRes, footerRes] = await Promise.all([
      fetch("header.html"),
      fetch("footer.html"),
    ]);

    const headerPlaceholder = document.getElementById("header-placeholder");
    if (headerPlaceholder && headerRes.ok) {
      headerPlaceholder.innerHTML = await headerRes.text();

      // Configurazione Burger Menu per mobile
      const menuToggle = document.getElementById("menu-toggle");
      const navLinks = document.getElementById("nav-links");
      // Dentro caricaComponenti(), dove configuri il burger:
      if (menuToggle && navLinks) {
        menuToggle.onclick = () => {
          navLinks.classList.toggle("active");
          menuToggle.classList.toggle("active"); // Per l'effetto X
        };

        // Chiudi il menu se l'utente clicca su un link (importante per le Single Page App)
        navLinks.querySelectorAll("a").forEach((link) => {
          link.onclick = () => {
            navLinks.classList.remove("active");
            menuToggle.classList.remove("active");
          };
        });
      }
    }

    const footerPlaceholder = document.getElementById("footer-placeholder");
    if (footerPlaceholder && footerRes.ok) {
      footerPlaceholder.innerHTML = await footerRes.text();
    }

    // Una volta iniettato l'HTML, aggiorniamo l'interfaccia
    gestisciStatoLogin();
    aggiornaContatori();
  } catch (error) {
    console.error("Errore nel caricamento dei componenti:", error);
  }
}

// --- 3. LOGICA PRODOTTI E FILTRI ---
async function caricaProdotti() {
  // 1. Riferimenti DOM
  const contenitore =
    document.getElementById("lista-prodotti") ||
    document.getElementById("product-grid");
  const loader = document.getElementById("loader");
  const countSpan = document.getElementById("count-results");
  const pagContainer = document.getElementById("pagination-container");

  if (!contenitore) return;

  // 2. Feedback visivo
  if (loader) loader.style.display = "block";
  contenitore.style.opacity = "0.5";

  // 3. Costruzione URL API e Parametri dal Browser
  const urlAPI = new URL("http://localhost:5000/api/prodotti");
  const paramsBrowser = new URLSearchParams(window.location.search);

  // --- LOGICA BRAND (Cruciale per la tua pagina brand.html) ---
  // Recuperiamo il brand dall'URL del browser (?name=Lete)
  const brandDalBrowser = paramsBrowser.get("name");
  if (brandDalBrowser) {
    urlAPI.searchParams.set("brand", brandDalBrowser);
    console.log("Filtro Brand applicato all'API:", brandDalBrowser);
  }

  // --- LOGICA PAGINAZIONE ---
  const paginaCorrente = paramsBrowser.get("page") || 1;
  urlAPI.searchParams.set("page", paginaCorrente);
  // urlAPI.searchParams.set("limit", 6); // Se vuoi forzare un limite

  // --- LOGICA FILTRI ---
  // Categorie e Sottocategorie
  const cat = Array.from(document.querySelectorAll(".cat-check:checked")).map(
    (cb) => cb.value
  );
  if (cat.length > 0) urlAPI.searchParams.set("categorie", cat.join(","));

  const sub = Array.from(document.querySelectorAll(".sub-check:checked")).map(
    (cb) => cb.value
  );
  if (sub.length > 0) urlAPI.searchParams.set("sottocategorie", sub.join(","));

  // Prezzo, Offerta, Novità
  const price = document.getElementById("priceMax")?.value;
  if (price && price > 0) urlAPI.searchParams.set("prezzoMax", price);

  if (document.getElementById("checkOffer")?.checked)
    urlAPI.searchParams.set("offerta", "true");
  if (document.getElementById("checkNew")?.checked)
    urlAPI.searchParams.set("novita", "true");

  // Ricerca e Ordinamento
  const search = document.getElementById("searchInput")?.value.trim();
  if (search) urlAPI.searchParams.set("search", search);

  const sort = document.getElementById("sort")?.value;
  if (sort) urlAPI.searchParams.set("sort", sort);

  // 4. Sincronizzazione URL Browser (senza ricaricare e senza perdere il brand)
  // Creiamo una copia dei parametri attuali dell'API per rifletterli nella barra indirizzi
  const nuoviParamsBrowser = new URLSearchParams(urlAPI.searchParams);

  // Se l'API usa "brand", ma noi nel browser vogliamo mantenere "name"
  if (brandDalBrowser) {
    nuoviParamsBrowser.set("name", brandDalBrowser);
    nuoviParamsBrowser.delete("brand"); // Puliamo per estetica
  }

  window.history.pushState(
    {},
    "",
    `${window.location.pathname}?${nuoviParamsBrowser.toString()}`
  );

  // 5. Chiamata API
  try {
    console.log("Chiamata API in corso a:", urlAPI.toString());
    const risposta = await fetch(urlAPI);
    const dati = await risposta.json();

    // Pulizia interfaccia post-caricamento
    if (loader) loader.style.display = "none";
    contenitore.style.opacity = "1";

    // Estrazione sicura dei dati
    const prodotti = dati.prodotti || (Array.isArray(dati) ? dati : []);
    const infoPaginazione = dati.pagination || {
      total: prodotti.length,
      page: 1,
      totalPages: 1,
    };

    if (countSpan) countSpan.innerText = infoPaginazione.total;

    // 6. Rendering Prodotti
    if (prodotti.length === 0) {
      contenitore.innerHTML = `<div class="no-results">Nessun prodotto trovato per questo brand o filtro.</div>`;
      if (pagContainer) pagContainer.innerHTML = "";
      return;
    }

    contenitore.innerHTML = prodotti
      .map((p) => {
        const nomeJS = p.name ? p.name.replace(/'/g, "\\'") : "Prodotto";
        return `
          <div class="card">
            ${p.is_offer ? '<span class="badge promo">OFFERTA</span>' : ""}
            ${p.is_featured ? '<span class="badge-new">TOP</span>' : ""}
            
            <button class="wish-btn" onclick="toggleWishlist(${p.id
          }, '${nomeJS}', ${p.price}, '${p.image_url}', this)">
                ${isWishlisted(p.id) ? "❤️" : "🤍"}
            </button>

            <img src="${p.image_url}" class="product-image" alt="${p.name}"
                 onclick="window.location.href='prodotto.html?id=${p.id}'"
                 onerror="this.src='https://placehold.co/300x300?text=Image+Not+Found'">
            
            <div class="card-body">
                <h3 onclick="window.location.href='prodotto.html?id=${p.id}'">${p.name
          }</h3>
                <p class="price">${p.price}€</p>
                <button class="add-cart-btn" onclick="aggiungiAlCarrello(${p.id
          }, '${nomeJS}', ${p.price})">
                    Aggiungi al carrello
                </button>
            </div>
          </div>
        `;
      })
      .join("");

    // 7. Rendering Paginazione
    if (typeof renderPagination === "function") {
      renderPagination(infoPaginazione);
    }
  } catch (error) {
    console.error("Errore critico durante la fetch:", error);
    if (loader) loader.style.display = "none";
    contenitore.style.opacity = "1";
    contenitore.innerHTML = `<p class="error">Errore nel caricamento dei prodotti. Riprova più tardi.</p>`;
  }
}
function filtra(tipo) {
  filtroCategoria = tipo;
  caricaProdotti();
}

function cerca() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    testoRicerca = searchInput.value;
    caricaProdotti();
  }
}

function resetFiltri() {
  // 1. Reset della barra di ricerca
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = "";

  // 2. Deseleziona tutte le checkbox (Categorie e Sottocategorie)
  const checkboxes = document.querySelectorAll(
    ".cat-check, .sub-check, #checkOffer, #checkNew"
  );
  checkboxes.forEach((cb) => (cb.checked = false));

  // 3. Reset dello slider del prezzo (riportalo al valore massimo, es. 1000 o 2000)
  const priceSlider = document.getElementById("priceMax");
  if (priceSlider) {
    priceSlider.value = priceSlider.max; // Imposta al massimo consentito
    // Aggiorna anche l'etichetta numerica visibile
    const priceDisplay =
      document.getElementById("price-display") ||
      document.getElementById("price-val");
    if (priceDisplay) priceDisplay.innerText = priceSlider.max;
  }

  // 4. Reset del selettore ordinamento (torna a "Più recenti")
  const sortSelect = document.getElementById("sort");
  if (sortSelect) sortSelect.value = "new";

  // 5. Ricarica i prodotti (mostrerà tutto perché i filtri sono vuoti)
  caricaProdotti();

  console.log("Filtri azzerati con successo!");
}

function sincronizzaInterfacciaDaURL() {
  const params = new URLSearchParams(window.location.search);

  // 1. Ricerca Testuale (se vuoto mette stringa vuota)
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = params.get("search") || "";

  // 2. Categorie e Sottocategorie
  const catArray = params.get("categorie")?.split(",") || [];
  const subArray = params.get("sottocategorie")?.split(",") || [];

  document.querySelectorAll(".cat-check").forEach((cb) => {
    cb.checked = catArray.includes(cb.value);
  });
  document.querySelectorAll(".sub-check").forEach((cb) => {
    cb.checked = subArray.includes(cb.value);
  });

  // 3. Prezzo Massimo
  const slider = document.getElementById("priceMax");
  const display =
    document.getElementById("price-display") ||
    document.getElementById("price-val");
  if (slider) {
    // Se non c'è il parametro, usa il valore massimo di default (es. 2000)
    const pMax = params.get("prezzoMax") || slider.max;
    slider.value = pMax;
    if (display) display.innerText = pMax;
  }

  // 4. Offerta e Novità (fondamentale gestire il caso false)
  const checkOffer = document.getElementById("checkOffer");
  if (checkOffer) checkOffer.checked = params.get("offerta") === "true";

  const checkNew = document.getElementById("checkNew");
  if (checkNew) checkNew.checked = params.get("novita") === "true";

  // 5. Ordinamento
  const sortSelect = document.getElementById("sort");
  if (sortSelect) sortSelect.value = params.get("sort") || "new";
}

// --- 4. GESTIONE CARRELLO ---
function aggiungiAlCarrello(id, nome, prezzo) {
  let carrelloLocal = JSON.parse(localStorage.getItem("carrello")) || [];
  const esistente = carrelloLocal.find((p) => p.id === id);

  if (esistente) {
    esistente.quantita++;
  } else {
    carrelloLocal.push({ id, nome, price: prezzo, quantita: 1 });
  }

  localStorage.setItem("carrello", JSON.stringify(carrelloLocal));
  aggiornaContatori();
  // alert(`${nome} aggiunto al carrello!`);
}

// --- 5. GESTIONE WISHLIST ---
// Funzione per visualizzare i prodotti nella pagina wishlist.html
function renderWishlist() {
  const contenitore = document.getElementById("wishlist-content");
  if (!contenitore) return;

  const wishlistLocal = JSON.parse(localStorage.getItem("wishlist")) || [];

  if (wishlistLocal.length === 0) {
    contenitore.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px;"><h3>La tua wishlist è vuota ❤️</h3></div>`;
    return;
  }

  contenitore.innerHTML = wishlistLocal
    .map((p) => {
      // PROTEZIONE: Se il nome manca, usa un valore di default
      const nomeSicuro = p.name ? p.name : "Prodotto senza nome";
      // Prepariamo il nome per l'attributo onclick (gestendo gli apici)
      const nomePerJS = nomeSicuro.replace(/'/g, "\\'");

      return `
        <div class="card">
            <button class="wish-btn" onclick="rimuoviDallaWishlist(${p.id
        })">❤️</button>
            <img src="${p.image_url || "https://via.placeholder.com/250"
        }" alt="${p.image_url || "https://via.placeholder.com/250"
        }" class="product-image">
            <div class="card-body">
                <h3>${nomeSicuro}</h3>
                <p class="price">${p.price || 0}€</p>
                <button class="add-cart-btn" onclick="aggiungiAlCarrello(${p.id
        }, '${nomePerJS}', ${p.price || 0})">
                    Aggiungi al carrello
                </button>
            </div>
        </div>`;
    })
    .join("");
}

// Funzione specifica per rimuovere e aggiornare la vista immediatamente
function rimuoviDallaWishlist(id) {
  let wishlistLocal = JSON.parse(localStorage.getItem("wishlist")) || [];
  wishlistLocal = wishlistLocal.filter((p) => p.id !== id);
  localStorage.setItem("wishlist", JSON.stringify(wishlistLocal));

  renderWishlist(); // Rifà il disegno della pagina wishlist
  aggiornaContatori(); // Aggiorna il numero nel cerchietto rosso dell'header
}

function toggleWishlist(id, nome, prezzo, immagine, elemento) {
  // 1. Forza l'ID a numero per evitare errori di confronto
  const productId = parseInt(id);
  let wishlistLocal = JSON.parse(localStorage.getItem("wishlist")) || [];

  // 2. Controlla se esiste già
  const index = wishlistLocal.findIndex((p) => p.id === productId);
  let aggiunto = false;

  if (index > -1) {
    wishlistLocal.splice(index, 1);
    aggiunto = false;
  } else {
    wishlistLocal.push({
      id: productId,
      name: nome,
      price: prezzo,
      image_url: immagine,
    });
    aggiunto = true;
  }

  // 3. Salva immediatamente
  localStorage.setItem("wishlist", JSON.stringify(wishlistLocal));

  // 4. CAMBIO ICONA (Logica infallibile)
  // Se abbiamo passato 'this' (elemento), lo usiamo direttamente
  if (elemento) {
    elemento.innerHTML = aggiunto ? "❤️" : "🤍";

    // Aggiunge o rimuove una classe per CSS (opzionale)
    if (aggiunto) {
      elemento.classList.add("active");
    } else {
      elemento.classList.remove("active");
    }
  }

  // 5. SINCRONIZZAZIONE (Cerca altri cuori dello stesso prodotto nella pagina)
  const altriCuori = document.querySelectorAll(
    `.wish-btn[data-id="${productId}"]`
  );
  altriCuori.forEach((cuore) => {
    cuore.innerHTML = aggiunto ? "❤️" : "🤍";
  });

  // 6. Aggiorna contatori globali
  if (typeof aggiornaContatori === "function") aggiornaContatori();
}

function isWishlisted(id) {
  const wishlistLocal = JSON.parse(localStorage.getItem("wishlist")) || [];
  return wishlistLocal.some((p) => p.id === id);
}

// --- 6. CONTATORI E STATO LOGIN ---
function aggiornaContatori() {
  const carrelloLocal = JSON.parse(localStorage.getItem("carrello")) || [];
  const wishlistLocal = JSON.parse(localStorage.getItem("wishlist")) || [];

  const cartCount = carrelloLocal.reduce((acc, p) => acc + p.quantita, 0);
  const wishCount = wishlistLocal.length;

  const cartEl = document.getElementById("cart-count");
  const wishEl = document.getElementById("wish-count");

  // Controllo e animazione per il Carrello
  if (cartEl) {
    if (parseInt(cartEl.innerText) !== cartCount) {
      cartEl.innerText = cartCount;
      animaBadge("cart-count");
    }
  }

  // Controllo e animazione per la Wishlist
  if (wishEl) {
    if (parseInt(wishEl.innerText) !== wishCount) {
      wishEl.innerText = wishCount;
      animaBadge("wish-count");
    }
  }
}

// Funzione di supporto per l'animazione
function animaBadge(idElemento) {
  const badge = document.getElementById(idElemento);
  if (badge) {
    badge.classList.add("bump");
    setTimeout(() => {
      badge.classList.remove("bump");
    }, 300);
  }
}

function gestisciStatoLogin() {
  const userSection = document.getElementById("user-section");
  if (!userSection) return;

  const username = localStorage.getItem("user"); // Ora qui salviamo direttamente la stringa del nome

  if (username) {
    userSection.innerHTML = `
      <div class="user-logged">
        <span class="user-name">Ciao, ${username}</span>
        <button onclick="logout()" class="logout-btn">Esci</button>
      </div>
    `;
  } else {
    userSection.innerHTML = `<a href="login.html" class="login-link">Accedi</a>`;
  }
}

function logout() {
  localStorage.removeItem("user");
  window.location.reload();
}

function animaBadge(idElemento) {
  const badge = document.getElementById(idElemento);
  badge.classList.add("bump");
  setTimeout(() => {
    badge.classList.remove("bump");
  }, 300);
}

// --- 7. LOGICHE PAGINE SPECIFICHE ---
async function inizializzaAdvCarousel() {
  const track = document.querySelector("#carousel-adv .carousel-track");
  if (!track) return;

  try {
    const response = await fetch("/api/prodotti-advertising");
    const prodotti = await response.json();

    if (prodotti && prodotti.length > 0) {
      track.innerHTML = prodotti
        .map(
          (p) => `
                <div class="carousel-slide">
                    <div class="adv-card">
                        <div class="adv-badge">SPONSORIZZATO</div>
                        <img src="${p.image_url}" alt="${p.name}" class="adv-img">
                        <div class="adv-info">
                            <h3>${p.name}</h3>
                            <p class="price">€${p.price}</p>
                            <a href="/prodotto.html?id=${p.id}" class="btn-adv">Scopri</a>
                        </div>
                    </div>
                </div>
            `
        )
        .join("");

      // DOPO aver iniettato l'HTML, inizializziamo il carousel
      if (typeof attivaCarouselDinamico === "function") {
        attivaCarouselDinamico();
      }
    } else {
      document.querySelector(".col-left").innerHTML =
        "<p>Nessuna promozione attiva</p>";
    }
  } catch (err) {
    console.error("Errore carousel adv:", err);
  }
}
// Funzione globale per cambiare l'immagine principale senza ricaricare
/**
 * Funzione per cambiare l'immagine principale e gestire lo stato 'active' delle miniature
 */
window.cambiaImmagine = function (url, elemento) {
  const mainImg = document.getElementById("main-product-img");
  if (mainImg) {
    // Effetto dissolvenza opzionale
    mainImg.style.opacity = "0.8";
    mainImg.src = url;
    setTimeout(() => (mainImg.style.opacity = "1"), 100);
  }

  // Aggiorna la classe active sulle miniature
  document
    .querySelectorAll(".thumb-item")
    .forEach((t) => t.classList.remove("active"));
  elemento.classList.add("active");
};

async function caricaDettaglioProdotto() {
  const contenitore = document.getElementById("dettaglio-prodotto");
  if (!contenitore) return;

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  try {
    const risposta = await fetch(`/api/prodotti/${id}`);
    if (!risposta.ok) throw new Error("Prodotto non trovato");
    const p = await risposta.json();

    // 1. GESTIONE IMMAGINI
    // L'API ora restituisce l'array 'images' che include sia la copertina che le extra
    const listaImmagini = p.images && p.images.length > 0 ? p.images : [];

    // Se per qualche motivo l'array è vuoto, usiamo la vecchia image_url come fallback
    if (listaImmagini.length === 0 && p.image_url) {
      listaImmagini.push({ url: p.image_url, is_main: true });
    }

    // L'immagine principale è la prima dell'array (priorità data dal backend)
    const imgPrincipale = listaImmagini[0]?.url || "placeholder.jpg";

    // 2. RENDERING HTML
    contenitore.innerHTML = `
<div class="product-page-layout">
    <div class="product-media">
        <div class="main-image-container">
            <img src="${imgPrincipale}" id="main-product-img" class="main-product-img" alt="${p.name
      }">
            ${p.discount_percent > 0
        ? `<span class="discount-label">-${p.discount_percent}%</span>`
        : ""
      }
        </div>
        
        <div class="thumbnail-grid">
            ${listaImmagini
        .map(
          (img, index) => `
                <div class="thumb-item ${index === 0 ? "active" : ""}" 
                     onclick="cambiaImmagine('${img.url}', this)">
                    <img src="${img.url}" alt="Vista ${index + 1
            }" loading="lazy">
                </div>
            `
        )
        .join("")}
        </div>
    </div>

    <div class="product-details-wrapper">
        <div class="product-header">
            <h1>${p.name}</h1>
            <div class="price-row">
                <span class="current-price">${p.price}€</span>
                <span class="view-count">👁️ ${p.view || 0
      } visualizzazioni</span>
            </div>
        </div>

        <div class="product-main-info">
            <p class="description">${p.description || "Nessuna descrizione disponibile."
      }</p>
            
            <div class="availability-tag ${p.stock > 0 ? "in-stock" : "out-of-stock"
      }">
                ${p.stock > 0
        ? `Disponibilità: ${p.stock} unità`
        : "Attualmente esaurito"
      }
            </div>
        </div>

        <div class="specs-grid">
            <div class="spec-card">
                <label>Peso</label>
                <p>${p.weight || "N/D"}</p>
            </div>
            <div class="spec-card">
                <label>Scadenza</label>
                <p>${p.expiry_date || "N/D"}</p>
            </div>
            <div class="spec-card">
                <label>EAN</label>
                <p>${p.ean || "N/D"}</p>
            </div>
            <div class="spec-card">
                <label>Conservazione</label>
                <p>${p.storage || "N/D"}</p>
            </div>
        </div>

        <div class="info-blocks">
            <div class="info-block">
                <h4>🌿 Ingredienti & Allergeni</h4>
                <p>${p.ingredients || "Non specificati"}</p>
                ${p.allergens
        ? `<p class="allergens-alert"><strong>⚠️ Allergeni:</strong> ${p.allergens}</p>`
        : ""
      }
            </div>
            
            <div class="info-block nutrition">
                <h4>📊 Valori Nutrizionali</h4>
                <p>${p.nutrition || "Dati non disponibili"}</p>
            </div>
        </div>

        <div class="purchase-box">
            <button class="btn-primary-lg" 
                    ${p.stock <= 0 ? "disabled" : ""}
                    onclick="aggiungiAlCarrello(${p.id}, '${p.name.replace(
        /'/g,
        "\\'"
      )}', ${p.price})">
                ${p.stock > 0 ? "Aggiungi al Carrello" : "Prodotto Esaurito"}
            </button>
        </div>
    </div>
</div>`;
  } catch (e) {
    console.error("Errore caricamento dettaglio:", e);
    contenitore.innerHTML = `
            <div class="error-container">
                <p>⚠️ Errore nel caricamento del prodotto. Verifica la connessione o l'ID del prodotto.</p>
                <button onclick="location.reload()">Riprova</button>
            </div>`;
  }
}

// --- 8.1 GESTISCI IL LOGIN --
async function gestisciLogin(e) {
  e.preventDefault(); // Impedisce il ricaricamento della pagina

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const btn = e.target.querySelector("button");

  try {
    // Feedback visivo: disabilita il bottone
    btn.disabled = true;
    btn.innerText = "Accesso in corso...";

    const risposta = await fetch("http://localhost:5000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const dati = await risposta.json();

    if (risposta.ok) {
      // SALVATAGGIO DATI:
      // Salviamo il nome (per visualizzarlo nell'header) e il token (per le chiamate future)
      localStorage.setItem("user", dati.user.name);
      localStorage.setItem("token", dati.token);

      // Opzionale: salva l'intero oggetto utente come stringa
      // localStorage.setItem("userData", JSON.stringify(dati.user));

      alert("Benvenuto " + dati.user.name + "!");
      window.location.href = "index.html"; // Reindirizza alla home
    } else {
      alert(dati.error || "Credenziali errate");
    }
  } catch (error) {
    console.error("Errore login:", error);
    alert("Errore di connessione al server");
  } finally {
    btn.disabled = false;
    btn.innerText = "Accedi al Profilo";
  }
}

// --- 8.1 VISUALIZZAZIONE CARRELLO ---
function renderCarrello() {
  const contenitore = document.getElementById("cart-items");
  const totaleEl = document.getElementById("cart-total");
  if (!contenitore) return;

  const carrelloLocal = JSON.parse(localStorage.getItem("carrello")) || [];

  if (carrelloLocal.length === 0) {
    contenitore.innerHTML =
      '<tr><td colspan="5" style="text-align:center;">Il carrello è vuoto.</td></tr>';
    if (totaleEl) totaleEl.innerText = "0.00";
    return;
  }

  let totaleGenerale = 0;

  contenitore.innerHTML = carrelloLocal
    .map((p, index) => {
      const subtotale = p.price * p.quantita;
      totaleGenerale += subtotale;

      return `
            <tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.price.toFixed(2)}€</td>
                <td>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="cambiaQuantita(${index}, -1)">-</button>
                        <span>${p.quantita}</span>
                        <button class="qty-btn" onclick="cambiaQuantita(${index}, 1)">+</button>
                    </div>
                </td>
                <td>${subtotale.toFixed(2)}€</td>
                <td>
                    <button class="delete-btn" onclick="rimuoviDalCarrello(${index})">Rimuovi</button>
                </td>
            </tr>
        `;
    })
    .join("");

  if (totaleEl) totaleEl.innerText = totaleGenerale.toFixed(2);
}

// Funzioni di supporto per modificare il carrello
function cambiaQuantita(index, delta) {
  let carrelloLocal = JSON.parse(localStorage.getItem("carrello")) || [];
  carrelloLocal[index].quantita += delta;

  if (carrelloLocal[index].quantita < 1) {
    rimuoviDalCarrello(index);
  } else {
    localStorage.setItem("carrello", JSON.stringify(carrelloLocal));
    renderCarrello();
    aggiornaContatori();
  }
}

function rimuoviDalCarrello(index) {
  let carrelloLocal = JSON.parse(localStorage.getItem("carrello")) || [];
  carrelloLocal.splice(index, 1);
  localStorage.setItem("carrello", JSON.stringify(carrelloLocal));
  renderCarrello();
  aggiornaContatori();
}

async function inizializzaCategorie() {
  try {
    const contenitore = document.getElementById("dynamic-categories");

    // --- AGGIUNGI QUESTO CONTROLLO ---
    if (!contenitore) {
      // Se non esiste, esci silenziosamente dalla funzione
      return;
    }

    const risposta = await fetch("http://localhost:5000/api/categorie-tree");
    const albero = await risposta.json();

    contenitore.innerHTML = albero
      .map((cat) => generaHtmlCategoria(cat))
      .join("");
  } catch (err) {
    console.error("Errore nel caricamento dei filtri:", err);
  }
}

function generaHtmlCategoria(cat, livello = 0) {
  // Se non ha figli, è una categoria finale (es. "iPhone")
  if (!cat.children || cat.children.length === 0) {
    return `
            <label class="nested-label">
                <input type="checkbox" class="sub-check" value="${cat.id}" onchange="caricaProdotti()">
                ${cat.name}
            </label>
        `;
  }

  // Se ha figli, creiamo un <details> (senza l'attributo 'open')
  const cssClass = livello === 0 ? "cat-check" : "sub-check";

  return `
        <div class="filter-group">
            <details> <summary><h4>${cat.name}</h4></summary>
                <div class="sub-group">
                    <label class="main-cat">
                        <input type="checkbox" class="${cssClass}" value="${cat.id
    }" onchange="caricaProdotti()">
                        Vedi tutto ${cat.name}
                    </label>
                    ${cat.children
      .map((child) => generaHtmlCategoria(child, livello + 1))
      .join("")}
                </div>
            </details>
        </div>
    `;
}

// --- 8. INIZIALIZZAZIONE AUTOMATICA ---
document.addEventListener("DOMContentLoaded", () => {
  caricaComponenti(); // Carica Header/Footer, Login e Contatori

  // 1. Sincronizza l'interfaccia (checkbox, slider, etc.) con i parametri dell'URL
  // Questo deve avvenire PRIMA di caricaProdotti
  sincronizzaInterfacciaDaURL();

  caricaProdotti(); // Carica la griglia prodotti
  caricaDettaglioProdotto(); // Se in pagina dettaglio

  if (document.getElementById("cart-items")) {
    renderCarrello();
  }

  // INIZIALIZZA LA WISHLIST (se sei in wishlist.html)
  if (document.getElementById("wishlist-content")) {
    renderWishlist();
  }

  // Inizializza i form (Login/Register)
  const regForm = document.getElementById("registerForm");
  if (regForm) regForm.onsubmit = gestisciRegistrazione;

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.onsubmit = gestisciLogin;
});

// 2. Gestione pulsanti "Avanti/Indietro" del browser
// Se l'utente cambia URL tramite la cronologia, aggiorniamo filtri e prodotti
window.addEventListener("popstate", () => {
  sincronizzaInterfacciaDaURL();
  caricaProdotti();
});

// Sincronizzazione carrello se apri più schede
window.addEventListener("storage", aggiornaContatori);

window.addEventListener("scroll", () => {
  const header = document.querySelector("header");
  if (window.scrollY > 50) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});

function renderPagination(info) {
  const container = document.getElementById("pagination-container");
  if (!container) return;

  let html = "";

  // Tasto Precedente
  if (info.page > 1) {
    html += `<button class="page-btn" onclick="cambiaPagina(${info.page - 1
      })">«</button>`;
  }

  // Genera i numeri delle pagine
  for (let i = 1; i <= info.totalPages; i++) {
    const activeClass = i === info.page ? "active" : "";
    html += `<button class="page-btn ${activeClass}" onclick="cambiaPagina(${i})">${i}</button>`;
  }

  // Tasto Successivo
  if (info.page < info.totalPages) {
    html += `<button class="page-btn" onclick="cambiaPagina(${info.page + 1
      })">»</button>`;
  }

  container.innerHTML = html;
}

// Funzione che viene chiamata quando clicchi un numero
function cambiaPagina(nuovaPagina) {
  // 1. Prendi l'URL attuale
  const url = new URL(window.location.href);
  // 2. Aggiorna il parametro "page"
  url.searchParams.set("page", nuovaPagina);
  // 3. Sposta l'utente al nuovo URL (questo attiverà caricaProdotti)
  window.location.href = url.href;
}

// Chiama questa funzione quando carichi la pagina
document.addEventListener("DOMContentLoaded", inizializzaCategorie);

async function attivaCarouselDinamico(apiUrl, elementId) {
  const container = document.getElementById(elementId);
  if (!container) return;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const prodotti = await response.json();

    if (!prodotti || prodotti.length === 0) {
      container.style.display = "none";
      return;
    }

    const track = container.querySelector(".carousel-track");
    if (track) {
      track.innerHTML = prodotti
        .map((p) => {
          const nomeSicuro = p.name || "Prodotto";
          const nomePerJS = nomeSicuro.replace(/'/g, "\\'");
          const imgUrl = p.image_url || "placeholder.jpg";
          const prezzoScontato = (
            p.price *
            (1 - (p.discount_percent || 0) / 100)
          ).toFixed(2);

          if (elementId === "carousel-adv") {
            return `
    <div class="carousel-slide evd-1">
        <div class="evd-1-item-text">
            <h4>${p.is_offer ? "Offerta Speciale" : "Sponsorizzato"}</h4>
            <h1>${p.name}</h1>
            
            <div class="evd1-stock ${p.stock <= 5 ? "low-stock" : ""}">
                ${p.stock > 0 ? `Disponibilità: ${p.stock} pezzi` : "Esaurito"}
            </div>

            <p>${p.description ||
              "Scopri la qualità superiore dei nostri prodotti."
              }</p>
            
            <div class="evd-price-info">
                ${p.discount_percent > 0
                ? `
                    <span class="original-price">${p.price}€</span>
                    <span class="price-discounted">${prezzoScontato}€</span>
                    <span class="total-price">-${p.discount_percent}%</span>
                `
                : `
                    <span class="price">${p.price}€</span>
                `
              }
            </div>

            <div class="evd-cta-container">
                <button class="adv-cta-btn" onclick="aggiungiAlCarrello(${p.id}, '${nomePerJS}', ${p.price})">
                    ACQUISTA ORA
                </button>
            </div>
        </div>

        <div class="evd-1-item-img">
            <img src="${imgUrl}" alt="${p.name}">
        </div>
    </div>`;
          }

          // Template standard per gli altri carousel
          return `
                <div class="carousel-slide">
                    <div class="card">
                        <img src="${imgUrl}" class="product-image">
                        <div class="card-body">
                            <h3>${nomeSicuro}</h3>
                            <p class="price">${p.price}€</p>
                            <button onclick="aggiungiAlCarrello(${p.id}, '${nomePerJS}', ${p.price})">Aggiungi</button>
                        </div>
                    </div>
                </div>`;
        })
        .join("");
    }

    const opzioniDaHTML = {
      slidesToShow: parseInt(container.dataset.slidesToShow) || 1,
      autoplay: container.dataset.autoplay === "true",
      infinite: container.dataset.infinite === "true",
      showDots: container.dataset.showDots === "true",
      showArrows: container.dataset.showArrows !== "false",
      effect: container.dataset.effect || "slide",
      delay: parseInt(container.dataset.delay) || 4000,
      responsive: container.dataset.responsive
        ? JSON.parse(container.dataset.responsive)
        : [],
    };

    new Carousel(container, opzioniDaHTML);
  } catch (err) {
    console.error("Errore:", err);
  }
}
/*async function attivaCarouselDinamico(apiUrl, elementId) {
  const container = document.getElementById(elementId);
  if (!container) return;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const prodotti = await response.json();

    if (!prodotti || prodotti.length === 0) {
      console.warn(`Nessun prodotto per il carousel: ${elementId}`);
      container.style.display = "none";
      return;
    }

    const track = container.querySelector(".carousel-track");
    if (track) {
      track.innerHTML = prodotti
        .map((p) => {
          const nomeSicuro = p.name || "Prodotto";
          const nomePerJS = nomeSicuro.replace(/'/g, "\\'");
          const imgUrl = p.image_url || "https://via.placeholder.com/250";
          // Determiniamo lo stato iniziale (se il tuo DB lo passa)
          //const isInWishlist = p.in_wishlist === true;
          const wishlistAttuale =
            JSON.parse(localStorage.getItem("wishlist")) || [];
          const isInWishlist = wishlistAttuale.some((item) => item.id === p.id);
          return `
        <div class="carousel-slide">
            <div class="card" style="margin: 0 10px; position: relative;">
                <button type="button" 
                        class="wish-btn ${isInWishlist ? "active" : ""}" 
                        onclick="toggleWishlist(${p.id}, '${nomePerJS}', ${
            p.price
          }, '${imgUrl}', this); event.stopPropagation();"
                        style="z-index: 10; cursor: pointer;">
                    ${isInWishlist ? "❤️" : "🤍"}
                </button>
                
                <img src="${
                  p.image_url || "placeholder.jpg"
                }" class="product-image">
                
                <div class="card-body">
                    <h3>${nomeSicuro}</h3>
                    <p class="price">${p.price}€</p>
                    <button class="add-cart-btn" onclick="aggiungiAlCarrello(${
                      p.id
                    }, '${nomePerJS}', ${p.price})">
                        Aggiungi al carrello
                    </button>
                </div>
            </div>
        </div>`;
        })
        .join("");
    }

    // Recupero opzioni dai data-attributes (HTML)
 const opzioniDaHTML = {
  slidesToShow: parseInt(container.dataset.slidesToShow) || 1,
  autoplay: container.dataset.autoplay === "true",
  infinite: container.dataset.infinite === "true",
  showDots: container.dataset.showDots === "true",
  showArrows: container.dataset.showArrows !== "false",
  effect: container.dataset.effect || "slide", // Aggiungi questa riga
  responsive: container.dataset.responsive ? JSON.parse(container.dataset.responsive) : [],
};

    // Inizializzazione della classe
    new Carousel(container, opzioniDaHTML);
  } catch (err) {
    console.error("Errore durante l'attivazione del carousel:", err);
  }
}*/
