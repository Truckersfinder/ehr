# OneHealthEHR - Electronic Health Records System

## Overview
A comprehensive, production-grade Electronic Health Record (EHR) system built for healthcare facilities. Features role-based access control, patient management, clinical encounters with SOAP notes, appointment scheduling, laboratory orders, pharmacy/prescriptions, billing, and audit logging.

## Architecture
- **Frontend**: React with TypeScript, Vite, TailwindCSS, Shadcn UI
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: JWT-based with RBAC (8 roles)

## Key Files
- `shared/schema.ts` - All database schemas and types (users, patients, encounters, vitals, appointments, lab orders, prescriptions, invoices, audit logs)
- `server/routes.ts` - All API endpoints
- `server/storage.ts` - Database storage layer (IStorage interface + DatabaseStorage)
- `server/auth.ts` - JWT auth middleware, password hashing, role-based access
- `server/seed.ts` - Seed data for demo (users, patients, encounters, etc.)
- `server/db.ts` - Database connection (Drizzle + pg)
- `client/src/App.tsx` - Main app with routing and auth
- `client/src/lib/auth.tsx` - Auth context with JWT token management
- `client/src/lib/app-nav-items.ts` + `client/src/components/app-header-nav.tsx` - Role-aware header navigation (main nav sidebar removed)
- `client/src/components/theme-provider.tsx` - Dark/light theme toggle

## Pages
- `/` - Dashboard with stats, schedule, active encounters
- `/patients` - Patient list with search, registration dialog
- `/patients/:id` - Patient detail with encounters, labs, rx, billing tabs
- `/encounters` - Encounter list with new encounter creation
- `/encounters/:id` - SOAP notes editor, vitals recording
- `/appointments` - Appointment scheduler with status management
- `/laboratory` - Lab order workflow (ordered → collected → processing → completed)
- `/pharmacy` - Prescription dispensing workflow
- `/billing` - Invoice management with payment recording
- `/admin` - User management, facilities, audit logs

## User Roles (RBAC)
- super_admin, facility_admin, clinician, nurse, lab_tech, pharmacist, finance, reception

## Demo Credentials
- admin / admin123 (Super Admin)
- drwanjiku / doctor123 (Clinician)
- nomondi / nurse123 (Nurse)
- reception / reception123 (Receptionist)
- labtech / lab123 (Lab Tech)
- pharmacist / pharm123 (Pharmacist)

## Database
PostgreSQL via Drizzle ORM. Schema managed in `shared/schema.ts`.
Push schema changes with `npm run db:push`.

## Running
`npm run dev` starts the Express backend + Vite dev server on **http://127.0.0.1:3000** (port 3000).
