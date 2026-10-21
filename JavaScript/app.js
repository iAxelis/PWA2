(function () {
    "use strict";

    const API_BASE = "https://pokeapi.co/api/v2";
    const pokemonGrid = document.querySelector("#pokemon-grid");
    const status = document.querySelector("#catalog-status");
    const searchInput = document.querySelector("#pokemon-search");
    const dialog = document.querySelector("#pokemon-dialog");
    const detailContainer = document.querySelector("#pokemon-detail");
    const closeButton = document.querySelector(".dialog-close");
    const installButton = document.querySelector("#install-button");
    const typeNames = {
        bug: "Bicho", dark: "Siniestro", dragon: "Dragón", electric: "Eléctrico",
        fairy: "Hada", fighting: "Lucha", fire: "Fuego", flying: "Volador",
        ghost: "Fantasma", grass: "Planta", ground: "Tierra", ice: "Hielo",
        normal: "Normal", poison: "Veneno", psychic: "Psíquico", rock: "Roca",
        steel: "Acero", water: "Agua"
    };
    const statNames = {
        hp: "PS", attack: "Ataque", defense: "Defensa",
        "special-attack": "Ataque especial", "special-defense": "Defensa especial",
        speed: "Velocidad"
    };
    let pokemon = [];
    let installPrompt = null;
    let appInstalled = false;

    function isAppInstalled() {
        return appInstalled
            || window.matchMedia("(display-mode: standalone)").matches
            || navigator.standalone === true;
    }

    function updateInstallButton() {
        installButton.hidden = isAppInstalled();
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
        updateInstallButton();
    });

    installButton.addEventListener("click", async () => {
        if (!installPrompt) {
            window.alert(
                "Este navegador no puede abrir el aviso de instalación desde la página. En Chrome o Edge para computadora, usa el icono de instalar de la barra de direcciones o el menú > “Instalar Pokédex”. En iPhone o iPad, toca Compartir > “Agregar a pantalla de inicio”."
            );
            return;
        }

        installButton.disabled = true;
        try {
            await installPrompt.prompt();
            await installPrompt.userChoice;
        } catch (error) {
            console.error("No se pudo iniciar la instalación de la PWA.", error);
        } finally {
            installPrompt = null;
            installButton.disabled = false;
            updateInstallButton();
        }
    });

    window.addEventListener("appinstalled", () => {
        appInstalled = true;
        installPrompt = null;
        updateInstallButton();
    });

    window.matchMedia("(display-mode: standalone)").addEventListener("change", updateInstallButton);
    updateInstallButton();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./serviceworker.js")
                .catch((error) => console.error("No se pudo registrar el service worker de la PWA.", error));
        });
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function getSpanishName(species) {
        const spanishName = species.names.find((entry) => entry.language.name === "es");
        return spanishName ? spanishName.name : species.name;
    }

    function getSpanishDescription(species) {
        const entry = species.flavor_text_entries.find((item) => item.language.name === "es");
        return entry ? entry.flavor_text.replace(/[\n\f]/g, " ") : "No hay una descripción disponible en español.";
    }

    function imageUrl(id) {
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
    }

    function renderCards(items) {
        pokemonGrid.replaceChildren();

        if (items.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No encontramos Pokémon con ese nombre. Prueba otra búsqueda.";
            pokemonGrid.append(empty);
            return;
        }

        const cards = items.map((item) => {
            const card = document.createElement("button");
            card.className = "pokemon-card";
            card.type = "button";
            card.setAttribute("aria-label", `Ver detalles de ${item.name}`);
            card.innerHTML = `
                <span class="card-topline"><span>N.º ${String(item.id).padStart(3, "0")}</span><span class="card-heart" aria-hidden="true">✳</span></span>
                <span class="card-image-wrap"><img class="card-image" src="${imageUrl(item.id)}" alt="${escapeHTML(item.name)}" loading="lazy"></span>
                <span class="card-bottom"><span class="card-name">${escapeHTML(item.name)}</span><span class="card-link">Ver más ↗</span></span>
            `;
            card.addEventListener("click", () => showDetails(item));
            return card;
        });
        pokemonGrid.append(...cards);
    }

    async function loadCatalog() {
        status.classList.remove("is-error");
        status.textContent = "Cargando la colección Pokémon...";

        try {
            const response = await fetch(`${API_BASE}/pokemon-species?limit=151`);
            if (!response.ok) {
                throw new Error(`La PokéAPI respondió con estado ${response.status}.`);
            }
            const list = await response.json();
            const results = [];
            for (let index = 0; index < list.results.length; index += 12) {
                const batch = list.results.slice(index, index + 12);
                results.push(...await Promise.allSettled(batch.map(async (entry) => {
                    const speciesResponse = await fetch(entry.url);
                    if (!speciesResponse.ok) {
                        throw new Error(`No se pudo cargar ${entry.name} (HTTP ${speciesResponse.status}).`);
                    }
                    const species = await speciesResponse.json();
                    return { id: species.id, name: getSpanishName(species), species };
                })));
            }

            pokemon = results
                .filter((result) => result.status === "fulfilled")
                .map((result) => result.value)
                .sort((first, second) => first.name.localeCompare(second.name, "es"));

            const failedCount = results.length - pokemon.length;
            renderCards(pokemon);
            if (pokemon.length === 0) {
                throw new Error("No se pudo cargar ningún Pokémon. Comprueba tu conexión e inténtalo de nuevo.");
            }
            status.textContent = failedCount > 0
                ? `Mostrando ${pokemon.length} Pokémon. No se pudieron cargar ${failedCount} registros.`
                : `${pokemon.length} Pokémon · orden alfabético`;
            if (failedCount > 0) {
                status.classList.add("is-error");
            }
        } catch (error) {
            status.classList.add("is-error");
            status.textContent = error.message || "No se pudo cargar la colección Pokémon.";
            if (pokemon.length === 0) {
                pokemonGrid.replaceChildren();
            }
        }
    }

    async function showDetails(item) {
        dialog.showModal();
        detailContainer.innerHTML = '<p class="detail-loading" role="status">Cargando detalles...</p>';

        try {
            const [pokemonResponse, speciesResponse] = await Promise.all([
                fetch(`${API_BASE}/pokemon/${item.id}`),
                fetch(`${API_BASE}/pokemon-species/${item.id}`)
            ]);
            if (!pokemonResponse.ok || !speciesResponse.ok) {
                const response = !pokemonResponse.ok ? pokemonResponse : speciesResponse;
                throw new Error(`No se pudieron cargar los detalles (HTTP ${response.status}).`);
            }
            const [details, species] = await Promise.all([pokemonResponse.json(), speciesResponse.json()]);
            const types = details.types.map((entry) => typeNames[entry.type.name] || entry.type.name);
            const stats = details.stats.map((entry) => `
                <div class="stat-row">
                    <span class="stat-name">${escapeHTML(statNames[entry.stat.name] || entry.stat.name)}</span>
                    <span class="stat-track"><span class="stat-fill" style="width:${Math.min(entry.base_stat, 100)}%"></span></span>
                    <span class="stat-value">${entry.base_stat}</span>
                </div>
            `).join("");
            detailContainer.innerHTML = `
                <div class="detail-header">
                    <div>
                        <span class="detail-kicker">Pokémon n.º ${String(item.id).padStart(3, "0")}</span>
                        <h2 class="detail-name" id="dialog-name">${escapeHTML(item.name)}</h2>
                        <div class="detail-meta">${types.map((type) => `<span class="type-chip">${escapeHTML(type)}</span>`).join("")}</div>
                    </div>
                    <img class="detail-image" src="${imageUrl(item.id)}" alt="${escapeHTML(item.name)}">
                </div>
                <p class="detail-description">${escapeHTML(getSpanishDescription(species))}</p>
                <div class="detail-facts">
                    <span class="detail-fact">Altura<strong>${(details.height / 10).toFixed(1)} m</strong></span>
                    <span class="detail-fact">Peso<strong>${(details.weight / 10).toFixed(1)} kg</strong></span>
                    <span class="detail-fact">Experiencia base<strong>${details.base_experience ?? "—"}</strong></span>
                </div>
                <h3 class="stats-title">Estadísticas base</h3>
                ${stats}
            `;
        } catch (error) {
            detailContainer.innerHTML = "";
            const message = document.createElement("p");
            message.className = "detail-error";
            message.setAttribute("role", "alert");
            message.textContent = error.message || "No se pudieron cargar los detalles del Pokémon.";
            detailContainer.append(message);
        }
    }

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim().toLocaleLowerCase("es");
        renderCards(pokemon.filter((item) => item.name.toLocaleLowerCase("es").includes(query)));
    });

    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "/" && document.activeElement !== searchInput) {
            event.preventDefault();
            searchInput.focus();
        }
    });

    loadCatalog();
}());
