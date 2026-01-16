# **Feed Engine: Decentralized Human-Powered Price Feeding System**

### *Engineering Logic Specification (Condensed Version · 2 A4 Pages)*

---

# **1. Essence of the Feed Engine (Core Principle)**

Price feeding is **not** simply “reporting a price.”

It is a **Settlement Responsibility Layer**.

The system answers three fundamental questions:

1. **Who confirms which price will be used?**
2. **Who bears responsibility for that price?**
3. **Who guarantees the validity of this price for on-chain settlement?**

**API market data ≠ a valid settlement price.**

Only a **signed price submitted by a feeder** becomes a *non-repudiable*, settlement-grade on-chain value.

---

# **2. The Five Core Problems the Feed Engine Solves**

### **Price Source**

Feeders consult their own market tools → human validation prevents misquotes, halts, gaps, anomalies.

### **Price Responsibility**

Signature = responsibility.

Accurate → rewarded; wrong → penalized.

### **Fairness**

Auction-based job grabbing + multi-feeder consensus (2/3, 3/5, etc.) → prevents manipulation.

### **Decentralization**

The platform does not provide prices and is not responsible for settlement.

All responsibility lies with feeders.

### **Incentives**

Token rewards + collateral penalties keep feeders honest and long-term engaged.

---

# **3. Feeder Entry Requirements**

A feeder must:

- Understand their chosen market (A-shares, U.S. equities, crypto, etc.)
- Have access to official market data sources
- Provide collateral via one of the following:
    - FEED tokens
    - USDT
    - Feeder-License NFT (transferable seat-model)

Collateral =承担责任

Qualification = share revenue

Feeders select markets during onboarding → system allocates orders accordingly.

---

# **4. Feed Order Pool (Core Mechanism)**

All feed requests from on-chain protocols (NST or others)

→ stored via IPFS

→ pushed into the **Order Feed Hall**.

### **Rules:**

- Order cards show **symbol / market / timestamp**
- First-come-first-serve: details hidden until the order is grabbed
- Once grabbed → feeder obtains feed rights + countdown timer
- Timeout → forfeited slot → system reassigns to the next bidder
- Each order defines a consensus quorum (2/3, 3/5, 7/10, etc.)
- Submitted feed prices remain hidden until quorum is reached
- Once quorum is met → **consensus price is finalized and stored on-chain**

**Lifecycle:**

Pool → Grab → Feed → Consensus → On-chain Settlement

---

# **5. Four Types of Price Feeds (Different Responsibilities)**

1. **Initial Feed**
    
    Establishes the initial margin reference.
    
2. **Dynamic Feed (Intraday Margin Call)**
    
    Determines margin call or liquidation risk.
    
3. **Final/Settlement Feed**
    
    Determines PnL, exercise value, or forced-liquidation price.
    
4. **Arbitration Feed**
    
    For disputed cases; exclusive to high-tier feeders; highest responsibility and reward.
    

In CFD stages, feeds are frequent; pricing parameters adjust dynamically (higher frequency → lower cost).

---

# **6. Multi-Feeder Consensus (Trust Mechanism)**

Example: three feeders submit:

- 186.30
- 186.29
- 186.33

System automatically selects the **median = 186.30**

→ final settlement price.

Responsibility is collectively shared, reducing the risk of collusion.

If a feeder selects “Unable to feed” (halted, no data, incorrect symbol), the service is still billed.

---

# **7. Reward Mechanism: Behavioral Mining (FEED Token)**

Example: Each feed request costs **5 USDT**

System mints **10 FEED**:

- 6 FEED → Feeders
- 1 FEED → Platform
- 1 FEED → Node dividends
- 1 FEED → Bonus pool
- 1 FEED → Burned

Dynamic supply:

- Low load → high rewards → accelerates feeder onboarding
- High load → lower emissions → stabilizes token economy

Suggested fixed supply: **10,000,000 FEED**.

---

# **8. Penalty Mechanism (Ensures Accountability)**

Triggered when:

- Price is clearly incorrect
- Malicious feeding
- Ignoring market conditions
- Collusion
- Multiple arbitration failures

Penalties include:

- Collateral slashing (USDT or FEED)
- Token deductions
- Rank demotion
- 7-day ban from job grabbing
- Feeder-License NFT downgrade

System must include behavior monitoring and anomaly detection.

---

# **9. Gamified Feeder System (Retention & Engagement)**

Ranks: **F → E → D → C → B → A → S**

Higher ranks provide:

- Priority access to high-value orders
- Lower collateral requirements
- Higher rewards
- Access to exclusive pools
- S-level: arbitration authority

### **XP Sources:**

- Successful feed
- Precision feed (<0.05% deviation)
- Daily tasks
- Weekly tasks
- Seasonal ranking rewards
- Arbitration loss → XP penalty
- Malicious feed → severe XP penalty

Tasks include:

- 1/3/5 feeds per day
- Precision missions
- Seasonal leaderboards (NFT rewards)

Creates a **Duolingo-style long-term engagement loop**.

---

# **10. FEED Token Economic Flywheel**

FEED derives value from:

1. **Real feed demand (utility)**
2. **Collateral staking (qualification)**
3. **Gamified rewards (XP, badges, NFTs)**
4. **Mandatory consumption (burn/penalty/upgrade)**

Token utilities include:

- Job-grabbing fee
- Rank upgrades
- Penalty deductions
- Feeder staking
- DAO governance
- Feeder tool NFTs (future expansion)

More feeds → more consumption → FEED becomes increasingly scarce.

---

# **11. System Flow (For Engineers)**

1. External protocol requests a feed
2. Order metadata stored on IPFS
3. Order displayed in the Feed Hall
4. Feeders grab the order
5. Feeders submit hidden prices
6. Consensus threshold reached → median price selected
7. Price written on-chain
8. Price returned to caller protocol
9. Settlement executed
10. Rewards / penalties applied
11. XP updates → rank progression
12. Feeder rejoins cycle at a higher tier

A complete financial loop.

---

# **12. System Security Requirements**

- Anti-bot job grabbing
- Signature verification
- Timeout protection
- Anti-collusion via multi-feeder consensus
- Behavioral anomaly detection
- Smart contract re-entrancy protection
- Arbitration as secondary validation layer

---

# **13. Relationship Between Feed Engine and NST**

These are **two fully independent protocols**:

| Protocol | Role |
| --- | --- |
| **Feed Engine** | Human Oracle Layer |
| **NST** | Non-standard asset trading protocol |

NST can call FEED via:

→ `requestFeed(orderId, feedType)`

FEED returns:

→ `consensusPrice(orderId)`

Separation ensures modularity and neutrality.

---

# **14. Required Flywheel (Engineers Must Preserve)**

Feed request

→ Grab

→ Feed

→ Consensus

→ Reward

→ Rank up

→ More job access

→ More feeds

Ecosystem grows as feeder competency accumulates.

---

# **Final Summary**

🟦 First decentralized human-driven Oracle system

🟩 Built on responsibility, multi-party consensus, and incentives

🟧 Any blockchain protocol (including NST) can integrate

🟥 This is foundational Web3 human-oracle infrastructure

Below is the **full English translation**, polished to **professional, investor-ready, Web3-native English**, while preserving your tone, structure, and all gaming metaphors.

---

# ✅ **Price-Feed Hall (Order Hall) · Gamified UI (Enhanced & Polished Version)**

Entering the Price-Feed Hall should feel like stepping into a game lobby—immersive, interactive, and intensely engaging for all feeders.

---

## 🌀 **Beginner Zone (Low-Value Orders)**

**Characteristics:**

- Low difficulty
- Lower rewards
- Ideal for feeder leveling
- Reduces entry barriers and boosts early-stage participation

---

## 🔥 **Competitive Zone (Mid-Value Orders)**

**Characteristics:**

- High competition
- Higher rewards
- Fast-paced order grabbing
- Creates a matchmaking-style tension among feeders

---

## 💎 **Master Zone (High-Value Orders)**

**Access Requirement: A / S-rank Feeders Only**

**Characteristics:**

- Extremely high rewards
- Higher risk and responsibility
- Feels like a “high-level dungeon” in games
- Establishes a prestige-based hierarchy among top feeders

---

## 🎮 **UI Design (Fully Gamified Experience)**

To make feeders **unable to resist** and **highly addicted**, the UI incorporates:

- Each order displayed as a **Quest Card**
- Quest Cards feature **breathing (pulse) animations**
- Countdown timers mimic **skill cooldown animations** in games
- “Grab Order” button includes **sound effects + press animation**
- Successful order grabbing triggers **golden particle effects**

👉 The price-feed system is no longer dull—it's a **Game Quest Hall**.

---

# ⚡ ④ **Price-Feed Submission → Dynamic Effects (Authority + Achievement Feedback)**

When a feeder clicks “Submit Price Feed,” the following animations appear:

### ✨ Visual Effects:

- Golden light bursts from the button
- The price value **flies toward a blockchain icon** (on-chain animation)
- A **chain-lock icon closes**, indicating the feed is confirmed on-chain

After submission, display:

> “Price Feed Submitted · Block Height: xxxxxx”
> 

This creates a sense of authority, ownership, and emotional reward.

---

# ⚡ ⑤ **Multi-Feeder Consensus = Team Dungeon Mechanic (3-Player Party)**

Each order requires **3 feeders** to submit prices →

The protocol automatically takes the **median price** as the final settlement price.

This forms:

- A **collaborative teaming mechanism**
- A shared mission between three feeders
- Strong resistance against manipulation

### UI Animations:

- Three feeder avatars light up one by one
- When all three submit, a **golden connection line** appears
- Prompt: **“Price Feed Completed → Entering Settlement Phase”**

👉 Reinforces teamwork and a sense of ritual when completing tasks together.

---

# ⚡ ⑥ **Penalty System = Game-Style Rank Drop (Strong Psychological Pressure)**

When a feeder submits malicious or extremely inaccurate prices, the system automatically applies penalties:

- Rank demotion
- XP loss
- Temporary ban from high-tier orders
- Repeated offenses → suspension or permanent ban

This feels similar to:

- **Rank drops in competitive games**
- **Losing a streak in Duolingo**

Such mechanisms are incredibly effective at enforcing discipline and accuracy.

---

# ⚡ ⑦ **FEED Token Economic Model (True Closed-Loop Utility Token)**

This is not a generic token—this is a **real economy** with:

- Strong utility
- Strong consumption
- Strong retention
- Strong lock-in

---

## **FEED Inflow (Issuance Side):**

- User-paid feeding fees
- Platform rewards
- Seasonal rewards
- Node rewards

→ All are **real, sustainable revenue sources**

---

## **FEED Outflow (Critical Value Driver):**

- Order grabbing requires FEED (ticket mechanic)
- Penalties burn FEED (anti-cheat)
- Upgrading tools (Price-Feed Tool NFTs) consumes FEED
- Leveling up feeder ranks consumes FEED (similar to in-game progression)

→ Continuous FEED consumption creates organic upward price pressure.

---

## **FEED Locking (Long-Term Value Anchor):**

- Staking required to become a feeder
- Higher staking for A / S-rank feeders
- High-tier “Boss Missions” require FEED entry tickets

→ Locking increases token scarcity and stability.

---

# ⚡ ⑧ **Complete Closed-Loop Economy (Highly Robust & Mature)**

The feeder lifecycle:

> Complete quests → Level up → Gain higher grab priority → Earn more rewards → Reinvest FEED → Re-enter ecosystem
> 

This creates a **self-reinforcing flywheel**:

### “Duolingo + GameFi + Oracle Network”

Composed of:

- Continuous participation
- Continuous consumption
- Continuous earnings
- Continuous growth
- Continuous governance
- Continuous community expansion

While other projects rely on **APIs**, you rely on:

# **The world’s first Human Oracle Network — a moat impossible to replicate.**