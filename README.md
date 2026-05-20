# 🤖 RB-STORE-BOT

A WhatsApp automation bot for RB-STORE, built with Node.js and `@whiskeysockets/baileys`.

## ✨ Features

*   **WhatsApp Connection:** Secure session saving, QR code login, auto-reconnect, and anti-crash handlers.
*   **User Commands:** `!help`, `!ping`, `!orders`, `!contact`.
*   **Service Flows:** Guided conversations for ordering virtual numbers, website development, VPN, proxy, graphics design, and followers boosting.
*   **Ordering System:** Generates unique order IDs, tracks order status, handles payment proof, and notifies admin.
*   **Admin Commands:** `!restart`, `!stop`, `!broadcast`, `!status`, and a custom `send` command to mark orders as delivered.
*   **DM Only:** The bot is designed to work exclusively in direct messages, ignoring group chats.
*   **Cooldown & Delay:** Includes a 3-second per-user cooldown and a 3-second delay before every bot reply to prevent spam and ensure a smoother user experience.

## 🚀 Setup & Installation

### Prerequisites

*   Node.js v20+ installed.
*   A WhatsApp account to link with the bot.

### 1. Clone the repository

```bash
git clone https://github.com/your-username/rb-store-bot.git # Replace with your repo if applicable
cd rb-store-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configuration

Edit the `config.json` file:

```json
{
  "ownerNumber": "2348101754541",
  "prefix": "!",
  "botName": "RB-STORE-BOT"
}
```

*   `ownerNumber`: Your WhatsApp number without the `+` sign (e.g., "2348101754541"). This number will have access to admin commands.
*   `prefix`: The character that precedes commands (e.g., `!`).
*   `botName`: The name of your bot.

### 4. Run the Bot

```bash
npm start
```

On first run, a QR code will be displayed in your terminal. Scan it with your WhatsApp mobile app (WhatsApp Settings > Linked Devices > Link a Device).

### 5. Termux Setup (for Android users)

1.  **Install Termux:** Download from F-Droid or Play Store.
2.  **Update & Upgrade:**
    ```bash
    pkg update && pkg upgrade -y
    ```
3.  **Install Node.js & Git:**
    ```bash
    pkg install nodejs git -y
    ```
4.  **Clone & Install (same as above):**
    ```bash
    git clone https://github.com/your-username/rb-store-bot.git
    cd rb-store-bot
    npm install
    ```
5.  **Run:**
    ```bash
    npm start
    ```

## ⚙️ PM2 Setup (for continuous uptime)

PM2 is a production process manager for Node.js applications with a built-in load balancer. It keeps your bot running 24/7 and restarts it automatically if it crashes.

### 1. Install PM2

```bash
npm install -g pm2
```

### 2. Start your bot with PM2

Navigate to your bot's directory and run:

```bash
pm2 start bot.js --name rb-store-bot
```

This will start your bot and keep it running in the background.

### 3. Manage PM2 Processes

*   **List all PM2 processes:**
    ```bash
    pm2 list
    ```
*   **View logs for your bot:**
    ```bash
    pm2 logs rb-store-bot
    ```
*   **Stop your bot:**
    ```bash
    pm2 stop rb-store-bot
    ```
*   **Restart your bot:**
    ```bash
    pm2 restart rb-store-bot
    ```
*   **Delete your bot from PM2:**
    ```bash
    pm2 delete rb-store-bot
    ```
*   **Save PM2 process list (to auto-start on system reboot):**
    ```bash
    pm2 save
    pm2 startup
    ```
    Follow the instructions provided by `pm2 startup` to configure PM2 to start on system boot.

### 4. Keep Alive (Prevent Termux from sleeping)

If running on Termux, you can prevent your device from sleeping and killing background processes:

1.  **Termux Wake Lock:** Pull down your notification shade, find the Termux notification, and tap "Acquire wakelock."
2.  **Battery Optimization:** Go to your phone's battery settings and disable battery optimization for the Termux app.

## 🗑️ .gitignore

This project includes a `.gitignore` to prevent committing sensitive or unnecessary files:

```
node_modules/
auth_info/
.env
.pm2/
logs/
```

*   `auth_info/`: Contains your WhatsApp session data. **Keep this private!**

## 📜 License

This project is licensed under the MIT License.
