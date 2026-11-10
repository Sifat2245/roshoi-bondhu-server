# Heshel / Roshoi Bondhu backend

Backend source for the recipe-sharing social platform, using **TypeScript, Express, PostgreSQL, Prisma, Better Auth and GraphQL Yoga**.

## Backend design documentation

Start with the [backend implementation handbook](docs/backend/README.md). It contains the current-source audit, proposed schema/relationships, scoped RBAC and privacy, end-to-end API workflows, a sequential roadmap after authentication, scaling/operations, migration/testing, and SQL integrity examples.

The current Prisma source defines 11 models. The proposed complete roadmap describes 79 logical tables (74 core + 5 optional), introduced by feature phase. This is a design specification; these tables and new contracts have not been deployed by writing the documentation.

- [What to build after authentication](docs/backend/06-implementation-roadmap.md)
- [All proposed tables and relationships](docs/backend/03-database-schema.md)
- [RBAC, group ownership and audiences](docs/backend/04-rbac-and-privacy.md)
- [Current source gaps and API mismatches](docs/backend/01-current-state.md)

## Current source layout

- `src/modules/`: authentication, users, posts, groups, media, admin and health modules.
- `src/graphql/`: GraphQL Yoga schema and actor context.
- `src/lib/auth.ts`: Better Auth configuration.
- `prisma/schema/`: PostgreSQL models and enums.
- `prisma/seed.ts`: current seed entry point.

The existing source mounts provider authentication under `/api/auth/*`, application REST routes under `/api` and `/api/v1`, and GraphQL through Yoga. Existing legacy recipe routes and the canonical planned contracts differ; consult the source audit rather than assuming every documented target endpoint already exists.

## Development

Install from the repository's lockfile when available, configure the environment required by `src/config/env.ts` and `prisma.config.ts`, and use an isolated development database. Keep environment files and credentials out of version control.

```sh
npm install
npm run prisma:generate
npm run dev
```

Use `npm run build` for TypeScript compilation. Review existing migration history before changing a populated database. Production schema changes require reviewed versioned migrations and a restore plan; do not use development `db push` as a production migration process.

## Documentation validation

```sh
python3 docs/backend/validate_docs.py
```

This validates documentation consistency only. Backend integration, authorization, migration and load-test acceptance plans are documented separately and must be implemented alongside their feature phases.
