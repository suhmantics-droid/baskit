# Data Model & API

Postgres + Prisma. Money = **integer minor units** + ISO currency. Timestamps UTC.

## Prisma schema (starting point)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  image         String?
  currency      String   @default("GBP")
  monthlyBudget Int?     // minor units
  createdAt     DateTime @default(now())
  items         Item[]
  lists         List[]
  notifPrefs    Json?    // channels, quietHours, frequency, payday
  memberships   ListMember[]
}

model List {
  id        String   @id @default(cuid())
  ownerId   String
  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name      String
  emoji     String   @default("🗂")
  parentId  String?
  parent    List?    @relation("Nesting", fields: [parentId], references: [id])
  children  List[]   @relation("Nesting")
  cap       Int?     // minor units
  dueDate   DateTime?
  createdAt DateTime @default(now())
  items     ItemList[]
  members   ListMember[]
  @@index([ownerId]); @@index([parentId])
}

model Item {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name         String
  url          String?
  domain       String?  // normalised host, for sale grouping + adapters
  imageUrl     String?
  currency     String   @default("GBP")
  price        Int?     // latest, minor units (denormalised from PricePoint)
  targetPrice  Int?
  stock        String   @default("unknown") // in|low|out|unknown
  category     String?
  tags         String[]
  code         String?
  status       String   @default("want")    // want|later|research
  priority     String   @default("nice")    // must|nice|impulse
  cooldownDays Int      @default(0)
  waitUntil    DateTime?
  notes        String?
  bought       Boolean  @default(false)
  fav          Boolean  @default(false)
  lastCheckedAt DateTime?
  createdAt    DateTime @default(now())
  lists        ItemList[]
  prices       PricePoint[]
  @@index([userId]); @@index([domain])
}

model ItemList {
  itemId String
  listId String
  item   Item @relation(fields: [itemId], references: [id], onDelete: Cascade)
  list   List @relation(fields: [listId], references: [id], onDelete: Cascade)
  @@id([itemId, listId])
}

model PricePoint {
  id        String   @id @default(cuid())
  itemId    String
  item      Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  price     Int      // minor units
  source    String   // "feed" | "jsonld" | "og" | "headless" | "manual"
  checkedAt DateTime @default(now())
  @@index([itemId, checkedAt])
}

model SaleSignal {          // per domain, shared across users
  domain    String   @id
  found     Boolean
  text      String?  // matched phrase, e.g. "up to 60% off"
  snippet   String?
  endsAt    DateTime?
  checkedAt DateTime @default(now())
}

model ListMember {          // sharing / gifting
  id       String @id @default(cuid())
  listId   String
  list     List   @relation(fields: [listId], references: [id], onDelete: Cascade)
  userId   String?          // null = pending email invite
  email    String?
  role     String @default("viewer") // owner|editor|viewer
  @@index([listId])
}

model Reservation {         // gift reservation (hidden from list owner)
  id           String @id @default(cuid())
  itemId       String
  reservedById String
  createdAt    DateTime @default(now())
  @@unique([itemId, reservedById])
}

model Moment {              // a generated nudge
  id        String   @id @default(cuid())
  userId    String
  itemId    String?
  kind      String   // target_hit|sale|cooloff_done|back_in_stock|budget_window
  title     String
  body      String
  deeplink  String
  dedupeKey String   @unique
  status    String   @default("pending") // pending|sent|snoozed|dismissed|clicked
  scheduledFor DateTime?
  createdAt DateTime @default(now())
  @@index([userId, status])
}
```

Notes: `Item.price` is a denormalised cache of the newest `PricePoint` for fast reads; always write both. `SaleSignal` is keyed by domain and shared (one scan benefits all users). "Profiles" from the prototype collapse into `User` (+ `ListMember` for shared spaces).

## REST API (Next.js route handlers under `app/api`)

Auth via Auth.js session; every mutating route checks ownership. Validate bodies with Zod.

```
POST   /api/auth/*                 # Auth.js
GET    /api/items                  # list current user's items (filters: list, status, q, sort)
POST   /api/items                  # create
GET    /api/items/:id
PATCH  /api/items/:id              # edit; logs a PricePoint if price changed
DELETE /api/items/:id
POST   /api/items/:id/price-check  # re-check now → returns {changed, old, new}
GET    /api/items/:id/prices       # price history

GET    /api/lists                  # tree with rolled-up spend + capState
POST   /api/lists
PATCH  /api/lists/:id
DELETE /api/lists/:id              # reparent children up a level

POST   /api/extract                # body {url} → {name,image,price,currency,domain} (the pipeline, docs/05)
POST   /api/scan-sales             # scan user's domains → SaleSignal upserts
GET    /api/moments                # user's feed
POST   /api/moments/:id/ack        # snooze|dismiss|clicked

POST   /api/lists/:id/share        # invite member
POST   /api/items/:id/reserve      # gift reservation

# Cron (protected by CRON_SECRET header) — see docs/05
POST   /api/cron/price-check
POST   /api/cron/scan-sales
POST   /api/cron/dispatch-moments
```

Decision score can be computed client-side from item data (pure fn), or exposed at `GET /api/items/:id` as a derived field — do both: compute on server for Moments, and client-side for instant UI.
