from chatgpt,
Here’s a **clean, production-style Docker setup** for FreshRSS on Ubuntu Server 👇

---

# 🐳 Install FreshRSS with Docker (recommended)

## 1. Install Docker + Docker Compose

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

Add your user to docker group (optional but useful):

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## 2. Create project folder

```bash
mkdir -p ~/freshrss
cd ~/freshrss
```

---

## 3. Create `docker-compose.yml`

```yaml
version: "3.8"

services:
  freshrss:
    image: freshrss/freshrss:latest
    container_name: freshrss
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - TZ=Europe/Berlin
      - CRON_MIN=*/20
    volumes:
      - ./data:/var/www/FreshRSS/data
      - ./extensions:/var/www/FreshRSS/extensions
```

👉 This is:

* **simple**
* uses built-in SQLite (perfect for local use)
* auto-refresh feeds every 20 min

---

## 4. Start FreshRSS

```bash
docker compose up -d
```

Check:

```bash
docker ps
```

---

## 5. Access Web UI

Open browser:

```
http://<your-server-ip>:8080
```

Follow setup:

* Language
* Create admin user
* Database → **SQLite (default)** ✅

---

# ⚙️ Optional (but recommended improvements)

## 🔒 1. Use reverse proxy (Nginx + HTTPS)

If you want a clean setup like Chris Titus:

* use **Nginx Proxy Manager** or **Caddy**
* enable HTTPS with Let’s Encrypt

---

## 📦 2. Backup your data

Important folder:

```
~/freshrss/data
```

Backup:

```bash
tar -czf freshrss-backup.tar.gz ~/freshrss/data
```

---

## ⚡ 3. Update FreshRSS

```bash
docker compose pull
docker compose up -d
```

```bash
apt install php php-curl php-gmp php-intl php-mbstring php-sqlite3 php-xml php-zip libapache2-mod-php
```

---

## 🧠 4. Mobile apps (like Chris Titus setup)

You can connect via API:

* **Readrops (Android)**
* **FeedMe**
* **NetNewsWire (iOS via extensions)**

Enable API in:

```
Settings → Authentication → API
```

---

# 🚀 Alternative (more advanced: with MariaDB)

If you want something more scalable:

I can give you a **MariaDB + FreshRSS compose setup** (closer to production / multi-user).

---

# 💡 Pro tip (Chris Titus style)

He usually pairs FreshRSS with:

* self-hosted services
* minimal UI
* keyboard-driven workflow

👉 If you want, I can:

* replicate his **exact homelab stack**
* or show a **minimalist RSS workflow (terminal + web + mobile sync)**
