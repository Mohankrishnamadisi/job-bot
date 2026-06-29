# Job Portal Project Summary

## 1. Project Overview

The Job Portal project is a modular job aggregation platform designed to collect, normalize, deduplicate, and store software engineering and technology jobs from multiple employers. The system supports multiple user-facing portals and is intended to serve as the data backbone for:

- Candidate Portal
- Premium Candidate Portal
- Recruiter Portal
- Admin Portal

The platform aggregates job listings from multiple companies and prepares them for search, filtering, matching, and future recruiter/admin workflows. The architecture separates scraping, normalization, synchronization, and persistence so new companies can be integrated with minimal duplication of logic.

---

## 2. Technology Stack

The current implementation is built around a lightweight Node.js backend with a Supabase-backed data layer.

### Core Technologies

- Node.js
- JavaScript (CommonJS)
- Axios
- Playwright
- Supabase
- PostgreSQL
- GitHub
- VS Code

### Supporting Libraries and Tools

- dotenv
- form-data
- node-cron
- @supabase/supabase-js

### Development Environment

- Local development on Windows
- Environment variables managed through .env files
- Project runtime executed through Node.js scripts

---

## 3. Database

The project uses Supabase as the hosted database layer, with PostgreSQL-style tables and relational constraints.

### companies

#### Purpose

Stores company metadata used to identify the employer behind scraped jobs.

#### Important columns

- id: unique company identifier
- name: company display name
- career_url: company careers page URL
- ats_type: ATS integration type, such as Playwright-based or API-based
- website_url: optional company website
- enabled: whether the company is active for scraping
- created_at: creation timestamp
- updated_at: last update timestamp

#### Example row

```json
{
  "id": "3a805eaa-7598-49e7-a91e-fc9750d6d865",
  "name": "Accenture",
  "career_url": "https://www.accenture.com/us-en/careers",
  "ats_type": "playwright",
  "enabled": true
}
```

### jobs

#### Purpose

Stores the normalized job records discovered by scrapers.

#### Important columns

- id: unique job identifier
- company_id: foreign key to companies
- title: job title
- location: location string
- work_mode: remote/on-site/hybrid
- employment_type: full-time/contract/etc.
- experience: extracted experience requirement
- salary: extracted salary, if present
- description: full job description
- apply_url: unique URL used for deduplication
- source: source company or scraper name
- posted_date: normalized posting date
- status: current lifecycle state, typically active/open
- is_active: whether the job is still active in the current sync window
- external_job_id: provider-specific ID

#### Unique constraints

- The jobs table enforces uniqueness on apply_url through a unique constraint such as unique_apply_url.
- This is essential to prevent duplicate ingestion.

#### Indexes

The database should be indexed on:

- company_id
- source
- apply_url
- is_active
- posted_date

### scrape_logs

#### Purpose

Stores scraping execution metadata, such as run time, company, page count, job count, success/failure status, and errors.

#### Expected columns

Current or planned columns may include:

- id
- company_name
- started_at
- finished_at
- status
- pages_scraped
- jobs_found
- jobs_inserted
- jobs_updated
- jobs_removed
- error_message

---

## 4. Current Scraper Architecture

The scraper architecture follows a clear pipeline from source discovery to database persistence.

```text
Company
↓
Scraper
↓
Normalize
↓
Job Sync
↓
Job Repository
↓
Supabase
```

### Layer explanations

#### 1. Company

Each supported company is represented by a scraper module. The scraper knows how to reach the employer’s careers pages or job APIs.

#### 2. Scraper

The scraper fetches raw job records from the source website. This may involve:

- HTTP requests via Axios
- Browser automation via Playwright
- Pagination through multiple result pages
- Retry logic for rate limiting or transient failures

#### 3. Normalize

Raw job payloads are transformed into a consistent internal shape before being saved. This step standardizes fields such as:

- title
- location
- work mode
- posted date
- description
- apply URL
- company name

#### 4. Job Sync

The sync layer compares currently scraped jobs against existing rows in the database. It decides whether each job is:

- new
- existing
- updated
- removed/inactive

#### 5. Job Repository

The repository layer prepares job data for persistence and writes it to Supabase. It also resolves related metadata such as company_id.

#### 6. Supabase

All final persistence happens in Supabase, where job records and company records are stored.

---

## 5. Common Components

The project contains several reusable components that keep scrapers modular and maintainable.

### companyRepository

Handles company lookup and creation.

Responsibilities:

- Ensure a company row exists
- Resolve company metadata
- Provide a fallback career URL when one is missing

### jobRepository

Handles the persistence layer for jobs.

Responsibilities:

- Normalize job payloads
- Resolve company_id from the companies table
- Insert new jobs
- Upsert or update existing jobs
- Mark removed jobs inactive

### jobSyncService

Contains the core synchronization logic.

Responsibilities:

- Identify new jobs
- Identify existing jobs
- Identify changed jobs
- Identify removed jobs
- Prevent duplicate insertions

### jobHelpers

Common parsing helpers used by scrapers.

Responsibilities:

- parse employment type
- extract experience
- extract salary
- extract work mode
- chunk arrays
- delay helper functions

### jobFilters

Reusable filters that decide whether a job should be retained.

Responsibilities:

- Skip unsupported or incomplete jobs
- Apply quality checks before persistence

### logger

Central logging utility.

Responsibilities:

- Provide structured info/error/warn output
- Avoid ad hoc console-only logging

### Supabase client

Shared database connection wrapper for all repositories.

Responsibilities:

- Provide a single access point to Supabase
- Keep database access consistent

### Normalization

A common normalization pattern is used so all scrapers produce a similar job shape.

### Duplicate detection

The system uses apply_url matching as the primary duplicate detection mechanism.

### Retry logic

Scrapers include retry behavior for transient issues such as rate limiting or temporary request failures.

### Pagination

Most scrapers support paginated fetches so they can retrieve complete job lists from provider endpoints.

---

## 6. Supported Scrapers

The current project has initial support for several companies.

| Company | Status | ATS | Notes |
|---|---|---|---|
| Amazon | Implemented | Custom/HTML-based | Basic job listing support |
| Microsoft | Implemented | Custom/HTML-based | Working integration |
| NVIDIA | Implemented | Custom/HTML-based | Included in current support set |
| Accenture | Implemented | Playwright-based | Verified through live scraper runs |

---

## 7. Generic Architecture

New companies should be added through a repeatable process.

### Step-by-step process

1. Create a scraper module
   - Add a dedicated file under the scrapers folder.

2. Implement source fetching
   - Use Axios or Playwright depending on the site requirements.

3. Normalize the response
   - Convert the raw payload into the common job schema.

4. Register the scraper
   - Ensure it is discoverable by the main entry points.

5. Run the scraper
   - Test it locally and inspect the resulting jobs.

6. Verify synchronization behavior
   - Confirm that first run inserts jobs and second run detects them as existing.

### Expected design pattern

A new scraper should:

- fetch raw jobs
- normalize them
- ensure the company exists
- sync them through the shared repository flow
- persist to Supabase

---

## 8. Synchronization Logic

The synchronization flow is the core of the data pipeline.

### New jobs

A job is considered new when:

- its apply_url does not already exist in the current database snapshot
- it is not already present in the source-derived existing set

### Existing jobs

A job is considered existing when:

- its apply_url is already present in the database
- or the full-source snapshot confirms it is already known for the company

### Updated jobs

A job is treated as updated when:

- the job exists in the database
- and at least one important field changed, such as title, location, work_mode, posted_date, or apply_url

### Inactive jobs

A job is marked inactive when:

- it existed in the previous source snapshot
- but is no longer returned by the current scrape

### Duplicate prevention

The system relies on apply_url uniqueness to avoid duplicate rows.

### Apply URL uniqueness

The apply_url is the primary identity field for deduplication. If the same job appears again in a future scrape:

- it should be recognized as an existing job
- it should not be inserted again
- it should be updated only if content has changed

If the database already contains the same apply_url, Supabase will reject a conflicting insert with a unique constraint error.

---

## 9. Development Commands

The project is operated with Node.js commands and small helper scripts.

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

### Syntax check a file

```bash
node -c src/database/jobRepository.js
```

### Run an individual scraper

Example:

```bash
node -e "const { scrapeAccentureJobs } = require('./src/scrapers/accenture'); scrapeAccentureJobs('', '', false, { dryRun: false }).catch(console.error);"
```

### Seed companies

```bash
node src/database/seedCompanies.js
```

### Future scheduler command

A scheduler entry point may eventually be used to run periodic scrapes:

```bash
node src/scheduler/cron.js
```

---

## 10. Environment Variables

The project expects environment variables for configuration and database access.

Use placeholders such as the following in the .env file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

ACCENTURE_DRY_RUN=false
```

Important notes:

- Do not commit real secrets.
- Keep local environment values out of source control.
- Use the same variable names consistently across scripts.

---

## 11. Folder Structure

The current repository structure is as follows:

```text
job-bot/
├── package.json
├── README.md
├── PROJECT_SUMMARY.md
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── env.js
│   │   └── supabase.js
│   ├── database/
│   │   ├── companyRepository.js
│   │   ├── jobRepository.js
│   │   └── seedCompanies.js
│   ├── parsers/
│   │   └── common/
│   │       ├── jobFilters.js
│   │       ├── jobHelpers.js
│   │       ├── jobSyncService.js
│   │       └── normalization.js
│   ├── schedulers/
│   ├── scrapers/
│   │   ├── amazon.js
│   │   ├── accenture.js
│   │   ├── browser.js
│   │   ├── companyScraper.js
│   │   ├── index.js
│   │   ├── microsoft.js
│   │   └── nvidia.js
│   ├── services/
│   │   ├── aiService.js
│   │   └── duplicateService.js
│   └── utils/
│       └── logger.js
└── test/
    └── jobSyncService.test.js
```

---

## 12. Coding Standards

The codebase should follow a few consistent standards to remain maintainable.

### Principles

- Reuse common utilities rather than duplicating logic.
- Keep scrapers modular and focused on one provider.
- Normalize raw job data before saving.
- Use the shared logger instead of ad hoc console output in production code.
- Keep repository functions responsible for data access only.
- Preserve clear separation between scraping, normalization, sync, and persistence.
- Prefer deterministic and testable functions.

### Logging conventions

- Use logger.info for successful lifecycle events.
- Use logger.warn for recoverable issues.
- Use logger.error for failures.
- Avoid console.log in production business logic unless required for debugging.

---

## 13. Current Progress

The project is currently in a working state for core synchronization and persistence.

### Completed

- Amazon integration
- Microsoft integration
- NVIDIA integration
- Accenture integration
- Working synchronization flow
- Database integration
- Company auto-creation
- Initial duplicate prevention via apply_url logic

### Current status

The architecture is functional enough to scrape, normalize, sync, and save jobs into Supabase. The main remaining focus areas are broader production hardening and adding more companies.

---

## 14. Roadmap

### Phase 1

Completed or in progress:

- Amazon
- Microsoft
- NVIDIA
- Accenture
- Working synchronization
- Database integration

### Phase 2

Planned next work:

- Generic runner for multiple companies
- Scheduler for recurring scrapes
- Scrape logs table and reporting
- Admin APIs

### Phase 3

Future expansion targets:

- Oracle
- Adobe
- Cisco
- Intel
- SAP
- Infosys
- TCS
- Wipro
- Capgemini
- Cognizant
- Additional ATS integrations

---

## 15. Future Improvements

The project has strong potential for expansion.

### Planned improvements

- Notifications for new jobs
- Resume matching
- AI-based job recommendations
- Automated scheduler improvements
- Monitoring and health checks
- Metrics and dashboards
- Retry dashboard and failure analytics

---

## 16. Known Decisions

Several architectural decisions were made during development to keep the system maintainable and extensible.

### Decision 1: Separate scraping from persistence

Scrapers were kept separate from database logic so each company integration can focus on source-specific extraction without mixing in storage concerns.

### Decision 2: Normalize early

All scrapers should normalize into a common job shape before the sync layer or repository touches the data. This prevents format drift and supports reuse across providers.

### Decision 3: Use apply_url as the primary deduplication key

The system uses apply_url as the main identifier because it reflects the unique job posting URL and is strongly correlated with the source job listing.

### Decision 4: Keep company creation automatic

The company repository ensures a company exists before saving jobs. This prevents orphaned jobs and makes each scrape self-contained.

### Decision 5: Prefer shared utilities over per-scraper duplication

Helper functions for parsing, filtering, logging, and syncing are centralized so new scrapers can reuse proven logic.

---

## 17. How to Continue in a New Chat

If a new chat is started later, the project can continue smoothly by using this file as the primary handoff document.

### Recommended workflow

1. Upload PROJECT_SUMMARY.md into the new chat.
2. Open the repository files that are relevant to the next task.
3. Continue from the current architecture without needing to reconstruct earlier debugging context.
4. Use this document as the shared reference for:
   - system architecture
   - supported scrapers
   - database model
   - sync behavior
   - roadmap

### Why this helps

This summary captures the core decisions, current architecture, and verified behavior so a new developer can continue the project quickly without reading previous chat history.
