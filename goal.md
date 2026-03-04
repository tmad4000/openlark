# PRD: OpenLark — Open Source Workplace Super-App

## Introduction

OpenLark is an open source, self-hostable alternative to ByteDance's Lark/Feishu — a workplace super-app that unifies messaging, video meetings, documents, spreadsheets, databases, project management, calendars, email, approval workflows, OKR tracking, and HR tools into a single platform.

Unlike Slack (messaging-first + integrations) or Google Workspace (separate apps), OpenLark follows Lark's "workspace-first" philosophy: every module is built-in and deeply cross-linked. A message can become a task, a task links to a doc, a doc embeds a Base table, a Base automation triggers an approval, and an approval resolves in chat — all without leaving the app.

**Code name:** OpenLark
**License:** AGPLv3 (server) + MIT (client SDKs)
**Deployment:** SaaS-first, with Docker Compose self-hosting
**Target scale:** Medium organizations (100–1,000 users)
**Collaboration engine:** Yjs + Hocuspocus (CRDT-based real-time sync)

---

## Goals

- Achieve full feature parity with Lark across all 17 core modules and platform features
- Provide a single deployable application that replaces Slack + Google Workspace + Asana + Airtable + Zoom + DocuSign workflows
- Support 1,000 concurrent users on a single PostgreSQL + Redis + S3 stack without exotic infrastructure
- Enable real-time collaboration (documents, whiteboards, spreadsheets) with offline support via CRDTs
- Offer a comprehensive REST API and bot SDK so third-party developers can extend the platform
- Ship incrementally — each phase delivers a usable product, not a half-built monolith

---

## Architecture Overview

### Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 19 + Next.js 15 (App Router) | Server components, streaming, great DX |
| **UI Framework** | Tailwind CSS + Radix UI primitives | Accessible, composable, themeable |
| **Block Editor** | TipTap v3 (ProseMirror) + Yjs | Best block editor ecosystem, CRDT-native |
| **Spreadsheet** | Custom engine + HyperFormula | HyperFormula provides 500+ Excel-compatible formulas |
| **Collab Engine** | Yjs + Hocuspocus server | CRDT sync, cursor presence, offline support, auth |
| **Real-time** | WebSockets (Socket.IO or ws) + Redis Pub/Sub | Chat, presence, notifications, collab relay |
| **API** | Node.js + Fastify | High performance, schema validation, TypeScript |
| **Database** | PostgreSQL 16 | JSONB for flexible schemas, full-text search, row-level security |
| **Cache / Pub/Sub** | Redis 7 | Sessions, presence, pub/sub fanout, rate limiting |
| **Object Storage** | S3-compatible (MinIO for self-host) | File uploads, avatars, recordings, attachments |
| **Search** | Meilisearch or PostgreSQL FTS | Cross-module search with typo tolerance |
| **Video/Audio** | LiveKit (open source SFU) | WebRTC, screen share, recording, breakout rooms |
| **Email** | Haraka (SMTP) + IMAP proxy | Inbound/outbound email with custom domains |
| **Auth** | Custom + Passport.js | Local auth, SAML 2.0 SSO, SCIM 2.0 provisioning |
| **Queue** | BullMQ (Redis-backed) | Background jobs: email, notifications, automations |
| **Containerization** | Docker + Docker Compose | Dev and small-team deployment |
| **CI/CD** | GitHub Actions | Test, lint, build, deploy |
| **Mobile** | React Native (Expo) | Code sharing with web, native performance |

### Data Model Principles

- **Multi-tenant:** Single database, tenant isolation via `org_id` on every table + row-level security
- **Soft deletes:** All user-facing entities use `deleted_at` timestamps, with 30-day retention
- **Audit trail:** All mutations logged to `audit_log` table with actor, action, entity, diff
- **Permissions:** RBAC with org → department → team → user hierarchy; document-level ACLs
- **Real-time sync:** Yjs documents stored as binary snapshots in PostgreSQL, incremental updates via Hocuspocus

### Key Abstractions

- **Entity:** Base type for all business objects (id, org_id, created_at, updated_at, deleted_at, created_by)
- **Permission:** ACL entry (entity_id, entity_type, principal_id, principal_type, role)
- **Activity:** Audit/activity feed entry (entity_id, actor_id, action, metadata, timestamp)
- **Notification:** Delivery record (user_id, type, channel, payload, read_at, delivered_at)
- **Block:** Content block for docs/wiki/comments (id, type, content_json, parent_id, position)

---

## Module Specifications

Each module below is defined with: purpose, entities, functional requirements, API surface, and dependencies. Ralph should use dependency information to determine build order.

---

### Module 1: Auth & Identity

**Purpose:** User authentication, session management, organization setup, and identity federation.

**Dependencies:** None (foundational)

**Entities:**
- `User` (id, email, phone, password_hash, display_name, avatar_url, timezone, locale, status, working_hours_start, working_hours_end, org_id)
- `Organization` (id, name, domain, logo_url, industry, plan, settings_json)
- `Department` (id, name, parent_id, org_id) — tree structure
- `DepartmentMember` (department_id, user_id, role)
- `Session` (id, user_id, token_hash, device_info, ip, expires_at)
- `SSOConfig` (org_id, provider, saml_metadata_url, entity_id, certificate)
- `APIKey` (id, org_id, user_id, key_hash, scopes, name, last_used_at)

**Functional Requirements:**

- FR-1.1: Email + password registration and login with bcrypt hashing
- FR-1.2: Magic link (passwordless) login via email
- FR-1.3: Two-factor authentication (TOTP) with recovery codes
- FR-1.4: SAML 2.0 SSO integration (IdP-initiated and SP-initiated flows)
- FR-1.5: SCIM 2.0 endpoint for user/group provisioning from external IdPs
- FR-1.6: Organization creation with domain verification
- FR-1.7: Department hierarchy (create, nest, move, delete departments)
- FR-1.8: User invitation via email, invite code, or QR code link
- FR-1.9: Role-based access: Primary Admin, Custom Admin roles (scoped permissions), Member
- FR-1.10: Session management — view active sessions, revoke remotely
- FR-1.11: User profile with avatar, display name, timezone, locale, working hours, phone
- FR-1.12: API key management for bot/integration authentication
- FR-1.13: OAuth 2.0 authorization code flow for third-party apps
- FR-1.14: Password policies (min length, complexity, expiry) configurable per org
- FR-1.15: User offboarding — transfer data, revoke access, soft-delete account

**API Surface:**
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- `POST /auth/magic-link`, `POST /auth/verify-magic-link`
- `POST /auth/2fa/setup`, `POST /auth/2fa/verify`
- `GET/POST/PATCH/DELETE /orgs`, `/orgs/:id/departments`, `/orgs/:id/members`
- `POST /auth/saml/callback`, `GET /auth/saml/metadata`
- `GET/POST/PATCH/DELETE /scim/v2/Users`, `/scim/v2/Groups`
- `GET/POST/DELETE /auth/sessions`
- `GET/POST/DELETE /auth/api-keys`
- `GET/POST /auth/oauth/authorize`, `POST /auth/oauth/token`

---

### Module 2: Messenger

**Purpose:** Real-time messaging — 1:1 chats, group chats, topic groups, supergroups, threads, rich messages, and chat management.

**Dependencies:** Auth & Identity

**Entities:**
- `Chat` (id, type [dm|group|topic_group|supergroup|meeting], name, avatar_url, org_id, is_public, max_members, settings_json)
- `ChatMember` (chat_id, user_id, role [owner|admin|member], joined_at, muted, label, last_read_message_id)
- `Message` (id, chat_id, sender_id, type [text|rich_text|code|voice|card|system], content_json, thread_id, reply_to_id, edited_at, recalled_at, scheduled_for, created_at)
- `MessageReaction` (message_id, user_id, emoji)
- `MessageReadReceipt` (message_id, user_id, read_at)
- `Pin` (chat_id, message_id, pinned_by, pinned_at)
- `Favorite` (user_id, message_id, created_at)
- `ChatTab` (chat_id, type [auto|custom], name, url, position)
- `Announcement` (chat_id, content, author_id, created_at)
- `Topic` (id, chat_id, title, creator_id, status [open|closed], created_at)
- `TopicSubscription` (topic_id, user_id)
- `Sticker` (id, org_id, user_id, image_url, name)
- `ScheduledMessage` (id, chat_id, sender_id, content_json, scheduled_for, sent_at)

**Functional Requirements:**

- FR-2.1: Create 1:1 DM by selecting a contact; create group chat with name + members
- FR-2.2: Send text messages with rich formatting (bold, italic, strikethrough, underline, lists, quotes, links, code inline)
- FR-2.3: Send code blocks with language selection and syntax highlighting
- FR-2.4: Send voice messages with server-side speech-to-text transcription
- FR-2.5: Send interactive message cards (buttons, dropdowns, date pickers, forms) via bot API
- FR-2.6: @mention users with autocomplete; trigger notification for mentioned user
- FR-2.7: Emoji reactions on messages; aggregate reaction counts; no notification for reactions
- FR-2.8: Read receipts — gray (unread), partial green (some read), green checkmark (all read); click to see who read
- FR-2.9: Reply to a message to create a thread; thread replies notify only thread participants
- FR-2.10: Forward messages (single or combine-and-forward multiple) to other chats
- FR-2.11: Edit sent messages within 24 hours (up to 20 edits); show "Edited" label
- FR-2.12: Recall (unsend) messages within 24 hours; group owners can recall any member's message
- FR-2.13: Pin messages to chat; auto-generate Pins tab
- FR-2.14: Favorite/bookmark messages (personal, not visible to others)
- FR-2.15: Auto-generate chat tabs (Chat, Docs, Files, Pins, Announcements) when content is shared
- FR-2.16: Custom chat tabs — user adds a link + name (max 20 per chat)
- FR-2.17: Topic groups — create topics with title, reply within topics, subscribe/unsubscribe, close/reopen topics
- FR-2.18: Group announcements — owner/admin posts announcement, displayed prominently
- FR-2.19: Supergroups supporting up to 50,000 members (topic supergroups: 20,000)
- FR-2.20: Mark chat as "Done" to remove from active list; preserve history; reopen anytime
- FR-2.21: Custom labels for chat categorization
- FR-2.22: Mute chat notifications per conversation
- FR-2.23: Chat filters — filter by: private, group, @mentions, unread, muted
- FR-2.24: Export messages to a document (single or batch up to 100; voice → text, video → placeholder)
- FR-2.25: Scheduled messages — compose now, deliver later (with cancel/edit before send)
- FR-2.26: Restricted Mode (Enterprise) — block copy, forward, screenshot, download per chat
- FR-2.27: Group admin permissions — add/remove admins, recall any message, manage settings, control history visibility for new members
- FR-2.28: Public groups discoverable via search; non-public groups join by invitation only
- FR-2.29: External groups — include members from outside the organization
- FR-2.30: Message search within chat (Cmd+F) and global search integration
- FR-2.31: Typing indicators and online presence
- FR-2.32: Message delivery via WebSocket with Redis pub/sub fanout; fallback to polling

**Real-time Architecture:**
- Each chat is a Redis pub/sub channel
- WebSocket connections subscribe to user's active chats
- Message persistence: write to PostgreSQL, then publish to Redis
- Presence: Redis sorted set with heartbeat TTL
- Typing indicators: Redis pub/sub (ephemeral, not persisted)

---

### Module 3: Buzz (Urgent Notifications)

**Purpose:** Multi-channel urgent notification system for time-sensitive messages.

**Dependencies:** Messenger, Auth & Identity

**Entities:**
- `BuzzNotification` (id, message_id, sender_id, recipient_id, type [in_app|sms|phone], status [pending|delivered|read], created_at, delivered_at, read_at)

**Functional Requirements:**

- FR-3.1: Buzz a sent message to escalate urgency; sender can only Buzz their own messages
- FR-3.2: Three delivery tiers: in-app push notification, SMS (via Twilio/similar), phone call alert (via Twilio)
- FR-3.3: Buzzed messages display a red urgent icon in chat
- FR-3.4: Buzz is marked as read when recipient views the original message
- FR-3.5: Group owner/admin can enable/disable "All members can Buzz" setting
- FR-3.6: Rate limiting on Buzz (prevent spam): max 3 Buzz per message, max 10 per hour per user
- FR-3.7: Admin configurable: which Buzz tiers are enabled per organization (e.g., disable phone calls)

---

### Module 4: Video Meetings

**Purpose:** Video/audio conferencing with screen sharing, recording, breakout rooms, and AI features.

**Dependencies:** Messenger, Auth & Identity, Calendar (optional for scheduling)

**Entities:**
- `Meeting` (id, org_id, title, host_id, type [instant|scheduled|webinar], status [waiting|active|ended], settings_json, room_id, started_at, ended_at)
- `MeetingParticipant` (meeting_id, user_id, role [host|co_host|participant], joined_at, left_at)
- `MeetingRecording` (id, meeting_id, storage_url, duration, size, transcription_status)
- `BreakoutRoom` (id, meeting_id, name, participants_json)

**Functional Requirements:**

- FR-4.1: Start instant meeting from chat (1:1 or group) or create scheduled meeting
- FR-4.2: Join via link — no account required for external guests
- FR-4.3: Video/audio with configurable quality; up to 100 participants standard, 1,000 for large events
- FR-4.4: Multiple layout views: gallery grid, speaker spotlight, side thumbnails
- FR-4.5: Virtual backgrounds — blur, custom image upload, or AI-generated
- FR-4.6: Screen sharing — full screen, application window, or browser tab
- FR-4.7: Magic Share — share a Lark Doc where participants can independently navigate and co-edit; "To presenter" button to re-follow
- FR-4.8: Breakout rooms — host creates up to 50 rooms, assigns participants, sets timer, broadcast to all rooms
- FR-4.9: In-meeting chat with emoji reactions
- FR-4.10: Live polls during meetings (single/multi-choice, optional anonymity)
- FR-4.11: Multi-language subtitles — real-time speech-to-text with per-user language selection
- FR-4.12: Cloud recording — save to S3; auto-generate transcript via Lark Minutes integration
- FR-4.13: Meeting lobby — host admits participants; waiting room
- FR-4.14: Host controls — mute all, disable video, lock meeting, remove participant
- FR-4.15: Auto-create meeting group chat with all participants
- FR-4.16: Meeting link sharing with password protection option

**Technical Notes:**
- Use LiveKit (open source WebRTC SFU) for media routing
- LiveKit handles: SFU, simulcast, screen share, recording, room management
- OpenLark provides: scheduling, UI, chat integration, Magic Share overlay

---

### Module 5: Lark Minutes

**Purpose:** AI-powered meeting transcription, summarization, and searchable meeting records.

**Dependencies:** Video Meetings

**Entities:**
- `Minutes` (id, meeting_id, recording_id, transcript_json, summary_json, chapters_json, action_items_json, language, status [processing|ready], created_at)
- `MinutesComment` (id, minutes_id, user_id, paragraph_index, content, created_at)

**Functional Requirements:**

- FR-5.1: Auto-generate transcript from meeting recording using Whisper or similar ASR
- FR-5.2: Speaker identification and attribution (diarization) in transcript
- FR-5.3: AI-generated meeting summary with three sections: key points, action items, smart chapters
- FR-5.4: Searchable transcripts — full-text search across all meeting minutes
- FR-5.5: Smart playback — adjustable speed, silence skipping, click-to-jump on transcript
- FR-5.6: Comments on specific transcript paragraphs
- FR-5.7: One-click translation of minutes to another language
- FR-5.8: Extract action items as OpenLark Tasks with assignees
- FR-5.9: Share minutes via link; embed in Docs
- FR-5.10: Permission inheritance from meeting — all participants can view/edit by default; organizer can restrict

---

### Module 6: Calendar

**Purpose:** Event scheduling, room booking, availability management, and shared calendars.

**Dependencies:** Auth & Identity, Messenger (for meeting group creation)

**Entities:**
- `CalendarEvent` (id, org_id, title, description, start_time, end_time, timezone, location, recurrence_rule, creator_id, meeting_id, room_id, settings_json)
- `EventAttendee` (event_id, user_id, rsvp [pending|yes|no|maybe], notified_at)
- `MeetingRoom` (id, org_id, name, capacity, equipment_json, location, floor)
- `Calendar` (id, org_id, owner_id, type [personal|public|all_staff|shared], name, color)
- `CalendarSubscription` (calendar_id, user_id)

**Functional Requirements:**

- FR-6.1: Create events with title, description, time, timezone, location, attendees
- FR-6.2: Recurring events with RFC 5545 recurrence rules (daily, weekly, monthly, yearly, custom)
- FR-6.3: RSVP — attendees respond Yes/No/Maybe; organizer sees response summary
- FR-6.4: Meeting room booking — browse available rooms by capacity/equipment/floor; book from event creation
- FR-6.5: Availability search — find free slots across multiple attendees' calendars
- FR-6.6: Working hours configuration per user; warn when scheduling outside someone's hours
- FR-6.7: Conflict detection — alert when double-booking
- FR-6.8: Shared calendars — share personal calendar with specific users/departments
- FR-6.9: Public calendars — any org member can create; searchable and subscribable
- FR-6.10: All-Staff calendar — admin-managed, auto-synced to all org members
- FR-6.11: Auto-create meeting group chat when calendar event is created
- FR-6.12: One-click video meeting link generation from calendar event
- FR-6.13: Drag-and-drop event rescheduling in calendar UI
- FR-6.14: External calendar sync — iCal import/export, Google Calendar / Outlook sync via CalDAV
- FR-6.15: Event reminders — configurable notifications (5min, 15min, 30min, 1hr before)

---

### Module 7: Docs

**Purpose:** Block-based collaborative document editor with real-time co-editing, 30+ block types, and version management.

**Dependencies:** Auth & Identity, Collab Engine (Yjs + Hocuspocus)

**Entities:**
- `Document` (id, org_id, title, type [doc|sheet|slide|mindnote|board], yjs_doc_id, owner_id, template_id, settings_json)
- `DocumentPermission` (document_id, principal_id, principal_type [user|department|org], role [viewer|editor|manager|owner])
- `DocumentVersion` (id, document_id, name, snapshot_blob, created_by, created_at)
- `DocumentComment` (id, document_id, block_id, user_id, content, resolved, thread_id, created_at)

**Functional Requirements:**

- FR-7.1: Block-based editor using TipTap + Yjs — each content element is a draggable, reorderable block
- FR-7.2: Block types (30+): heading (H1-H9), paragraph, bullet list, numbered list (6 nesting levels), todo/checkbox, quote, callout (4 color types), code block (language selection), horizontal rule, table, image, video, file attachment, synced block, equation (LaTeX), flowchart, UML diagram, mind map, poll, timer/countdown, divider, toggle/collapsible, embedded Base view, embedded Sheet chart
- FR-7.3: Slash (/) command menu — type `/` to fuzzy-search and insert any block type
- FR-7.4: Floating toolbar on text selection — bold, italic, underline, strikethrough, link, code, color, highlight
- FR-7.5: Six-dot drag handle on block hover — drag to reorder, click for context menu (duplicate, delete, convert type)
- FR-7.6: Plus (+) button on empty line hover — opens block insertion panel
- FR-7.7: Real-time collaboration — see other users' cursors and selections; avatars in document header
- FR-7.8: Up to 150 simultaneous editors, 5,000 simultaneous viewers per document
- FR-7.9: Auto-save — all changes persisted to Yjs backend continuously; no save button
- FR-7.10: Four permission levels: Viewer (read-only), Editor (edit content), Manager (manage permissions + edit), Owner (full control + delete)
- FR-7.11: Share dialog — search for users/departments/groups, set permission level, send notification
- FR-7.12: Version management — create named snapshots; restore any version; versions retained 30 days after deletion
- FR-7.13: Edit history — view who changed what with timestamps
- FR-7.14: Comments — anchor to specific text selections; threaded replies; resolve/reopen
- FR-7.15: Synced blocks — create a block that appears identically in multiple documents; edit in one, updates everywhere
- FR-7.16: Document templates — create from existing doc; template gallery organized by category
- FR-7.17: Import/export — import from .docx, .md; export to .docx, .pdf, .md
- FR-7.18: Table of contents — auto-generated from headings; click to navigate
- FR-7.19: Word count and reading time estimate
- FR-7.20: Full-width and page-width toggle
- FR-7.21: Embed in Wiki pages, Messages, and other documents

---

### Module 8: Sheets

**Purpose:** Collaborative spreadsheet with formulas, charts, pivot tables, and conditional formatting.

**Dependencies:** Auth & Identity, Collab Engine

**Entities:**
- Shares `Document` entity with type=sheet
- `SheetData` (document_id, sheet_index, cell_data_blob) — Yjs-synced cell data

**Functional Requirements:**

- FR-8.1: Grid-based spreadsheet with rows, columns, and cells
- FR-8.2: 500+ Excel-compatible formulas via HyperFormula engine (math, lookup, text, date, logical, statistical, financial)
- FR-8.3: Cell formatting — font, size, color, background, borders, alignment, number format, merge cells
- FR-8.4: Conditional formatting — color scale, data bars, icon sets, custom formula rules
- FR-8.5: Pivot tables — drag-and-drop field arrangement, aggregation functions
- FR-8.6: Charts — column, bar, line, pie, radar, combo, word cloud; embed in Docs with bi-directional sync
- FR-8.7: Data validation — dropdown lists, number ranges, date ranges, custom formulas
- FR-8.8: Filter views — multiple users apply independent filters without affecting each other
- FR-8.9: Freeze rows/columns for header visibility during scrolling
- FR-8.10: Multi-sheet workbooks with sheet tabs
- FR-8.11: Real-time collaboration with cell-level conflict resolution
- FR-8.12: Import/export — .xlsx, .csv, .tsv
- FR-8.13: Protected ranges — lock specific cells/ranges for certain users
- FR-8.14: Cross-sheet references and formulas

---

### Module 9: Slides

**Purpose:** Collaborative presentation builder with import support and live presentation mode.

**Dependencies:** Auth & Identity, Collab Engine

**Entities:**
- Shares `Document` entity with type=slide
- `SlideData` (document_id, slide_index, elements_json, notes, layout_id)

**Functional Requirements:**

- FR-9.1: Slide editor with drag-and-drop elements: text boxes, images, shapes, charts, tables, videos
- FR-9.2: Master slide layouts — create reusable templates; apply to slides
- FR-9.3: Custom slide sizing (200-8000px width/height)
- FR-9.4: Presenter View — current slide, next slide preview, speaker notes, timer
- FR-9.5: Live link presentation — share a URL; audience follows presenter in real-time on any device
- FR-9.6: Import PPTX files (up to 600 MB)
- FR-9.7: Export to PPTX and PDF
- FR-9.8: Slide transitions and element animations
- FR-9.9: Real-time collaboration with element-level locking
- FR-9.10: Speaker notes per slide
- FR-9.11: Thumbnail navigation sidebar

---

### Module 10: MindNotes

**Purpose:** Mind mapping and outline tool with dual-view toggle.

**Dependencies:** Auth & Identity, Collab Engine

**Entities:**
- Shares `Document` entity with type=mindnote
- `MindNoteNode` (document_id, node_id, parent_node_id, content, position, style_json)

**Functional Requirements:**

- FR-10.1: Two views with one-click toggle: outline view (hierarchical text) and mind map view (visual tree)
- FR-10.2: Four structure layouts: right-side tree, left-side tree, two-side tree, organizational chart
- FR-10.3: Two branch line styles: curved and straight
- FR-10.4: Keyboard-driven editing: Enter for sibling node, Tab for child node, Delete to remove
- FR-10.5: Node formatting — bold, italic, color, icons, links
- FR-10.6: Collapse/expand branches
- FR-10.7: Export to image, PDF, or OPML
- FR-10.8: Embeddable in Docs and Boards
- FR-10.9: Real-time collaboration

---

### Module 11: Wiki

**Purpose:** Hierarchical knowledge base organized into spaces with page trees and tiered permissions.

**Dependencies:** Docs, Auth & Identity

**Entities:**
- `WikiSpace` (id, org_id, name, description, icon, type [private|public], settings_json)
- `WikiSpaceMember` (space_id, user_id, role [admin|editor|viewer])
- `WikiPage` (id, space_id, document_id, parent_page_id, position, created_by)

**Functional Requirements:**

- FR-11.1: Create wiki spaces — private (members-only) or public (org-wide)
- FR-11.2: Three space roles: Administrator (full control), Editor (create/edit pages), Viewer (read-only)
- FR-11.3: Hierarchical page tree — pages can have unlimited sub-page depth
- FR-11.4: Sub-pages inherit parent permissions but cannot exceed them
- FR-11.5: Any document type (Doc, Sheet, Slide, MindNote) can be added as a wiki page
- FR-11.6: Left sidebar navigation — expandable/collapsible tree; resizable panel
- FR-11.7: Breadcrumb navigation showing page path within wiki hierarchy
- FR-11.8: Space homepage with description and quick links
- FR-11.9: Move pages between spaces or positions in the tree
- FR-11.10: Search within a wiki space or across all spaces
- FR-11.11: Star/bookmark pages for quick access
- FR-11.12: Deleted pages retained 30 days before permanent deletion

---

### Module 12: Base (Database)

**Purpose:** No-code relational database (Airtable-like) with multiple views, automations, workflows, and dashboards.

**Dependencies:** Auth & Identity, Messenger (for automation triggers)

**Entities:**
- `Base` (id, org_id, name, icon, owner_id)
- `BaseTable` (id, base_id, name, position)
- `BaseField` (id, table_id, name, type, config_json, position) — 25+ field types
- `BaseRecord` (id, table_id, data_json, created_by, created_at, updated_at)
- `BaseView` (id, table_id, type [grid|kanban|calendar|gantt|gallery|form], name, config_json, position)
- `BaseAutomation` (id, base_id, name, trigger_json, actions_json, enabled, type [automation|workflow])
- `BaseDashboard` (id, base_id, name, charts_json)

**Functional Requirements:**

**Field Types (25+):**
- FR-12.1: Text, Long Text, Number, Currency, Percentage, Progress bar, Rating (icon scale), Single Select, Multi Select, Date/Time, Checkbox, User/Person, Group Chat, Phone, URL, Email, Attachment, Single Link (one-way), Duplex Link (two-way), Formula, Lookup, Location, Created Time, Modified Time, Created User, Modified User, Auto Number, Button, Barcode

**Views (6):**
- FR-12.2: Grid view — spreadsheet-like rows/columns; record hierarchy (parent-child); freeze columns, filter, sort, group
- FR-12.3: Kanban view — drag-and-drop cards between columns; group by person, single/multi select, checkbox
- FR-12.4: Calendar view — records displayed on calendar by date field; drag events to change dates
- FR-12.5: Gantt view — timeline bars with start/end dates; milestones; dependency arrows; critical path; drag to reschedule
- FR-12.6: Gallery view — visual cards emphasizing attachments/images; click for full record
- FR-12.7: Form view — table converted to shareable questionnaire; responses sync to table; shareable internally/externally

**Core Features:**
- FR-12.8: View configuration — filtering (custom conditions), grouping, sorting, field visibility; configurations can be personal (temporary) or saved (shared)
- FR-12.9: Record detail side panel — click a record to expand all fields in a right-side panel
- FR-12.10: Formula fields with text, date, statistical, logical, math, and lookup functions
- FR-12.11: Bi-directional linked records between tables
- FR-12.12: Import from CSV/Excel; export to CSV/Excel

**Automations (14 triggers):**
- FR-12.13: Triggers: record added, record updated, record matches conditions, at record's trigger time, at scheduled time, button clicked, Lark message received, webhook received, email received (Outlook/Gmail), Teams/Slack message received
- FR-12.14: Actions: send message, edit record, add record, HTTP request, send email
- FR-12.15: Linear step-based automation chain (2-4 steps)

**Workflows (Advanced):**
- FR-12.16: Canvas-based visual workflow builder with zoom, pan, drag-and-drop nodes
- FR-12.17: Conditional branching: If/Else and Switch nodes
- FR-12.18: Same triggers as Automations + AI-powered action nodes
- FR-12.19: Editable node names; multi-step complex processes
- FR-12.20: Automation run limits configurable per plan tier

**Dashboards:**
- FR-12.21: Dashboard builder with drag-and-drop chart blocks on a canvas
- FR-12.22: Chart types: bar, column, line, area, pie, radar, scatter, combo, word cloud, metrics block, ranking list, NPS chart
- FR-12.23: Configure data source, fields, aggregation, grouping, TopN filtering
- FR-12.24: Customization: colors, fonts, legends, number formats, themes
- FR-12.25: Dashboard permissions independent from table permissions

---

### Module 13: Board (Whiteboard)

**Purpose:** Digital collaborative whiteboard for diagrams, flowcharts, brainstorming, and visual thinking.

**Dependencies:** Auth & Identity, Collab Engine

**Entities:**
- Shares `Document` entity with type=board
- `BoardElement` (document_id, element_id, type [shape|line|sticky|text|image|icon|section|mindmap|table], data_json, position_json, style_json)

**Functional Requirements:**

- FR-13.1: Canvas-based infinite whiteboard with pan, zoom, and minimap
- FR-13.2: Elements: shapes (rectangle, circle, triangle, diamond, etc.), lines/connectors (straight, curved, elbow), sticky notes, text, images, icons, sections (organizational frames), tables
- FR-13.3: Freeform drawing tool with multiple brush styles and colors
- FR-13.4: Insert mind maps directly on the board
- FR-13.5: Connectors snap to shape anchor points; auto-route around obstacles
- FR-13.6: Templates gallery for common diagram types (flowchart, org chart, swimlane, timeline)
- FR-13.7: Comments on board elements
- FR-13.8: Real-time collaboration with participant cursors
- FR-13.9: Export to PNG, SVG, PDF
- FR-13.10: Embed in Docs

---

### Module 14: Forms

**Purpose:** Survey/form builder with conditional logic, analytics, and Base integration.

**Dependencies:** Base (responses stored in Base tables)

**Entities:**
- `Form` (id, org_id, base_id, table_id, title, description, settings_json, theme_json, creator_id)
- `FormQuestion` (id, form_id, type, config_json, position, required, display_condition_json)
- `FormResponse` (id, form_id, respondent_id, answers_json, submitted_at)

**Functional Requirements:**

- FR-14.1: Question types (12+): open text, single select, multiple choice, rating (custom icons), NPS, location (GPS on mobile), date, person (org member selector), file upload, number (integer/decimal/percentage)
- FR-14.2: Conditional display logic — show/hide questions based on previous answers
- FR-14.3: Two display modes: list (all questions visible) and step (one question per page)
- FR-14.4: Form settings: anonymous submissions, login requirements, start/end scheduling, per-respondent limits (daily/weekly/monthly/total), response cap (up to 100,000), post-submission redirect
- FR-14.5: Custom themes — background images, color schemes, layouts
- FR-14.6: Distribution: shareable link, QR code (downloadable), send in Messenger
- FR-14.7: Responses auto-saved to a linked Base table (auto-created on first response)
- FR-14.8: Auto-generated analytics dashboard with up to 200 charts based on question types
- FR-14.9: Insert polls inline in Docs and group chats (lightweight single/multi-choice)

---

### Module 15: Tasks & Project Management

**Purpose:** Task management with list/kanban/gantt views, dependencies, subtasks, and cross-module task creation.

**Dependencies:** Messenger (task-from-message), Calendar (task-to-event), Docs (task-in-doc)

**Entities:**
- `Task` (id, org_id, title, description, status, priority, assignee_ids, creator_id, due_date, start_date, parent_task_id, custom_fields_json, recurrence_rule, completed_at)
- `TaskList` (id, org_id, name, owner_id, settings_json)
- `TaskListItem` (task_list_id, task_id, position)
- `TaskDependency` (task_id, depends_on_task_id, type [finish_to_start|start_to_start|finish_to_finish|start_to_finish])
- `TaskComment` (id, task_id, user_id, content, created_at)
- `TaskCustomField` (id, org_id, name, type, options_json)

**Functional Requirements:**

- FR-15.1: Create tasks from 6 entry points: Tasks app, chat message (one-click convert), Docs, email, calendar event, Base record
- FR-15.2: Multi-owner assignment — assign multiple people to a task
- FR-15.3: Subtasks — up to 5 nesting levels; completing subtasks does NOT auto-complete parent
- FR-15.4: Custom fields — text, number, date, single select, multi select, person
- FR-15.5: Recurring tasks with configurable recurrence rules
- FR-15.6: Three views: List (sortable/filterable), Kanban (drag between columns), Gantt (timeline with dependencies)
- FR-15.7: Gantt chart features: dependency arrows (4 types), milestones, critical path highlighting, drag-to-reschedule with dependent task buffer
- FR-15.8: Task notifications — assignment notification, due date reminders, status change alerts
- FR-15.9: Task comments with @mentions
- FR-15.10: Link tasks to calendar events, documents, and Base records
- FR-15.11: "My Tasks" view — personal dashboard aggregating all assigned tasks across lists

---

### Module 16: OKR

**Purpose:** Objectives and Key Results tracking with alignment, scoring, and organizational dashboards.

**Dependencies:** Auth & Identity, Docs (OKR embedding)

**Entities:**
- `OKRCycle` (id, org_id, name, start_date, end_date, status [creating|aligning|following_up|reviewing])
- `Objective` (id, cycle_id, owner_id, title, description, parent_objective_id, visibility, status)
- `KeyResult` (id, objective_id, title, target_value, current_value, weight, score, unit)
- `OKRCheckin` (id, key_result_id, user_id, value, notes, created_at)
- `OKRAlignment` (objective_id, aligned_to_objective_id, confirmed)

**Functional Requirements:**

- FR-16.1: Create OKR cycles with configurable time periods
- FR-16.2: Objectives with Key Results — each KR has target, current, weight, and 0-1 score
- FR-16.3: Alignment — link objectives to parent objectives; visualize alignment tree with minimap
- FR-16.4: Leader confirmation — aligned objectives require leader confirmation
- FR-16.5: Check-ins — regular progress updates on KRs with notes
- FR-16.6: Auto-scoring: 0.6-0.7 = good performance; higher may indicate insufficient ambition
- FR-16.7: OKR visible on user profiles by default; configurable visibility (everyone, leaders-only, team-specific)
- FR-16.8: Insert OKRs into Docs with bi-directional sync
- FR-16.9: Manager dashboard — completion rate, alignment rate, score distributions
- FR-16.10: Version history — track daily changes to OKR content
- FR-16.11: Comments and @mentions on objectives and KRs
- FR-16.12: Nudge team members to create or update OKRs

---

### Module 17: Approval Workflows

**Purpose:** Configurable multi-step approval system with forms, routing, and audit trails.

**Dependencies:** Auth & Identity, Messenger (in-chat approvals)

**Entities:**
- `ApprovalTemplate` (id, org_id, name, form_schema_json, workflow_json, category)
- `ApprovalRequest` (id, template_id, requester_id, form_data_json, status [pending|approved|rejected|cancelled], created_at)
- `ApprovalStep` (id, request_id, step_index, approver_ids, type [sequential|parallel], status, decided_by, decided_at, comment)

**Functional Requirements:**

- FR-17.1: Form builder for approval request types (leave, reimbursement, procurement, content review, custom)
- FR-17.2: Multi-step approval flows with configurable reviewers per step
- FR-17.3: Conditional routing — different paths based on form field values (e.g., amount > $1000 → VP approval)
- FR-17.4: Parallel and sequential approval modes — all approvers in parallel vs one-after-another
- FR-17.5: Auto-escalation — escalate to next level after configurable timeout
- FR-17.6: Approve/reject with single action; add comments
- FR-17.7: In-chat approval — approval card sent in Messenger; approve/reject without leaving chat
- FR-17.8: Full audit trail — every action logged with timestamp, actor, decision, comment
- FR-17.9: Approval dashboard — view all pending/completed approvals; filter by type/status/date
- FR-17.10: Template library — pre-built templates for common workflows
- FR-17.11: Mobile push notification for pending approvals

---

### Module 18: Attendance & HR

**Purpose:** Time tracking, shift management, leave management, and overtime with HR administration.

**Dependencies:** Auth & Identity, Calendar, Approval Workflows (for leave requests)

**Entities:**
- `AttendanceGroup` (id, org_id, name, settings_json)
- `AttendanceGroupMember` (group_id, user_id)
- `AttendanceLocation` (id, group_id, lat, lng, radius_meters, wifi_ssid, name)
- `ClockRecord` (id, user_id, group_id, type [clock_in|clock_out], method [gps|wifi|manual], location_json, timestamp)
- `Shift` (id, org_id, name, type [fixed|flex|imported], start_time, end_time, settings_json)
- `ShiftAssignment` (shift_id, user_id, date)
- `LeaveType` (id, org_id, name, accrual_rule_json, balance_reset_schedule)
- `LeaveBalance` (user_id, leave_type_id, balance_minutes, accrued_minutes, used_minutes)
- `LeaveRequest` (id, user_id, leave_type_id, start_time, end_time, approval_request_id, status)
- `OvertimeRecord` (id, user_id, date, minutes, calculation_method, compensation_type [pay|time_off])

**Functional Requirements:**

- FR-18.1: GPS clock-in — configure geographic locations with radius; verify user is within range (up to 2,500 locations)
- FR-18.2: Wi-Fi clock-in — configure SSIDs; verify connected network
- FR-18.3: Manual clock-in — self-reported with optional admin approval
- FR-18.4: Three shift types: fixed-time, flextime, imported from Excel
- FR-18.5: Attendance groups — different rules per group; four-stage configuration (basic info, shifts, clock method, settings)
- FR-18.6: Leave types — admin-defined (annual, sick, personal, compensatory, custom)
- FR-18.7: Leave accrual rules — automatic entitlement calculation and reset schedules
- FR-18.8: Leave balance tracking — real-time display; admin can adjust
- FR-18.9: Leave requests — integrated with Approval Workflows
- FR-18.10: Overtime — three calculation methods: applicant-specified, clock-based, automatic
- FR-18.11: Overtime compensation: monetary or time-off conversion
- FR-18.12: Four admin roles: Primary Admin, App Admin, Leave Admin, Group Admin
- FR-18.13: Attendance statistics dashboards with export capability
- FR-18.14: Attendance reminders — alerts for clock-in times and pending requests
- FR-18.15: Admin can edit member clock records with audit trail

---

### Module 19: Email

**Purpose:** Built-in email client with custom domain support, IMAP/SMTP, and integration with other modules.

**Dependencies:** Auth & Identity

**Entities:**
- `Mailbox` (id, user_id, org_id, email_address, type [primary|alias])
- `EmailMessage` (id, mailbox_id, message_id_header, subject, from_addr, to_addrs, cc_addrs, body_html, body_text, thread_id, folder, flags_json, received_at)
- `EmailDomain` (org_id, domain, verified, mx_records_json, dkim_config)
- `MailingList` (id, org_id, address, member_ids)

**Functional Requirements:**

- FR-19.1: Send and receive email with rich text composition
- FR-19.2: Thread-based conversation view
- FR-19.3: Custom domain setup — DNS verification, MX records, DKIM/SPF/DMARC
- FR-19.4: Mailbox provisioning — admin creates mailboxes for org members
- FR-19.5: Mailing lists — create distribution lists; send to list address
- FR-19.6: Folder management — inbox, sent, drafts, archive, trash, custom folders
- FR-19.7: Search with operators: subject, from, to, has:attachment, date range
- FR-19.8: IMAP/SMTP access — generate app-specific passwords for external email clients
- FR-19.9: Link third-party email accounts (Gmail, Outlook) into unified inbox
- FR-19.10: Email-to-Task — convert any email to a Task with one click
- FR-19.11: Auto-translate emails using platform translation
- FR-19.12: Email signatures — configurable per user

---

### Module 20: Search

**Purpose:** Global cross-module search with advanced operators and real-time indexing.

**Dependencies:** All content modules (Messenger, Docs, Calendar, Tasks, Email, Wiki, Base)

**Entities:**
- `SearchIndex` — managed by Meilisearch or PostgreSQL FTS; documents indexed from all modules

**Functional Requirements:**

- FR-20.1: Global search triggered by Cmd+K / Ctrl+K — searches contacts, messages, documents, apps, events, emails, tasks
- FR-20.2: Category-based filtering — narrow by Messages, Docs, Email, Events, Groups, Tasks
- FR-20.3: Advanced search operators: `from:`, `to:`, `in:`, `filetype:`, `intitle:`, `is:`, `before:`, `after:`, `on:`, `older_than:`, `newer_than:`, exact phrase `""`
- FR-20.4: Real-time indexing — new content searchable within seconds
- FR-20.5: Search results show surrounding context (message context in chat results)
- FR-20.6: In-page search (Cmd+F / Ctrl+F) within current view
- FR-20.7: Search suggestions and recent searches
- FR-20.8: Permission-aware — only show results user has access to

---

### Module 21: Translation

**Purpose:** Real-time translation across chat, documents, meetings, and email.

**Dependencies:** Messenger, Docs, Video Meetings, Email

**Entities:**
- `TranslationPreference` (user_id, auto_translate_enabled, target_language, content_types_json)

**Functional Requirements:**

- FR-21.1: Chat message translation — recognize 100+ source languages, translate to 18 target languages
- FR-21.2: One-click auto-translate toggle per user; persists across sessions
- FR-21.3: Meeting subtitle translation — per-participant language selection for real-time subtitles
- FR-21.4: Document translation — translate entire documents preserving formatting
- FR-21.5: Email translation — translate incoming/outgoing emails
- FR-21.6: Supported content: text messages, rich text, forwarded messages; NOT supported: voice messages, message cards, images
- FR-21.7: Translation powered by pluggable backend (DeepL, Google Translate, or self-hosted LibreTranslate)

---

### Module 22: AI Features

**Purpose:** AI-powered assistance across the platform — meeting transcription, smart compose, document AI, intelligent search.

**Dependencies:** All modules (AI is a cross-cutting concern)

**Entities:**
- `AIJob` (id, type [transcription|summary|compose|analysis], input_json, output_json, status, model, cost_tokens)

**Functional Requirements:**

- FR-22.1: Meeting transcription via Whisper (or compatible ASR); speaker diarization
- FR-22.2: Meeting summary generation — key points, action items, chapters
- FR-22.3: Smart compose — predictive text suggestions in messages, docs, email
- FR-22.4: Document summarization — summarize long documents on demand
- FR-22.5: AI writing assistant — rewrite, adjust tone, expand, compress text selections in Docs
- FR-22.6: AI-powered search ranking — context-aware result scoring
- FR-22.7: Smart scheduling assistant — suggest optimal meeting times across participants
- FR-22.8: Pluggable LLM backend — support OpenAI, Anthropic, local models (Ollama) via unified interface
- FR-22.9: AI usage quotas per plan tier

---

### Module 23: Workplace & Admin Console

**Purpose:** Customizable dashboard portal, app management, and comprehensive admin controls.

**Dependencies:** Auth & Identity, all modules

**Entities:**
- `WorkplaceConfig` (org_id, layout_json, featured_apps_json)
- `InstalledApp` (id, org_id, app_id, enabled, settings_json)
- `AuditLog` (id, org_id, actor_id, action, entity_type, entity_id, diff_json, ip, timestamp)
- `SecurityPolicy` (org_id, policy_type, config_json) — password, DLP, watermark, device policies

**Functional Requirements:**

**Workplace:**
- FR-23.1: Customizable home dashboard — app shortcuts, quick links, embedded Base dashboard charts
- FR-23.2: App launcher — browse and launch all installed apps
- FR-23.3: Role-based views — different departments see different Workplace layouts
- FR-23.4: Widget system — embed live data from Base, Calendar, Tasks on dashboard

**Admin Console:**
- FR-23.5: Organization settings — name, logo, domain, industry, plan management
- FR-23.6: Department hierarchy management with drag-and-drop reordering
- FR-23.7: User management — invite, deactivate, transfer data, view activity
- FR-23.8: Custom admin roles — create scoped roles (HR Admin, IT Admin) with granular permissions
- FR-23.9: SSO configuration — SAML 2.0 setup with IdP metadata import
- FR-23.10: SCIM 2.0 directory sync status and configuration
- FR-23.11: Two-factor authentication enforcement per org/department
- FR-23.12: Audit logs — track all admin and user actions; retain 180+ days; export
- FR-23.13: Activity auditing — logins, file access, message deletion, app usage
- FR-23.14: Data loss prevention (DLP) — pattern matching for sensitive data (SSN, credit cards, etc.); block or alert
- FR-23.15: Watermark protection — display user identifier on all screens and exported documents
- FR-23.16: External communication controls — configure which departments can message external users
- FR-23.17: Storage usage monitoring per user and department
- FR-23.18: Meeting room management — add/edit rooms with capacity, equipment, location
- FR-23.19: App management — enable/disable apps, configure default apps per department

---

### Module 24: Open Platform (API & Integrations)

**Purpose:** Developer platform with REST APIs, webhooks, bot SDK, and interactive message cards.

**Dependencies:** Auth & Identity, Messenger

**Entities:**
- `App` (id, org_id, name, description, type [custom|marketplace], app_id, app_secret_hash, redirect_uris, scopes, bot_enabled, webhook_url)
- `EventSubscription` (app_id, event_type, callback_url, status)
- `WebhookDelivery` (id, subscription_id, event_type, payload_json, status, attempts, last_attempt_at)

**Functional Requirements:**

- FR-24.1: App registration — create custom apps with App ID + Secret; configure scopes
- FR-24.2: Three app forms: Bot (chat interface), Web App (embedded webview), Gadget (sandboxed mini-program)
- FR-24.3: OAuth 2.0 authorization code flow for user-context API access
- FR-24.4: Three token types: app_access_token (app context), tenant_access_token (org context), user_access_token (user context)
- FR-24.5: REST API across all modules: messaging, calendar, docs, contacts, tasks, approval, attendance, base
- FR-24.6: Event subscriptions — register callback URLs for platform events (message received, member joined, approval submitted, etc.)
- FR-24.7: Webhook delivery with retry (exponential backoff, max 5 attempts) and delivery logs
- FR-24.8: WebSocket event streaming as alternative to webhooks
- FR-24.9: Interactive message cards — declarative JSON for buttons, dropdowns, date pickers, forms; action callbacks to app
- FR-24.10: Card builder tool — visual/declarative card design with JSON export
- FR-24.11: Rate limiting — per-app, per-tenant; configurable by admin
- FR-24.12: Bot SDK (Node.js) — helpers for message handling, card building, event processing
- FR-24.13: Notification bots — simple webhook-based bots for one-way notifications into group chats
- FR-24.14: API documentation with interactive playground

---

## Non-Goals (Out of Scope for V1)

- **Native desktop apps** — web-first; Electron wrapper can come later
- **End-to-end encryption** — server-side encryption at rest; E2EE is a post-V1 feature
- **Multi-region deployment** — single-region is fine for medium orgs
- **Federated/decentralized architecture** — single-instance deployment
- **Lark Rooms (hardware)** — no conference room hardware integration
- **Meegle (dedicated PM tool)** — Base + Tasks covers project management; Meegle-style node workflows are post-V1
- **AnyCross (iPaaS)** — the Open Platform API covers integration needs; a full iPaaS is post-V1
- **Help Desk / Ticketing** — not in V1; can be built as a custom app via Open Platform
- **Webinar mode** — large meetings (1,000 participants) cover this; dedicated webinar features are post-V1
- **Advanced DLP engines** — basic pattern matching in V1; third-party DLP engine integration is post-V1

---

## Design Considerations

### UI/UX Patterns (Matching Lark)

- **Three-panel desktop layout:** Left sidebar (navigation rail + chat list), center panel (active content), right panel (contextual info)
- **Navigation rail:** Vertical icon bar: Messenger, Calendar, Docs, Email, Tasks, Base, Wiki, Workplace, Admin
- **Chat tabs:** Auto-generated tabs at top of each chat (Chat, Docs, Files, Pins, Announcements)
- **Block editor:** Floating toolbar on selection, plus (+) button on empty lines, six-dot drag handle on hover, slash (/) commands
- **Message hover actions:** Quick emoji picker, reply, forward, "..." menu (edit, recall, buzz, pin, favorite, task, export)
- **Keyboard shortcuts:** Cmd+K (search), Cmd+D (mark done), Cmd+Shift+Y (status), Cmd+Option+C (code block)
- **Auto-save everywhere:** No save buttons; all changes persisted continuously

### Theming

- Light and dark mode with system preference detection
- Custom brand colors per organization (logo, accent color)
- Consistent color system across all modules

### Responsive Design

- Desktop-first (1024px+) with responsive breakpoints for tablet
- Mobile web as progressive web app (PWA)
- React Native app shares business logic with web via shared packages

---

## Technical Considerations

### Performance Targets

- Message delivery: < 100ms end-to-end (same region)
- Document sync: < 200ms for collaborative edits to appear
- Search: < 300ms for results to render
- Page load: < 2s initial load; < 500ms navigation
- Video: < 500ms join time; support 100 simultaneous video streams

### Database Strategy

- PostgreSQL with connection pooling (PgBouncer)
- JSONB columns for flexible/extensible schemas (message content, form data, card layouts)
- Full-text search via PostgreSQL `tsvector` for initial version; migrate to Meilisearch for advanced features
- Row-level security for multi-tenant isolation
- Indexes on: org_id, user_id, created_at, chat_id + created_at (message queries), document_id

### Deployment

- Docker Compose for development and small deployments
- All services in a single repository (monorepo with Turborepo)
- Separate containers: web, api, hocuspocus, livekit, redis, postgres, minio, meilisearch, worker
- Environment-based configuration (no hardcoded secrets)
- Health checks and graceful shutdown for all services

### Security

- HTTPS everywhere (TLS 1.3)
- CSRF protection on all state-changing endpoints
- Rate limiting on auth endpoints (brute force prevention)
- Input sanitization and parameterized queries (SQL injection prevention)
- Content Security Policy headers (XSS prevention)
- File upload validation (type, size, malware scan via ClamAV)
- Audit logging of all privileged operations
- Encrypted secrets storage (API keys, tokens)

---

## Module Dependency Graph

This graph shows which modules must be built before others. Ralph should use this to determine optimal build order.

```
Auth & Identity ──────────────────────────────────────────┐
  │                                                        │
  ├── Messenger ────────── Buzz                            │
  │     │                                                  │
  │     ├── Video Meetings ── Lark Minutes                 │
  │     │                                                  │
  │     ├── Tasks ─────────── (also depends on Calendar,   │
  │     │                      Docs)                       │
  │     │                                                  │
  │     └── Approval Workflows                             │
  │           │                                            │
  │           └── Attendance & HR (also depends on         │
  │                                Calendar)               │
  │                                                        │
  ├── Calendar ────────────────────────────────────────────┤
  │                                                        │
  ├── Docs (+ Collab Engine) ── Sheets                     │
  │     │                       Slides                     │
  │     │                       MindNotes                  │
  │     │                       Board                      │
  │     │                                                  │
  │     └── Wiki                                           │
  │                                                        │
  ├── Base ──── Forms                                      │
  │             Dashboards                                 │
  │                                                        │
  ├── Email                                                │
  │                                                        │
  ├── OKR (also depends on Docs)                           │
  │                                                        │
  ├── Search (depends on all content modules)              │
  │                                                        │
  ├── Translation (depends on Messenger, Docs, Meetings)   │
  │                                                        │
  ├── AI Features (depends on all modules)                 │
  │                                                        │
  ├── Workplace & Admin Console (depends on all modules)   │
  │                                                        │
  └── Open Platform (depends on Auth, Messenger)           │
```

**Recommended build phases (for Ralph's reference):**

1. **Foundation:** Auth & Identity → Messenger → Calendar
2. **Content:** Docs (+ Collab Engine) → Wiki → Sheets → Base
3. **Communication:** Video Meetings → Minutes → Buzz → Translation
4. **Productivity:** Tasks → Approval Workflows → Forms → OKR
5. **Enterprise:** Email → Attendance & HR → Admin Console → Workplace
6. **Platform:** Search → AI Features → Open Platform
7. **Polish:** Slides → MindNotes → Board → Dashboards

Each phase delivers standalone value. Phase 1 alone is a usable team communication tool.

---

## Success Metrics

- **Functional parity:** All 24 modules implemented with core FRs passing acceptance tests
- **Performance:** All latency targets met under 100 concurrent users
- **Reliability:** 99.9% uptime for SaaS deployment
- **Developer adoption:** Open Platform API used by at least 3 community-built integrations
- **Self-hosting:** Deployable via `docker compose up` in under 10 minutes
- **Code quality:** >80% test coverage on API layer; TypeScript strict mode; zero known security vulnerabilities

---

## Open Questions

1. **Licensing details:** Should the CRDT collaboration server (Hocuspocus) be included in the AGPLv3 scope, or kept separate for commercial licensing flexibility?
2. **Video infrastructure costs:** LiveKit is open source but WebRTC media requires significant bandwidth — should we offer BYO-LiveKit for self-hosters?
3. **AI model costs:** Meeting transcription and summarization require GPU or API calls — should we default to self-hosted Whisper or cloud APIs (OpenAI, Anthropic)?
4. **Mobile priority:** Should React Native mobile app be in V1 or post-V1? PWA may suffice initially.
5. **Spreadsheet engine:** HyperFormula covers formulas but the rendering/interaction layer needs a custom grid component — evaluate existing open-source options (Luckysheet, Fortune Sheet) vs. building from scratch.
6. **Calendar protocol:** CalDAV for external sync is complex — should V1 support only iCal import/export with full CalDAV in V2?
7. **Email complexity:** Running a full email server (Haraka) is operationally heavy — should V1 use a transactional email API (SendGrid/Postmark) with full SMTP in V2?
