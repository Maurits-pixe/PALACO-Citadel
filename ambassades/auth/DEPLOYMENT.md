# Single-process container deployment

This package runs the public embassy pages and the personal OIDC service together. It prepares a deployable application; it does not create hosting, a provider client, ambassador accounts, invitations or operational authority.

## Render blueprint

The separate [Render blueprint](../deployment/render.yaml) describes an alternative single-instance Node host. It selects the free compute plan explicitly, uses the current review branch, disables automatic deployment and expects private provider settings plus the membership secret file at `/etc/secrets/palaco-members.json`. Applying that blueprint still requires the chosen Render account, provider configuration, private membership enrollment and a real login check. The blueprint does not include contacts or enable memberships. Free-plan restarts or idle suspension discard the in-memory sessions; existing users must sign in again. Review the account's current quotas and billing settings before creating a service; a free compute selection does not guarantee that every possible usage charge is zero. See [Render's free service limits](https://render.com/docs/free).

## Build and private runtime settings

Build from the repository root:

```sh
docker build --pull -f ambassades/deployment/Dockerfile -t palaco-ambassador-access:local .
```

The image uses Node 24, installs the production dependencies from the committed lockfile with lifecycle scripts disabled, and runs as the unprivileged Node user. Its build context and copy instructions include only the four public files and the authentication runtime. Private records, environment files and tests are excluded.

Use Docker Compose 2.30 or newer for the supplied Compose file. Prepare two absolute host paths outside the checkout: a private environment file and a private directory containing `members.json`. Supply them to Compose as `PALACO_RUNTIME_ENV_FILE` and `PALACO_PRIVATE_DIR`. Do not put these files in the repository or the image.

The environment file contains the OIDC settings listed in [.env.example](.env.example), including the exact HTTPS public origin, confidential client credentials and a random 64-character hexadecimal session secret. The Compose file uses raw environment-file values: enter literal unquoted values; it does not interpolate dollar signs in secret values. Keep that file readable only by the deployment operator. Container environment values are visible to operators who can inspect the container; restrict access to the host and Docker service.

Start with the empty registry in [members.example.json](members.example.json). Keep the private registry directory separate from the environment file. Its directory must be traversable and `members.json` readable by the container's UID/GID 1000, while ordinary host users cannot read or write it. Bind mounts preserve host permissions; account for any user-namespace mapping on the chosen host. The container mounts the directory read-only at `/private`, outside its application root.

After setting the two path variables in the operator's shell:

```sh
docker compose -f ambassades/deployment/compose.yaml up --build -d
```

The supplied service uses a read-only root filesystem, drops capabilities and prevents gaining additional privileges. It publishes port 3000 only on the host's loopback interface. Do not scale this service or run a second process with the current session store.

## HTTPS and provider enrollment

Put the selected host's HTTPS reverse proxy in front of `127.0.0.1:3000`. The container accepts HTTP from that local proxy; the user's origin remains HTTPS. The supplied Compose file does not install a proxy, allocate a domain or request certificates. Set `PALACO_TRUST_PROXY` only to the actual trusted proxy IP/CIDR that the container sees, if the deployment needs proxy trust.

Register `<PALACO_BASE_URL>/callback` at the chosen OIDC provider and follow [README.md](README.md) for provider compatibility. Enroll each person privately, verify the provider's immutable issuer/subject identity, and bind that identity to one seat. The public seat list and an email address do not grant access.

Replace `members.json` atomically within the private mounted directory when admitting, suspending or revoking a membership. Mounting the directory allows replacement files to become visible; binding a single file can retain the previous inode. The application checks the current registry on every protected request. Test an actual provider login, the own-seat boundary, revocation, logout and account recovery before reporting a working personal account.

## Liveness and operating limits

The image's health check calls `/healthz`. A healthy process can still have unconfigured OIDC or an unavailable private registry; health does not prove that personal login is ready. `/api/auth/status` reports minimal application availability without publishing contacts or identities.

Sessions and logout tombstones live only in one process's bounded memory. Restart, replacement or crash signs everybody out. There is no shared session storage or high-availability deployment in this package. A durable shared store is required before using multiple instances. Rebuild with current Node 24 security updates, review the resulting image and dependency changes, and retain the deployment's private records and secrets independently.

No enabled memberships or real contacts are included in the image. Authenticated access remains read-only with governance, merge, release and execution authority all false.
