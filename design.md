# ACDL Community Posts Website - Design Document

## Overview

A website for sharing ACDL specifications as posts. Users can log in via Google OAuth, create/edit their own posts, and search/filter posts by others.

## Tech Stack

- **Frontend**: Static HTML/JS/CSS hosted on GitHub Pages
- **Backend**: Supabase (PostgreSQL + Auth + API)
- **Authentication**: Google OAuth via Supabase Auth

## Project Structure

```
/                       # Root - existing ACDL editor/viewer (index.html)
/community/             # New posts feature
  index.html            # Posts listing, search, filter
  post.html             # Single post view
  create.html           # Create new post (authenticated)
  edit.html             # Edit existing post (authenticated)
  auth.html             # Login/callback page
/community/js/
  supabase-client.js    # Supabase client initialization
  auth.js               # Authentication logic
  posts.js              # Posts CRUD operations
/community/css/
  community.css         # Styles for community pages
```

**Rationale**: Separating into `/community/` keeps the existing ACDL editor intact and provides a clean namespace for the new social features.

## Database Schema

### Table: `posts`

| Column       | Type      | Constraints                    |
|--------------|-----------|--------------------------------|
| id           | uuid      | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| user_id      | uuid      | REFERENCES auth.users(id), NOT NULL |
| name         | text      | NOT NULL                       |
| article_link | text      | NULLABLE                       |
| code_link    | text      | NULLABLE                       |
| description  | text      | NULLABLE                       |
| acdl_spec    | text      | NOT NULL                       |
| is_author    | boolean   | NOT NULL, DEFAULT false        |
| created_at   | timestamp | DEFAULT now()                  |
| updated_at   | timestamp | DEFAULT now()                  |

### Table: `profiles` (for user display names)

| Column       | Type      | Constraints                    |
|--------------|-----------|--------------------------------|
| id           | uuid      | PRIMARY KEY, REFERENCES auth.users(id) |
| display_name | text      | NOT NULL                       |
| avatar_url   | text      | NULLABLE                       |
| created_at   | timestamp | DEFAULT now()                  |

## Row Level Security (RLS) Policies

### Posts Table
- **SELECT**: Anyone can read all posts (public)
- **INSERT**: Authenticated users can create posts (user_id must match auth.uid())
- **UPDATE**: Users can only update their own posts (user_id = auth.uid())
- **DELETE**: Users can only delete their own posts (user_id = auth.uid())

### Profiles Table
- **SELECT**: Anyone can read profiles (for displaying author names)
- **INSERT**: Users can create their own profile (id = auth.uid())
- **UPDATE**: Users can update their own profile (id = auth.uid())

## Authentication Flow

1. User clicks "Sign in with Google" on any community page
2. Supabase redirects to Google OAuth
3. Google redirects back to `/community/auth.html` with tokens
4. Supabase client handles the callback and stores session
5. User is redirected to their intended destination

## Features

### Public (No Auth Required)
- View all posts listing
- Search posts by name
- Filter posts by user
- View individual post details
- View ACDL specification (rendered or raw)

### Authenticated
- Create new post
- Edit own posts
- Delete own posts
- User profile display

## Search & Filter

- **Search**: Text search on `name` field
- **Filter by user**: Dropdown or click on username to filter

## ACDL Specification Field

- Posts store ACDL code as plain text in `.acdl` format
- Display can integrate with existing ACDL renderer (TBD)
- Editor can be a simple textarea or integrate with CodeMirror (TBD)

## Implementation Phases

### Phase 1: Supabase Setup
- [x] Install Supabase CLI (v2.90.0 - local binary at `./supabase.exe`)
- [x] Link to existing project (ref: `cijhotamqefsnvelrgxt`)
- [x] Create database migrations (posts, profiles tables)
- [x] Configure RLS policies
- [x] Configure Google OAuth provider (in Supabase Dashboard)

### Phase 2: Frontend - Auth
- [x] Create `/community/` directory structure
- [x] Set up Supabase JS client
- [x] Implement Google OAuth login/logout
- [x] Auth handled inline (no separate callback page needed)

### Phase 3: Frontend - Posts
- [x] Posts listing page with search/filter
- [x] Single post view page
- [x] Create post form
- [x] Edit post form
- [x] Delete post functionality

### Phase 4: Polish
- [ ] Styling consistent with main site
- [ ] Error handling
- [ ] Loading states
- [ ] Mobile responsiveness

## Open Questions

- How should the ACDL editor integrate with existing tooling?
- Should there be pagination for posts listing?
- Any moderation/reporting features needed?

## Supabase Project Details

- **Project URL**: `https://cijhotamqefsnvelrgxt.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpamhvdGFtcWVmc252ZWxyZ3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjUwMjUsImV4cCI6MjA5MjcwMTAyNX0.kNB38WmTI2A6WLbZsdQZZdOhUlwf_oWpu2zDWos9lAw`
- **GitHub Pages URL**: `https://acdlang26.github.io/acdlsite/`
