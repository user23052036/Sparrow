# 🐦 Sparrow — Gentle Accountability for Real Life

Sparrow is a cross-device, mental-health-first accountability system designed for people who struggle with motivation, focus, or loneliness. Users make small daily commitments, verify completion with simple proofs, and receive supportive accountability through trusted friends or AI-assisted checks.

If a user misses a task, Sparrow frames the outcome positively (e.g., supporting charity) so progress never becomes punishment.

📌 Status: **Early Planning & Backend Development**  
📌 MVP Focus: **Daily tasks → proof upload → verification → gentle outcomes**  
📌 Docs: See `/docs/Sparrow.pdf` for the full concept and product plan.

---

## ✨ Core Idea (MVP)

| Step | What Happens |
|------|--------------|
| 1 | User sets a few small tasks for the day |
| 2 | User completes tasks and uploads simple proof (photo, short note) |
| 3 | System checks metadata + optionally asks a buddy to confirm |
| 4 | Success = positive feedback and streak growth |
| 5 | Miss = a gentle nudge and no shame (simulated donation mode in MVP) |

Sparrow encourages **consistency over perfection**.

---

## 🚀 Tech Stack (for MVP Development)

| Layer | Technology |
|------|------------|
| Backend | Java 17, Spring Boot |
| Database | PostgreSQL |
| Storage | Local filesystem, later S3 / MinIO |
| Frontend | React (basic, demo-first) |
| CI/CD | GitHub Actions + Render/Railway (roadmap) |

You can view the architectural plan in `ARCHITECTURE.md`

---

## ✅ Project Roadmap

### Phase 1 (Now)
- [ ] Java + Spring Boot scaffolding
- [ ] Users, Authentication (JWT)
- [ ] CRUD for daily tasks
- [ ] Proof upload + metadata check

### Phase 2
- [ ] Buddy support + verification scoring rules
- [ ] Basic streaks + progress dashboard

### Phase 3
- [ ] Deployment & feedback testing
- [ ] Analytics for engagement/retention

### Later (from product spec)
- Charity payments (requires legal review)
- AI-first proof verification
- Accountability circles
- Professional support marketplace

See: `ROADMAP.md` for detailed milestones.

---

## 🧑‍💻 Local Development Setup

Prerequisites:
- Java 17+
- PostgreSQL or Docker
- Maven (included wrapper)
- Node.js (for frontend later)

```bash
git clone https://github.com/<your-username>/sparrow.git
cd sparrow

# Setup environment config
cp .env.example .env

# Run backend (after scaffolding)
./mvnw spring-boot:run
