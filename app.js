// Adresse du smart contract déployé sur Ethereum
const contractAddress = "0x643746EeaE8DC434A2a76Bf1dCa83b53F53a3830";

// Variables globales
let web3;           // Instance Web3 (connexion blockchain)
let contract;       // Instance du smart contract
let userAccount;    // Adresse du portefeuille connecté
let contractABI;    // ABI du contrat (chargé depuis abi.json)
let isAdmin = false; // true si le compte connecté est le propriétaire du contrat


// ============================================================
// NOTIFICATIONS
// Affiche un message temporaire en haut à droite de l'écran
// type peut être : 'success' (vert), 'error' (rouge), 'info' (bleu)
// ============================================================

function showNotification(message, type = 'success') {
    let container = document.getElementById('notification-container');

    // Crée le conteneur la première fois
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        Object.assign(container.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });
        document.body.appendChild(container);
    }

    // Couleur et icône selon le type
    const styles = {
        success: { bg: '#14b8a6', icon: '✅' },
        error:   { bg: '#ef4444', icon: '❌' },
        info:    { bg: '#3b82f6', icon: 'ℹ️' }
    };

    // Crée l'élément notification
    const notif = document.createElement('div');
    notif.innerHTML = `
        <div style="background: #1e293b; color: white; padding: 15px 25px; border-radius: 8px;
                    border-left: 5px solid ${styles[type].bg}; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    display: flex; align-items: center; gap: 12px; min-width: 300px;
                    animation: slideIn 0.3s ease-out forwards;">
            <span>${styles[type].icon}</span>
            <span style="font-family: sans-serif; font-size: 14px;">${message}</span>
        </div>
    `;

    // Ajoute l'animation CSS si elle n'existe pas encore
    if (!document.getElementById('notif-style')) {
        const style = document.createElement('style');
        style.id = 'notif-style';
        style.innerHTML = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
        document.head.appendChild(style);
    }

    container.appendChild(notif);

    // La notification disparaît après 4 secondes
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateX(100%)';
        notif.style.transition = 'all 0.4s ease';
        setTimeout(() => notif.remove(), 400);
    }, 4000);
}


// ============================================================
// CHARGEMENT DE L'ABI
// L'ABI décrit les fonctions disponibles dans le smart contract.
// On le charge depuis le fichier abi.json local.
// ============================================================

async function loadABI() {
    const response = await fetch('abi.json?t=' + Date.now()); // ?t= évite le cache navigateur
    contractABI = await response.json();
}


// ============================================================
// CONNEXION DU PORTEFEUILLE (MetaMask)
// ============================================================

async function connectWallet() {
    if (!window.ethereum) {
        showNotification("Installez MetaMask !", "error");
        return;
    }

    web3 = new Web3(window.ethereum);

    try {
        await loadABI();

        // Demande à MetaMask l'accès aux comptes de l'utilisateur
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAccount = accounts[0].toLowerCase();

        // Affiche l'adresse dans la barre du haut
        document.getElementById("walletAddress").innerText = userAccount;
        document.getElementById("walletStatus").classList.replace("disconnected", "connected");
        document.getElementById("connectWalletBtn").style.display = "none";
        document.getElementById("disconnectWalletBtn").style.display = "inline-block";

        // Affiche l'adresse du contrat dans le footer
        const footerEl = document.getElementById("contractAddressFooter");
        if (footerEl) footerEl.innerText = contractAddress;

        // Crée l'objet contract pour appeler ses fonctions
        contract = new web3.eth.Contract(contractABI, contractAddress);

        // Vérifie si l'utilisateur est le propriétaire du contrat
        const ownerAddress = await contract.methods.owner().call();
        isAdmin = (userAccount === ownerAddress.toLowerCase());

        // Affiche la section admin ou utilisateur selon le rôle
        if (isAdmin) {
            document.getElementById("adminSection").style.display = "block";
            document.getElementById("userSection").style.display = "none";
            document.getElementById("adminDivider").style.display = "block";
            loadCancelRequests();
        } else {
            document.getElementById("adminSection").style.display = "none";
            document.getElementById("userSection").style.display = "block";
            document.getElementById("adminDivider").style.display = "none";
            loadMyTickets();
        }

        loadEvents();
        showNotification("Connecté avec succès !");

        // Si l'utilisateur change de compte dans MetaMask, on recharge la page
        window.ethereum.on('accountsChanged', () => window.location.reload());

    } catch (error) {
        showNotification("Connexion refusée", "error");
    }
}


// ============================================================
// DÉCONNEXION DU PORTEFEUILLE
// Remet l'interface dans son état initial
// ============================================================

function disconnectWallet() {
    userAccount = null;
    isAdmin = false;
    contract = null;

    document.getElementById("walletAddress").innerText = "Non connecté";
    document.getElementById("walletStatus").classList.replace("connected", "disconnected");
    document.getElementById("connectWalletBtn").style.display = "inline-block";
    document.getElementById("disconnectWalletBtn").style.display = "none";
    document.getElementById("adminSection").style.display = "none";
    document.getElementById("userSection").style.display = "none";

    showNotification("Déconnecté", "info");
}


// ============================================================
// FONCTIONS ADMIN
// ============================================================

// Crée un nouvel événement sur le smart contract
async function addEvent() {
    const name        = document.getElementById("eventName").value;
    const maxTickets  = document.getElementById("eventMaxTickets").value;
    const priceEth    = document.getElementById("eventPrice").value;
    const dateInput   = document.getElementById("eventDate").value;

    if (!name || !maxTickets || !priceEth || !dateInput) {
        showNotification("Veuillez remplir tous les champs", "error");
        return;
    }

    // Convertit le prix en Wei (unité de base d'Ethereum)
    const priceWei = web3.utils.toWei(priceEth.toString(), 'ether');
    // Convertit la date en timestamp Unix (secondes)
    const dateTimestamp = Math.floor(new Date(dateInput).getTime() / 1000);

    try {
        showNotification("Transaction en cours...", "info");
        await contract.methods.addEvent(name, maxTickets, priceWei, dateTimestamp).send({ from: userAccount });
        showNotification("Événement créé !");
        loadEvents();
    } catch (error) {
        showNotification("Erreur lors de la création", "error");
    }
}

// Encaisse les fonds d'un événement terminé
async function withdrawForEvent(eventId) {
    try {
        showNotification("Retrait des fonds...", "info");
        await contract.methods.withdrawForEvent(eventId).send({ from: userAccount });
        showNotification("Fonds récupérés !");
        loadEvents();
    } catch (error) {
        showNotification("Échec du retrait. Vérifiez les remboursements en attente.", "error");
    }
}

// Charge et affiche les demandes d'annulation en attente
async function loadCancelRequests() {
    if (!isAdmin) return;

    const list = document.getElementById("cancelRequestsList");
    list.innerHTML = "";

    try {
        const requests = await contract.methods.getCancelRequests().call({ from: userAccount });
        const events   = await contract.methods.getEvents().call();

        // On filtre pour ne garder que les demandes non encore traitées
        const pending = requests.filter(req => !req.isProcessed);

        if (pending.length === 0) {
            list.innerHTML = "<li class='empty-state'><span>Aucune demande en attente.</span></li>";
            return;
        }

        pending.forEach((req, index) => {
            const li = document.createElement("li");
            const eventName = events[req.eventId] ? events[req.eventId].name : `Événement #${req.eventId}`;

            li.innerHTML = `
                <div class="event-details">
                    <strong>${eventName}</strong><br>
                    <span style="font-size:11px; color:#94a3b8">Demandeur :</span><br>
                    <code style="font-size:10px; color:#14b8a6; word-break:break-all;">${req.user}</code>
                </div>
                <div style="display:flex; gap:5px; margin-top:10px;">
                    <button class="btn-success" style="padding:5px 10px; font-size:11px" onclick="processCancel(${index}, true)">✅ Accepter</button>
                    <button class="btn-danger"  style="padding:5px 10px; font-size:11px" onclick="processCancel(${index}, false)">❌ Refuser</button>
                </div>`;

            list.appendChild(li);
        });

    } catch (e) {
        showNotification("Erreur de chargement des demandes", "error");
    }
}

// Accepte ou refuse une demande d'annulation
async function processCancel(requestId, approve) {
    try {
        await contract.methods.processCancellation(requestId, approve).send({ from: userAccount });
        showNotification(approve ? "Remboursement accepté !" : "Demande refusée");
        loadCancelRequests();
        loadEvents();
    } catch (e) {
        showNotification("Erreur lors du traitement", "error");
    }
}


// ============================================================
// FONCTIONS UTILISATEUR
// ============================================================

// Charge et affiche tous les événements disponibles
async function loadEvents() {
    if (!contract) return;

    const list = document.getElementById("eventsList");
    list.innerHTML = "";

    try {
        const events = await contract.methods.getEvents().call();

        if (events.length === 0) {
            list.innerHTML = "<li class='empty-state'><span>Aucun événement disponible.</span></li>";
            return;
        }

        for (let index = 0; index < events.length; index++) {
            const ev = events[index];
            const li = document.createElement("li");
            const priceEth   = web3.utils.fromWei(ev.price.toString(), 'ether');
            const dateStr    = new Date(Number(ev.date) * 1000).toLocaleDateString("fr-FR");
            const isSoldOut  = Number(ev.sold) >= Number(ev.maxTickets);
            const hasPending = Number(ev.pendingRefundsCount) > 0;
            const noTickets  = Number(ev.sold) === 0;

            let actionHtml = "";

            if (isAdmin) {
                // Vue admin : bouton pour encaisser les fonds
                if (ev.fundsWithdrawn) {
                    actionHtml = `<span style="color:#10b981; font-weight:bold">✅ Encaissé</span>`;
                } else if (hasPending) {
                    actionHtml = `<button disabled class="btn-disabled">⚠️ Remboursements à traiter</button>`;
                } else if (noTickets) {
                    actionHtml = `<button disabled class="btn-disabled">Aucun billet vendu</button>`;
                } else {
                    actionHtml = `<button class="btn-success" onclick="withdrawForEvent(${index})">💰 Encaisser</button>`;
                }
            } else {
                // Vue utilisateur : bouton pour acheter un billet
                const alreadyBought = await contract.methods.hasBought(index, userAccount).call();
                if (ev.fundsWithdrawn) {
                    actionHtml = `<span style="color:#94a3b8">Événement terminé</span>`;
                } else if (alreadyBought) {
                    actionHtml = `<button disabled class="btn-disabled">✅ Billet acheté</button>`;
                } else if (isSoldOut) {
                    actionHtml = `<button disabled class="btn-disabled">COMPLET</button>`;
                } else {
                    actionHtml = `<button class="btn-primary" onclick="buyTicket(${index}, '${ev.price}')">Acheter (${priceEth} ETH)</button>`;
                }
            }

            li.innerHTML = `
                <div class="event-details">
                    <strong>${ev.name}</strong>
                    <span>📅 ${dateStr} &nbsp;|&nbsp; 🎟️ ${ev.sold}/${ev.maxTickets} billets vendus</span>
                </div>
                <div>${actionHtml}</div>`;

            list.appendChild(li);
        }

    } catch (e) {
        showNotification("Erreur de chargement des événements", "error");
    }
}

// Achète un billet pour un événement
async function buyTicket(eventId, priceWei) {
    try {
        showNotification("Achat en cours...", "info");
        await contract.methods.buyTicket(eventId).send({ from: userAccount, value: priceWei });
        showNotification("Billet acheté avec succès !");
        loadEvents();
        loadMyTickets();
    } catch (e) {
        showNotification("Échec de l'achat", "error");
    }
}

// Charge et affiche les billets de l'utilisateur connecté
async function loadMyTickets() {
    if (isAdmin) return; // L'admin n'a pas de billets

    const list = document.getElementById("myTicketsList");
    list.innerHTML = "";

    try {
        const events = await contract.methods.getEvents().call();
        let hasTickets = false;

        for (let i = 0; i < events.length; i++) {
            // Vérifie si l'utilisateur a acheté un billet pour cet événement
            const hasTicket = await contract.methods.hasBought(i, userAccount).call();

            if (hasTicket) {
                hasTickets = true;
                const li = document.createElement("li");

                // Vérifie directement via le contrat si une annulation est déjà en cours
                const isPending = await contract.methods.hasPendingRequest(i, userAccount).call();

                let btnHtml = "";
                if (events[i].fundsWithdrawn) {
                    btnHtml = `<span style="color:#ef4444; font-weight:bold">Événement clos</span>`;
                } else if (isPending) {
                    btnHtml = `<button disabled class="btn-disabled">⏳ Demande en cours...</button>`;
                } else {
                    btnHtml = `<button class="btn-danger" onclick="requestCancel(${i})">Annuler</button>`;
                }

                li.innerHTML = `
                    <div class="event-details">🎫 <strong>${events[i].name}</strong></div>
                    ${btnHtml}`;

                list.appendChild(li);
            }
        }

        if (!hasTickets) {
            list.innerHTML = "<li class='empty-state'><span>Vous n'avez aucun billet.</span></li>";
        }

    } catch (error) {
        showNotification("Erreur de chargement des billets", "error");
    }
}

// Envoie une demande d'annulation de billet
async function requestCancel(eventId) {
    try {
        showNotification("Envoi de la demande...", "info");
        await contract.methods.requestCancellation(eventId).send({ from: userAccount });
        showNotification("Demande d'annulation envoyée !");
        loadMyTickets();
    } catch (e) {
        showNotification("Erreur lors de l'annulation", "error");
    }
}

