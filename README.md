# Billetterie Décentralisée

Application de billetterie sur blockchain Ethereum permettant à un administrateur de créer des événements et aux utilisateurs d'acheter des billets via smart contract.

## Prérequis

Avant de lancer le projet, assurez-vous d'avoir installé :

- **[Ganache](https://trufflesuite.com/ganache/)** — blockchain Ethereum locale pour les tests
- **[Extension MetaMask](https://metamask.io/)** — portefeuille Ethereum dans votre navigateur

## Déployer le smart contract

1. Ouvrez **[Remix IDE](https://remix.ethereum.org)**
2. Créez un nouveau fichier et copiez-y le contenu de `contract.sol`
3. Compilez le contrat (onglet **Solidity Compiler**, version `^0.8.24`)
4. Déployez le contrat :
   - Onglet **Deploy & Run Transactions**
   - Environment : **Injected Provider - MetaMask**
   - Assurez-vous que MetaMask est connecté au réseau Ganache (voir section suivante)
   - Cliquez sur **Deploy**
5. Après le déploiement, copiez l'**adresse du contrat** depuis Remix
6. Mettez à jour `app.js` ligne 2 avec cette adresse :
   ```js
   const contractAddress = "0xVotreAdresseDeContrat";
   ```
7. Exportez l'**ABI** depuis Remix (onglet Compiler > bouton ABI) et remplacez le contenu de `abi.json`

## Configurer MetaMask avec Ganache

1. Lancez **Ganache** et notez le RPC URL (par défaut `HTTP://127.0.0.1:7545`) et le **Chain ID** (par défaut `1337`)
2. Dans MetaMask, ajoutez un réseau personnalisé :
   - Nom du réseau : `Ganache`
   - URL RPC : `http://127.0.0.1:7545`
   - Chain ID : `1337`
   - Symbole : `ETH`
3. Importez un compte Ganache dans MetaMask en copiant sa clé privée depuis l'interface Ganache

## Lancer le frontend

Depuis le dossier du projet, lancez un serveur HTTP local :

```bash
npx http-server .
```

Puis ouvrez votre navigateur sur l'URL affichée (ex: `http://127.0.0.1:8080`).

> Un serveur HTTP est nécessaire car le navigateur bloque le chargement de fichiers locaux (`abi.json`) en protocole `file://`.

## Utilisation

### En tant qu'administrateur (compte déployeur)

- Connectez MetaMask avec le compte qui a déployé le contrat
- Créez des événements (nom, nombre de billets, prix en ETH, date)
- Gérez les demandes d'annulation (accepter = rembourser, refuser = conserver les fonds)
- Encaissez les fonds d'un événement une fois tous les remboursements traités

### En tant qu'utilisateur

- Connectez MetaMask avec n'importe quel autre compte Ganache
- Achetez un billet pour un événement disponible
- Demandez une annulation si nécessaire (en attente de validation admin)

## Structure du projet

```
ProjetSmartContracts/
├── contract.sol   # Smart contract Solidity
├── abi.json       # ABI du contrat (généré depuis Remix)
├── index.html     # Interface utilisateur
├── app.js         # Logique frontend (Web3.js)
└── style.css      # Styles de l'interface
```
