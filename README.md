# Project README

## 🚀 First Time Setup

Follow these steps carefully the **first time** you run the project.

---

### 1. Start Docker Desktop

Before anything else, make sure **Docker Desktop is running** in the background on your machine.

- Open Docker Desktop from your Applications (Mac) or Start Menu (Windows)
- Wait until it shows **"Docker is running"** (the whale icon in your taskbar/menu bar should be steady, not animating)

---

### 2. Start the Containers

Once Docker Desktop is running, open your terminal in the project root and run:

```bash
docker compose up -d
```

The `-d` flag runs the containers in the background (detached mode).

**To verify the containers are running:**

```bash
docker compose ps
```

All services should show a status of `running` or `Up`. If anything shows `exited`, check the logs:

```bash
docker compose logs
```

---

### 3. Run Prisma Migrations

Once the containers are confirmed running, set up the database with Prisma:

```bash
npx prisma migrate dev
```

> ⚠️ Only run this step after confirming Docker is up. Prisma needs the database container to be running before it can apply migrations.

If you ever update the schema (`prisma/schema.prisma`), run the migrate command again to apply your changes.

---

## 🔄 Everyday Development Workflow

After your first-time setup, this is your regular flow whenever you make changes:

### 1. Make sure Docker is still running

```bash
docker compose ps
```

If it's not running, start it again:

```bash
docker compose up -d
```

### 2. Build before you run

**Always run the build before starting the app** — this compiles your latest changes:

```bash
npm run build
```

### 3. Start the app

```bash
npm start
```

> 🔁 Every time you make changes, repeat steps 2 and 3: `npm run build` → `npm start`

---

## 🌿 Git & Branch Rules

> 🚨 **Please read this carefully.**

- **Never push directly to `main`.**
- Always work on **your own branch**.
- Name your branch your name, e.g. `tona` or `somto`

### Creating your branch (if you haven't already):

```bash
git checkout -b your-branch-name
```

### Pushing your changes:

```bash
git add .
git commit -m "describe what you changed"
git push origin your-branch-name
```

### Before merging:

**Update me first before merging anything into `main`.** I'll review your changes and we'll merge together.

No PR gets merged to `main` without a heads-up. 🙏

---

## 📋 Quick Reference

| Task                         | Command                            |
| ---------------------------- | ---------------------------------- |
| Start Docker containers      | `docker compose up -d`             |
| Check containers are running | `docker compose ps`                |
| Run DB migrations            | `npx prisma migrate dev`           |
| Build the project            | `npm run build`                    |
| Start the app                | `npm start`                        |
| Push to your branch          | `git push origin your-branch-name` |
