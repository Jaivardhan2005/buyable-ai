# BuyableAI

BuyableAI is a Razorpay Buildathon prototype for making merchant catalogs understandable and safely transactable by AI buyers.

## Day 1 foundation

- Next.js, TypeScript, Tailwind CSS, PostgreSQL/Prisma scaffold.
- Prisma data model for the approved architecture.
- An idempotent seed script for one merchant and eight TWS products.
- A static browsable demo catalog, authentication boundary stub, and tested deterministic readiness/ranking foundations.

## Local checks

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run prisma:validate`, and `npm run build`.

The database seed requires a locally supplied `DATABASE_URL`; do not commit environment files or credentials.
