// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EventTicketing
 * @notice Système de billetterie décentralisée sur Ethereum.
 *         Permet à un administrateur de créer des événements, aux utilisateurs
 *         d'acheter des billets, de demander une annulation, et à l'admin
 *         d'encaisser les fonds une fois tous les litiges résolus.
 */
contract EventTicketing {

    /// @notice Adresse du propriétaire du contrat (administrateur)
    address public owner;

    /**
     * @notice Représente un événement créé par l'administrateur.
     * @dev `pendingRefundsCount` bloque le retrait des fonds tant qu'il reste
     *      des demandes d'annulation non traitées, évitant ainsi un encaissement
     *      prématuré qui rendrait les remboursements impossibles.
     */
    struct Event {
        string  name;                 // Nom de l'événement
        uint256 maxTickets;           // Capacité maximale de l'événement
        uint256 price;                // Prix d'un billet en Wei
        uint256 sold;                 // Nombre de billets vendus
        uint256 date;                 // Date de l'événement (timestamp Unix)
        bool    active;               // false si l'événement est clôturé
        bool    fundsWithdrawn;       // true si l'admin a déjà encaissé les fonds
        uint256 pendingRefundsCount;  // Nombre de demandes d'annulation en attente
    }

    /**
     * @notice Représente une demande de remboursement soumise par un acheteur.
     * @dev Une demande ne peut être soumise qu'une seule fois par utilisateur
     *      par événement (contrôlé via `hasPendingRequest`).
     */
    struct CancelRequest {
        uint256 eventId;    // Identifiant de l'événement concerné
        address user;       // Adresse de l'acheteur demandant l'annulation
        bool    isProcessed; // true une fois que l'admin a statué (accepté ou refusé)
    }

    /// @notice Liste de tous les événements créés
    Event[] public events;

    /// @notice Liste de toutes les demandes d'annulation soumises
    CancelRequest[] public cancelRequests;

    /// @dev eventId => (adresse acheteur => a acheté un billet ?)
    mapping(uint256 => mapping(address => bool)) public hasBought;

    /// @dev eventId => (adresse acheteur => a une demande en cours ?)
    ///      Empêche un utilisateur de soumettre plusieurs demandes pour le même billet.
    mapping(uint256 => mapping(address => bool)) public hasPendingRequest;

    /// @notice Émis lorsqu'un billet est acheté avec succès
    event TicketBought(uint256 indexed eventId, address indexed user);

    /// @notice Émis lorsqu'une demande d'annulation est traitée par l'admin
    event RefundProcessed(uint256 indexed requestId, bool approved);

    /// @notice Déploie le contrat et définit l'adresse déployante comme propriétaire
    constructor() {
        owner = msg.sender;
    }

    /// @dev Restreint l'accès aux fonctions sensibles au seul propriétaire du contrat
    modifier onlyOwner() {
        require(msg.sender == owner, "Pas owner");
        _;
    }

    // =========================================================================
    // FONCTIONS ADMINISTRATEUR
    // =========================================================================

    /**
     * @notice Crée un nouvel événement et l'ajoute à la liste.
     * @param _name       Nom de l'événement
     * @param _maxTickets Nombre maximum de billets disponibles
     * @param _priceWei   Prix d'un billet en Wei
     * @param _date       Date de l'événement sous forme de timestamp Unix
     */
    function addEvent(
        string memory _name,
        uint256 _maxTickets,
        uint256 _priceWei,
        uint256 _date
    ) public onlyOwner {
        events.push(Event({
            name:                _name,
            maxTickets:          _maxTickets,
            price:               _priceWei,
            sold:                0,
            date:                _date,
            active:              true,
            fundsWithdrawn:      false,
            pendingRefundsCount: 0
        }));
    }

    /**
     * @notice Permet à l'admin d'encaisser les recettes d'un événement.
     * @dev    Le retrait est bloqué si des demandes d'annulation sont encore en attente,
     *        afin de garantir que les fonds nécessaires aux remboursements sont toujours
     *        disponibles dans le contrat.
     * @param eventId Identifiant de l'événement dont on veut encaisser les fonds
     */
    function withdrawForEvent(uint256 eventId) public onlyOwner {
        Event storage ev = events[eventId];

        require(!ev.fundsWithdrawn, "Fonds deja retires");
        require(ev.pendingRefundsCount == 0, "Traitez les remboursements d'abord");

        // Marque l'événement comme clôturé avant le transfert (protection reentrancy)
        ev.fundsWithdrawn = true;
        ev.active = false;

        uint256 amount = ev.sold * ev.price;
        require(address(this).balance >= amount, "Solde insuffisant");

        // Utilisation de call plutôt que transfer pour éviter les problèmes de gas limit
        (bool success,) = payable(owner).call{value: amount}("");
        require(success, "Withdraw fail");
    }

    /**
     * @notice Traite une demande d'annulation : accepte (remboursement) ou refuse.
     * @dev    L'ordre des opérations est intentionnel :
     *         1. Marquer comme traitée (évite double traitement)
     *         2. Libérer le verrou utilisateur
     *         3. Décrémenter le compteur de l'événement
     *         4. Effectuer le remboursement en dernier (protection contre la réentrance)
     * @param requestId Identifiant de la demande dans le tableau `cancelRequests`
     * @param approve   true pour rembourser, false pour refuser
     */
    function processCancellation(uint256 requestId, bool approve) public onlyOwner {
        CancelRequest storage req = cancelRequests[requestId];
        Event storage ev = events[req.eventId];

        require(!req.isProcessed, "Deja traitee");

        // 1. Marquer la demande comme traitée
        req.isProcessed = true;

        // 2. Libérer le verrou anti-doublon de l'utilisateur
        hasPendingRequest[req.eventId][req.user] = false;

        // 3. Décrémenter le compteur de demandes en attente de l'événement
        if (ev.pendingRefundsCount > 0) {
            ev.pendingRefundsCount -= 1;
        }

        if (approve) {
            require(!ev.fundsWithdrawn, "Fonds deja retires");

            // Retirer le billet de l'acheteur et libérer une place
            hasBought[req.eventId][req.user] = false;
            ev.sold -= 1;

            // 4. Rembourser l'acheteur en dernier (pattern checks-effects-interactions)
            payable(req.user).transfer(ev.price);
        }

        emit RefundProcessed(requestId, approve);
    }

    // =========================================================================
    // FONCTIONS UTILISATEUR
    // =========================================================================

    /**
     * @notice Achète un billet pour un événement en envoyant exactement le prix requis.
     * @dev    `msg.value` doit être égal au prix exact pour éviter les sur/sous-paiements.
     * @param eventId Identifiant de l'événement pour lequel acheter un billet
     */
    function buyTicket(uint256 eventId) public payable {
        Event storage ev = events[eventId];

        require(ev.active, "Event inactive");
        require(!ev.fundsWithdrawn, "Event cloture");
        require(ev.sold < ev.maxTickets, "Sold out");
        require(!hasBought[eventId][msg.sender], "Deja billet");
        require(msg.value == ev.price, "Prix exact");

        hasBought[eventId][msg.sender] = true;
        ev.sold += 1;

        emit TicketBought(eventId, msg.sender);
    }

    /**
     * @notice Soumet une demande d'annulation pour un billet déjà acheté.
     * @dev    Le verrou `hasPendingRequest` garantit qu'un utilisateur ne peut pas
     *         spammer des demandes pour le même billet et ainsi bloquer indéfiniment
     *         l'encaissement des fonds par l'admin.
     * @param eventId Identifiant de l'événement dont on veut annuler le billet
     */
    function requestCancellation(uint256 eventId) public {
        require(hasBought[eventId][msg.sender], "Pas de billet");
        require(!events[eventId].fundsWithdrawn, "Evenement deja cloture");
        require(!hasPendingRequest[eventId][msg.sender], "Demande deja en cours");

        // Poser le verrou avant d'enregistrer la demande
        hasPendingRequest[eventId][msg.sender] = true;
        events[eventId].pendingRefundsCount += 1;

        cancelRequests.push(CancelRequest(eventId, msg.sender, false));
    }

    // =========================================================================
    // FONCTIONS DE LECTURE (VIEW)
    // =========================================================================

    /// @notice Retourne la liste complète des événements (utilisée par le frontend)
    function getEvents() public view returns (Event[] memory) {
        return events;
    }

    /// @notice Retourne la liste complète des demandes d'annulation (admin seulement en pratique)
    function getCancelRequests() public view returns (CancelRequest[] memory) {
        return cancelRequests;
    }

    /**
     * @notice Indique si l'appelant possède un billet pour un événement donné.
     * @param eventId Identifiant de l'événement
     * @return true si msg.sender a acheté un billet pour cet événement
     */
    function myTickets(uint256 eventId) public view returns (bool) {
        return hasBought[eventId][msg.sender];
    }
}