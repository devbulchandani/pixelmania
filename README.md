# ⛩️ Omikuji (おみくじ)

**Instant, Gasless Multiplier Gaming on Yellow Network**

Omikuji is a decentralized high-frequency gaming platform built on the **Yellow Network** using **Nitrolite (ERC-7824)**. It brings the traditional Japanese "sacred lot" experience to Web3, allowing players to place bets on moving multiplier boxes with instant off-chain finality and zero transaction friction.

---

## 🚀 The Vision
In traditional Web3 gaming, every move requires a wallet confirmation and a wait for block finality. This latency kills the excitement of high-frequency gaming. **Omikuji** solves this by moving the entire game loop into **State Channels**. 

* **One Signature** to start the session.
* **Infinite Moves** with zero popups.
* **Instant Settlement** when you're done.

---

## 🏗️ Technical Architecture

Omikuji utilizes a **Dual-Signer Architecture** to decouple security from speed:

1.  **Main Wallet (MetaMask):** Used exclusively for on-chain transactions (Deposit/Withdraw) and the initial **EIP-712 Authentication** challenge.
2.  **Session Key (Ephemeral):** A module-level ECDSA key generated fresh each session. It signs every game move and state update off-chain, enabling a "Web2-like" UX without sacrificing non-custodial security.



### How it's Made (The Tech Stack)
* **Infrastructure:** [Yellow Network](https://www.yellow.com/) Clearnode via WebSockets.
* **State Channels:** [@erc7824/nitrolite](https://www.npmjs.com/package/@erc7824/nitrolite) for off-chain state management.
* **Database:** [NeonDB](https://neon.tech/) (Serverless Postgres) with **Prisma ORM** for session persistence and global leaderboards.
* **Identity:** **ENS (Ethereum Name Service)** integration for human-readable player profiles.
* **Frontend:** Next.js 14, Tailwind CSS, Wagmi, and Viem.

---

## ⛩️ Game Flow & Logic

### 1. The Yellow Session Handshake
We built a robust `useYellowSession` hook that manages the complex handshake with the Yellow Clearnode:
* **AuthRequest:** Initiates the session.
* **AuthChallenge:** Triggers the MetaMask EIP-712 signature.
* **AuthVerify:** Validates the session key for the next 3600 seconds.

### 2. The Multiplier Engine
The game uses **Virtual Ledgering**. When a user hits a multiplier box:
* An off-chain state update is signed by the Session Key.
* The "Virtual Pool" in the UI updates instantly.
* The state is persisted to **NeonDB** to allow session recovery if the browser refreshes.



### 3. ENS Identity
To bridge the gap between "Anonymity" and "Identity," Omikuji resolves the `walletAddress` to an **ENS name** (e.g., `omikuji.eth`). This is used to display a global leaderboard of the luckiest "Daikichi" (Great Blessing) winners.

---

## 📦 Installation & Setup

### Prerequisites
* Node.js 18+
* A NeonDB Connection String
* Alchemy/Infura RPC for Sepolia or Base Testnet

### Step-by-Step
1.  **Clone the Repo:**
    ```bash
    git clone [https://github.com/your-username/omikuji.git](https://github.com/your-username/omikuji.git)
    cd omikuji
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root:
    ```env
    DATABASE_URL="postgresql://user:password@host/neondb?sslmode=require"
    NEXT_PUBLIC_ALCHEMY_ID="your_api_key"
    NEXT_PUBLIC_YELLOW_WS="wss://[clearnet-sandbox.yellow.com/ws](https://clearnet-sandbox.yellow.com/ws)"
    ```

4.  **Initialize Database:**
    ```bash
    npx prisma db push
    npx prisma generate
    ```

5.  **Run Development Server:**
    ```bash
    npm run dev
    ```

---

## 🧠 Technical Challenges Overcome
* **Handshake Protocol:** Solved the `WebSocket 1006` handshake errors by implementing custom protocol headers (`nitro-rpc`) and origin-verified tunnels.
* **Signature Debugging:** Built a custom utility to verify `keccak256` hashes of state objects to ensure the user and Yellow server signatures matched perfectly.
* **BigInt Serialization:** Implemented a custom JSON serializer to handle high-precision Wei values from Prisma without losing accuracy in the UI.

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---

**Built with ❤️ for the Yellow Network Hackathon.**
