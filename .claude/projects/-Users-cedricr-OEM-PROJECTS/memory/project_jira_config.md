---
name: JIRA shared config
description: JIRA connection is shared — admin credentials used for all users, viewers can only change JQL
type: project
---

JIRA connection uses a single admin-managed configuration (email + API token). All users see the same JIRA data.

**Why:** Security — only admins should control JIRA credentials. Viewers should only customize their JQL query.

**How to apply:**
- JIRA config (email + apiToken) is stored once by the admin in the `settings` table
- All users' JIRA sync uses the admin's credentials
- The "Connect Jira" button shows the JQL editor for everyone, but credential fields only for admins
- Admin emails: cedric.robalo@nextlane.com, cedric.robalo@gmail.com
