#  Shopify-Payment-Middleware-Backend

**Project:** Jolly Phonics Bangladesh  
**Architecture:** Shopify Admin API + SSLCommerz Middleware (Node.js/TypeScript)  
**Hosting Environment:** Render (Free Tier Optimized)

This repository contains a specialized middleware designed to facilitate local payments via **SSLCommerz** for Shopify stores. It is engineered to bypass the standard 2% Shopify third-party transaction fee and optimize for zero-cost hosting on Render's free tier.

---

## ✨ Features

- **0% Transaction Fees:** Utilizes the Shopify Admin API to process payments as "Manual," bypassing platform taxes.
- **Latency-Masking:** Custom "Wake-Up" protocol to handle Render free-tier cold starts (~50s).
- **Hosting Savings:** Operates on Render's free tier, saving the initial $7/month hosting cost.
- **TypeScript Core:** Type-safe development for financial transactions.
- **Multi-Layer Security:** Includes Helmet, HPP, rate limiting, and input sanitization.
- **Accounting Ready:** Pre-configured data mapping for SSLCommerz Merchant Panel reconciliation.

---

## 🏗️ System Architecture Overview

This infrastructure facilitates local payments while maintaining a $0.00 overhead by intercepting the standard checkout flow.

1.  **Entry Point:** A custom Liquid "Online Payment" button replaces the standard checkout on the Shopify Cart page.
2.  **Transaction Flow:** Cart → Custom Checkout Form → Render Middleware → SSLCommerz Gateway → Shopify Admin API.
3.  **Order Finalization:** Orders are initialized as **Draft Orders**. Upon payment verification, the middleware converts them to **Completed Orders** and marks them as **Paid**. This classification ensures Shopify treats the transaction as "Manual," incurring **0% transaction fees**.

---

## ⚡ Infrastructure Optimization: Render Lifecycle

To utilize a zero-cost hosting model (Render Free Tier) without compromising user experience, the system employs a **Latency-Masking Wake-Up Protocol**:

* **Initial Trigger (T+0s):** A background dummy request hits the Render backend immediately when the user clicks "Online Payment" on the cart.
* **Cold-Start Buffer:** While Render initiates the server spin-up, the user is redirected to a custom form to enter shipping details. This manual input process (~45s) naturally masks the Render boot time.
* **IPN Persistence:** Render’s 15-minute inactivity timer matches the SSLCommerz 15-minute session window. This ensures the server remains awake to receive and validate the **Instant Payment Notification (IPN)** before returning to a sleep state.

---

## 📊 SSLCommerz Data Mapping Protocol

The middleware transmits specific metadata to SSLCommerz to automate backend lookups and facilitate accurate financial reporting for the organization.

| Field | Purpose | Technical Value / Source |
| :--- | :--- | :--- |
| **`value_a`** | Store Identifier | `JOLLY_PHONICS_BANGLADESH` |
| **`value_b`** | Internal Lookup ID | `{order.transaction_id}` (Shopify Draft ID) |
| **`value_c`** | Product Category | `PHYSICAL_BOOKS` |
| **`value_d`** | Customer Metadata | `{order.customer_email}` |
| **`tran_id`** | Transaction ID | `{order.transaction_id}` |

---

## 🛠️ Operational Workflows

### Developer & System Validation
The system utilizes a multi-step validation process within the `validateSSLPayment` function to ensure transaction security:
* **Status Verification:** Confirms a `VALID` or `VALIDATED` status from the SSLCommerz API.
* **Precision Matching:** Implements a **±0.01 BDT tolerance** check to prevent errors caused by floating-point rounding between the bank and Shopify.
* **Integrity Check:** Compares the returned `tran_id` against the internal `expectedTransactionId` to prevent session spoofing.

### Accounting & Reconciliation
To audit sales within the SSLCommerz Merchant Panel:
1.  Export the **Transaction Report** (CSV/Excel).
2.  Filter the **"Custom Field 1"** (`value_a`) column for `JOLLY_PHONICS_BANGLADESH`.
3.  Use **"Custom Field 2"** (`value_b`) to cross-reference the transaction with the specific Shopify Order ID.

---

## 💰 Financial Impact Analysis

* **Shopify Fee Savings:** Eliminates the 2% Shopify "Third-Party Provider" fee (saving approx. **৳2,000 per ৳100,000** processed).
* **Hosting Optimization:** Eliminates the requirement for a paid "Starter" instance (saving **$7.00 USD/month**).
* **Total Efficiency:** This architecture allows the business to scale with zero fixed overhead and zero transaction-based platform taxes.

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

### ⚙️ Environment Variables

```env
PORT=8080
DB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/database
NODE_ENV=production
BASE_URL=https://backendurl.com
ORIGINS=https://sandbox.sslcommerz.com,https://securepay.sslcommerz.com,https://setyourfrontends.com
SHOPIFY_STORE=jolly-phonics-bangladesh.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2026-01
SSL_STORE_ID=your_store_id
SSL_STORE_PASS=your_store_password
SSL_IPS=103.26.139.87,87,103.26.139.81,103.132.153.81,103.132.153.148
```
## 🛡️ Security & Maintenance 
* **Access Control :**  Ensure the Shopify Admin Access Token is strictly restricted to write_draft_orders and write_orders scopes to maintain the principle of least privilege.

* **Session Management:** The 15-minute Render inactivity timeout must be monitored to ensure it consistently encompasses the full SSLCommerz payment lifecycle and IPN receipt.

## HACK NOTE:
* This architecture treats the API update as a "Manual" payment, effectively creating a private, toll-free payment lane for the store at zero infrastructure cost.

---
## 🧑‍💻 Author

Mezbaur Are Rafi – [GitHub](https://github.com/mezbaur2004)