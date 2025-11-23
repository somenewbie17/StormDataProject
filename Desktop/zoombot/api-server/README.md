# Law Recordings Central API

Single source of truth for recordings, users, and access control.

## Quick Start

```bash
npm install
npx prisma db push
npm run db:seed
npm start
```

API will run on http://localhost:4000

## Architecture

- **SQLite database** (easy migration to PostgreSQL later)
- **No auth yet** (uses mock userId, ready for Supabase)
- **REST API** for law app + future community app
- **Receives webhooks** from zoombot when recordings ready

## Endpoints

### Recordings
- `GET /api/recordings?userId=X&courseCode=LAW2109` - List recordings
- `POST /api/recordings` - Create recording (called by webhook)
- `GET /api/recordings/:id?userId=X` - Get recording details

### Users  
- `GET /api/users/:id` - Get user profile
- `POST /api/users` - Create user (testing only)
- `PATCH /api/users/:id` - Update user tier

### Courses
- `GET /api/courses?userId=X` - List courses
- `POST /api/courses` - Import course

### Access Control
- `POST /api/access/grant` - Grant user access to recording
- `DELETE /api/access/revoke` - Revoke access

## User Tiers

- **free**: No recordings access
- **premium**: Access to recordings for enrolled courses
- **enterprise**: Access to ALL recordings

## Database Schema

```prisma
model User {
  id      String @id @default(cuid())
  email   String @unique
  name    String
  tier    String @default("free")
  ...
}

model Recording {
  id              String @id @default(cuid())
  botId           String @unique
  courseCode      String
  courseName      String
  videoPath       String
  transcriptPath  String?
  status          String @default("processing")
  ...
}

model UserRecordingAccess {
  userId      String
  recordingId String
  ...
}

model Course {
  code        String @id
  name        String
  schedule    Json
  ...
}
```

## Development

**View database:**
```bash
npx prisma studio
```

**Reset database:**
```bash
rm prisma/dev.db
npx prisma db push
npm run db:seed
```

**Test endpoints:**
```bash
# Health check
curl http://localhost:4000/health

# Get recordings
curl "http://localhost:4000/api/recordings?userId=USER_ID&courseCode=LAW2109"

# Create recording
curl -X POST http://localhost:4000/api/recordings \
  -H "Content-Type: application/json" \
  -d '{"botId":"test-123","courseCode":"LAW2109",...}'
```

## Production Deployment

**Railway.app:**
```bash
railway init
railway up
railway open
```

**Heroku:**
```bash
heroku create
git push heroku main
heroku config:set DATABASE_URL=...
```

## Migration to Supabase

When ready for auth:

1. Change `datasource db` in schema.prisma to PostgreSQL
2. Add Supabase connection string to DATABASE_URL
3. Run `npx prisma migrate dev`
4. Add JWT middleware to verify tokens
5. Update law app to send JWT instead of userId

## Scaling

- **<100 users**: SQLite is fine
- **100-1000 users**: Migrate to PostgreSQL, add Redis cache
- **1000+ users**: Multiple instances, load balancer, CDN for videos
