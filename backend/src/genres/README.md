# Genres Module

The Genres module provides a comprehensive genre management system with hierarchy support and many-to-many relationships with tracks.

## Features

- ✅ Genre CRUD operations
- ✅ Genre hierarchy (parent/child relationships)
- ✅ Multiple genres per track
- ✅ Genre discovery endpoint
- ✅ Popular genres ranking
- ✅ Slug-based genre lookup
- ✅ Automatic track count tracking

## Database Schema

### Genre Entity
- `id` (UUID, primary key)
- `name` (string, unique)
- `slug` (string, unique)
- `description` (text, optional)
- `parentGenreId` (UUID, foreign key to Genre, nullable)
- `trackCount` (integer, default 0)
- `createdAt` (timestamp)

### TrackGenre Entity (Junction Table)
- `id` (UUID, primary key)
- `trackId` (UUID, foreign key to Track)
- `genreId` (UUID, foreign key to Genre)
- Unique constraint on `(trackId, genreId)`

## API Endpoints

### Genre Management

#### Create Genre
```http
POST /api/genres
Content-Type: application/json

{
  "name": "Electronic",
  "description": "Electronic music and EDM",
  "parentGenreId": null  // Optional, for sub-genres
}
```

#### Get All Genres
```http
GET /api/genres?page=1&limit=10&search=electronic&rootOnly=true
```

Query Parameters:
- `page` (number, default: 1)
- `limit` (number, default: 10, max: 100)
- `search` (string, optional) - Search by name
- `parentId` (UUID, optional) - Filter by parent genre
- `rootOnly` (boolean, optional) - Only root genres (no parent)

#### Get Genre by ID
```http
GET /api/genres/:id
```

#### Get Genre by Slug
```http
GET /api/genres/slug/:slug
```

#### Get Genre Children
```http
GET /api/genres/:id/children
```

#### Get Genre Parent Chain
```http
GET /api/genres/:id/parent-chain
```

#### Update Genre
```http
PATCH /api/genres/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "parentGenreId": "parent-uuid"  // Optional
}
```

#### Delete Genre
```http
DELETE /api/genres/:id
```

### Genre Discovery

#### Get Discovery Page
```http
GET /api/genres/discovery
```

Returns:
```json
{
  "rootGenres": [...],  // All root genres with children loaded
  "allGenres": [...]    // All genres with parent/children loaded
}
```

#### Get Popular Genres
```http
GET /api/genres/popular?limit=10
```

Returns top genres ranked by track count.

### Track-Genre Relationships

#### Assign Genres to Track
```http
POST /api/genres/tracks/:trackId/assign
Content-Type: application/json

{
  "genreIds": ["genre-uuid-1", "genre-uuid-2"]
}
```

#### Get Track Genres
```http
GET /api/genres/tracks/:trackId
```

#### Remove Genre from Track
```http
DELETE /api/genres/tracks/:trackId/genres/:genreId
```

## Usage Examples

### Creating a Genre Hierarchy

```typescript
// 1. Create root genre
const electronic = await genresService.create({
  name: 'Electronic',
  description: 'Electronic music'
});

// 2. Create sub-genre
const house = await genresService.create({
  name: 'House',
  description: 'House music',
  parentGenreId: electronic.id
});
```

### Assigning Multiple Genres to a Track

```typescript
await genresService.assignGenresToTrack(trackId, [
  electronic.id,
  house.id
]);
```

### Getting Genre Hierarchy

```typescript
// Get all children of Electronic
const children = await genresService.getChildren(electronic.id);

// Get parent chain (all ancestors)
const parents = await genresService.getParentChain(house.id);
```

## Seeding Predefined Genres

The module includes a seed script with predefined genres:

```bash
npm run seed:genres
```

This will create:
- 20 root genres (Electronic, Hip-Hop, Rock, Jazz, etc.)
- 30+ sub-genres (House, Techno, Trap, etc.)

## Migration

Run the migration to create the database tables:

```bash
npm run migration:run
```

## Testing

Run unit tests:

```bash
npm test genres.service.spec
```

## Notes

- Genre slugs are automatically generated from names
- Track counts are automatically updated when genres are assigned/removed
- Deleting a genre requires:
  - No child genres
  - No tracks assigned
- Circular references in hierarchy are prevented
- Genre names and slugs must be unique
