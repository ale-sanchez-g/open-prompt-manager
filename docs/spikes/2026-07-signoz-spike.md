# Spike: Evaluate SigNoz as the OTel Backend

**Status:** Desk spike complete — hands-on sandbox validation still required
**Date:** 2026-07-05
**Issue:** [#345 \[Spike\] Evaluate SigNoz as the OTel backend](https://github.com/ale-sanchez-g/open-prompt-manager/issues/345)
**Paired spike:** #344 (Grafana LGTM stack, identical rubric)
**Feeds into:** #346 (final ADR — OTel backend decision)
**Upstream dependency:** #339 (OTel Collector sidecar, in flight) — this spike assumes the
Collector already exists and simply needs an OTLP export target configured.

> **Environment note:** this evaluation was produced as a **desk spike**. Docker is not
> available in this execution environment, so the live docker-compose sandbox described in
> the original issue (stand up SigNoz, route real OTLP traffic through it, build a dashboard,
> fire an alert) was **not performed**. Everything below is derived from SigNoz's public
> documentation, GitHub repository/issues, and third-party write-ups current as of July 2026.
> Section 4 gives a ready-to-run plan so a follow-up session with Docker can close that gap in
> under an hour.

---

## 1. Executive summary

SigNoz is an OpenTelemetry-native, all-in-one observability platform (traces + metrics + logs +
alerting) built on ClickHouse, backed by ~$6.5M in YC/SignalFire funding, ~19k GitHub stars, and
100+ contributors. Its single biggest strength for this project is that it was **designed around
OTLP from day one** — there is no translation layer between "what the Collector emits" and "what
the backend ingests," and traces/logs/metrics correlate natively in one UI. That maps cleanly
onto the app's existing OTel Collector sidecar work (#339).

Its biggest risk for a **lean, solo-maintainer** team is operational: SigNoz is not a single
process, it is a small distributed system (OTel Collector → ClickHouse [+ ZooKeeper for
clustered installs] → query service/frontend → Alertmanager). ClickHouse is a powerful but
non-trivial database to own, SigNoz's own docs recommend a **16 GB RAM / 8 vCPU node as the
practical minimum** even for small workloads, and the project shipped a breaking schema-migration
change as recently as February 2026 that broke self-hosted upgrades for a number of users. That
minimum footprint (roughly $150–200/month self-hosted on AWS, see §3) is disproportionate to the
app's own compute spend for a single low-traffic ECS service.

**Recommendation stance:** SigNoz is technically the strongest OTel-native fit of the two spikes
on paper (traces/metrics/logs unification, alerting breadth), but for this specific
team-shape/scale it should be treated as a **conditional "not now" for self-hosting**: recommend
against standing up self-hosted SigNoz unless (a) the team is willing to own a ClickHouse node
and its upgrade cadence, or (b) SigNoz Cloud (managed, same OTel-native data model, no
ClickHouse ops) is considered as a variant of "choosing SigNoz" that removes the operational
objection. This is an input to #346, not a final decision — #346 must weigh this against the
#344 Grafana LGTM findings before the ADR is written.

---

## 2. Scorecard

Scores are 1 (poor) – 5 (excellent). Total: **30 / 45**.

| # | Criterion | Score | Justification |
|---|---|---|---|
| 1 | Time-to-first-value / setup effort | 3/5 | SigNoz consolidated to a **single binary** deployment in 2026 specifically to cut install complexity, and official quick-start guidance quotes **2–5 minutes** to a working stack via Docker Compose or the new `Foundry` installer ([SigNoz single binary launch](https://signoz.io/blog/launching-signoz-single-binary/), [SigNoz Foundry](https://github.com/SigNoz/foundry)). That number is optimistic in practice: it still bootstraps ClickHouse schema on first boot, and community support threads show real users hitting init-ordering failures ("signoz-schema-migrator Job not found") on non-trivial installs. First-value time is good, first-*stable*-value time is a notch lower. |
| 2 | OTLP-native traces+metrics+logs correlation | 5/5 | This is SigNoz's core design premise: the OTel Collector ships all three signals directly into ClickHouse, and the UI is built around cross-signal correlation (e.g., jump from a slow trace span to the logs and metrics for that service/time window) ([Technical Architecture](https://signoz.io/docs/architecture/)). No adapter/bridge is needed against the app's existing Collector sidecar (#339) — point the Collector's OTLP exporter at SigNoz and it works unmodified. |
| 3 | Frontend RUM quality (OTel Web SDK) | 3/5 | SigNoz supports the OTel browser SDK for traces, logs, and Core Web Vitals (LCP, INP, CLS, TTFB, FCP) with pre-built Web Vitals dashboards, and metadata (browser, user id, URL) can be attached for RUM-style slicing ([Web Vitals docs](https://signoz.io/docs/frontend-monitoring/opentelemetry-web-vitals/)). It is explicitly **not** a full RUM product, though: no session replay, no funnels/product analytics, and dedicated RUM support was still a community feature request as of GitHub issue #2987. Good enough for "is the SPA slow / erroring," not a Sentry/Datadog RUM replacement. |
| 4 | Alerting & on-call ergonomics | 4/5 | Alert types cover metric thresholds, log patterns/counts, trace span conditions (e.g., p99 latency, error rate), anomaly detection against historical baselines, and exception tracking. Native notification channels include Slack, PagerDuty, Opsgenie, MS Teams, email, and generic webhooks, configurable via UI or API ([Alerts docs](https://signoz.io/docs/alerts/), [Notification channels](https://signoz.io/docs/setup-alerts-notification/)). Third-party assessment puts it at 4.3/5 for this exact axis, with the caveat that **native on-call scheduling/escalation is thin** — you still lean on PagerDuty/Opsgenie for the actual on-call rotation, which is fine for a solo maintainer (no rotation to manage) but worth knowing. |
| 5 | Operational burden (components, storage, upgrades) | 2/5 | The stack is OTel Collector + ClickHouse (+ ZooKeeper for multi-shard) + query service/frontend + Alertmanager + a schema-migration step. That migration step has been a real pain point: v0.113 (2026) **replaced** the standalone `signoz-schema-migrator` job with migration logic built into the Collector specifically because the old job-based approach caused stalled/broken installs ([changelog: breaking change — migration component](https://signoz.io/changelog/2026-02-25--breaking-change-new-migration-component-replaces-signoz-schema-migrator-jf8y4e6rnpt9b8pobd01yfun/)). SigNoz now ships an "Upgrade Path Tool" precisely because upgrades can require multiple mandatory intermediate stops. There is also a documented ClickHouse `system` database storage-bloat footgun that needs manual TTL tuning ("Hidden Storage Killer in SigNoz" — community write-up). None of this is disqualifying, but it is real toil for a team of one. |
| 6 | Resource footprint / cost to self-host on AWS | 2/5 | SigNoz's own capacity-planning docs state a **hard minimum of 4 GB RAM** to run at all, and the **recommended minimum for the ClickHouse node specifically is 16 GB RAM / 8 vCPU**, even for small workloads ([Resources Planning](https://signoz.io/docs/setup/capacity-planning/community/resources-planning/)). That single requirement means the observability stack's own compute floor (~$150–200/month, see §3) is larger than what this app spends on its actual ECS/RDS footprint today. SigNoz does publish an ECS deployment path (single task definition bundling ClickHouse + ZooKeeper + Collector + app, or a sidecar-only pattern) so it fits the existing Fargate/ALB shape, but persistent ClickHouse storage on Fargate needs an EBS-backed or EC2-backed launch type, not bare ephemeral task storage. |
| 7 | Access control / multi-user / SOC2-friendliness | 3/5 | RBAC (Viewer/Editor/Admin) with IdP-group-based auto role assignment is documented, and SAML 2.0/OIDC/Google Workspace SSO are supported with JIT provisioning ([SSO overview](https://signoz.io/docs/manage/administrator-guide/sso/overview/)). The catch: SigNoz's own docs scope full SAML/OIDC SSO to **SigNoz Cloud and Enterprise Self-Hosted** — the free community self-hosted edition's auth story is materially thinner. SigNoz itself does not claim SOC2 certification for the self-hosted software; that would be the operator's responsibility to attest, same as any self-hosted OSS. Fine for a solo maintainer today, a real gap if the team ever needs to hand a teammate read-only access with SSO. |
| 8 | Data retention & query performance | 4/5 | TTLs are configurable per signal (defaults: 15 days traces/logs, 30 days metrics) via UI or `ALTER TABLE ... MODIFY TTL`. ClickHouse's `ts_bucket_start` partition-pruning column is used throughout the schema so queries scoped to recent time windows (the common case) are fast; SigNoz's own benchmarks claim 2.5x faster ingestion and 13x faster aggregate queries versus an ELK baseline. The published caveat is that **wide time-range queries degrade** and should be avoided/paginated — acceptable for a small app's dashboards but worth knowing before building a "last 90 days" panel. |
| 9 | Community, docs, longevity, licensing | 4/5 | ~19,000 GitHub stars, 100+ contributors, YC-backed with $6.5M raised (SignalFire-led, backers include GitHub/PlanetScale/Supabase founders) — healthy signal for longevity. Licensing is dual: the core codebase is **MIT-licensed**, with only the `ee/` and `cmd/enterprise/` directories under a separate proprietary SigNoz Enterprise license (confirmed directly from the repo's `LICENSE` file). That is a genuinely permissive core license — better than a source-available/BSL model — though it means some access-control/enterprise features (see #7) sit behind the non-OSS boundary. Docs are extensive and current (dated changelogs through mid-2026), which matters given the pace of breaking changes noted in #5. |

---

## 3. Rough monthly AWS self-host cost estimate

**Sizing assumption:** this app is a single ECS Fargate backend service + React frontend + RDS
Postgres behind one ALB, low traffic (assume low-single-digit req/s peak, well under 1 GB/day of
combined trace+log+metric telemetry once the #339 Collector is live). This is squarely
"small workload" territory for SigNoz's own sizing guidance — the estimate below already assumes
the *lower* end of what SigNoz recommends, not a growth-padded number.

| Component | Sizing choice | Basis | Est. monthly cost (us-east-1) |
|---|---|---|---|
| SigNoz all-in-one node (ClickHouse + Collector + query service/frontend + Alertmanager) | `r6g.xlarge` (4 vCPU / 32 GiB, ARM) on-demand, single AZ | SigNoz docs: ClickHouse minimum recommended is 16 GB/8 vCPU; going one instance size above the bare compose minimum for headroom and to leave 8 vCPU achievable if scaled to `2xlarge` later | ~$147/mo |
| — bare-minimum alternative | `r6g.large` (2 vCPU / 16 GiB) | Meets the RAM floor but under the recommended 8 vCPU — acceptable only for a throwaway/dev sandbox, not production | ~$74/mo |
| EBS storage (ClickHouse data + WAL) | `gp3`, 50 GiB, baseline 3,000 IOPS / 125 MiB/s (included) | 15-day trace/log TTL + 30-day metric TTL at low volume fits comfortably in 50 GiB with headroom | ~$4/mo |
| Snapshot backups | Daily EBS snapshot, 50 GiB, ~7-day retention | Basic disaster-recovery hygiene SigNoz doesn't provide out of the box | ~$2–3/mo |
| Data transfer | Same-VPC/AZ OTLP traffic from the existing Collector sidecar | No cross-AZ hop assumed | ~$0 (if collocated) |
| **Total (right-sized, production-safe)** | | | **~$155–175/month** |
| **Total (bare-minimum, undersized)** | | | **~$80/month** |

Notes / risks on this estimate:
- This is **compute+storage only**. It excludes maintainer time for upgrades (§ "operational
  burden" above shows this is non-zero and occasionally breaking), TLS/ALB in front of the SigNoz
  UI, and any log-volume growth once #340/#341/#342 land more instrumentation.
- Running SigNoz as an ECS Fargate task instead of a standalone EC2 instance is possible (SigNoz
  publishes an ECS task-definition pattern) but Fargate vCPU/GB-hour pricing for a sustained
  24/7 stateful workload of this shape (4 vCPU/16 GiB) comes out **higher** than the equivalent
  EC2 instance (~$170+/mo before storage) with the added complication that ClickHouse needs
  durable storage Fargate doesn't provide natively (would need EFS, adding latency/cost) —
  **EC2-backed hosting is the more sensible self-host target**, not Fargate, despite the rest of
  the app being Fargate-native.
- **SigNoz Cloud** (SaaS, not evaluated in depth here since the issue asked for self-host
  economics) removes the ClickHouse-ops line item entirely and should be priced as an explicit
  alternative in #346 if the ~$150–175/month self-host floor is judged not worth it for a
  low-traffic app.

---

## 4. Ready-to-run sandbox plan (for the follow-up hands-on session)

This spike did **not** execute the steps below (no Docker in this environment). They are written
so the next session with Docker access can go from zero to a validated SigNoz sandbox in well
under an hour.

### 4.1 docker-compose snippet (illustrative — pull the authoritative file before running)

> SigNoz moved to a single-binary image + `Foundry` installer during 2026. Before running this,
> pull the current compose/installer from
> [github.com/SigNoz/signoz](https://github.com/SigNoz/signoz) (`deploy/` directory) or use
> `curl -sL https://signoz.io/install.sh | bash` per the official install docs, since exact image
> tags and service names change between releases. The shape below is representative of the
> single-node OSS deployment and is enough to sanity-check the plan; treat exact service/image
> names as **TODO: verify against `SigNoz/signoz` `deploy/docker/` at execution time**.

```yaml
# docker-compose.signoz-spike.yml — throwaway sandbox, NOT for production use.
version: "3.9"

services:
  zookeeper:
    image: bitnami/zookeeper:3.9
    environment:
      - ALLOW_ANONYMOUS_LOGIN=yes
    volumes:
      - zookeeper-data:/bitnami/zookeeper

  clickhouse:
    image: clickhouse/clickhouse-server:24.1-alpine
    depends_on:
      - zookeeper
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    volumes:
      - clickhouse-data:/var/lib/clickhouse

  signoz:
    image: signoz/signoz:latest   # TODO: verify current tag — single-binary release
    depends_on:
      - clickhouse
    ports:
      - "8080:8080"   # SigNoz UI
    environment:
      - SIGNOZ_STORAGE_CLICKHOUSE_DSN=tcp://clickhouse:9000

  otel-collector:
    image: signoz/signoz-otel-collector:latest
    depends_on:
      - clickhouse
      - signoz
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC — point the app's existing Collector (#339) here
      - "4318:4318"   # OTLP HTTP

volumes:
  zookeeper-data:
  clickhouse-data:
```

### 4.2 Validation steps

1. **Stand up the sandbox**: `docker compose -f docker-compose.signoz-spike.yml up -d`; wait for
   ClickHouse schema init to finish (watch `otel-collector` logs — it will retry OTLP writes
   until ClickHouse tables exist). Expect 2–5 minutes.
2. **Route OTLP from the existing Collector (#339)**: add a second OTLP exporter (or repoint the
   existing one, whichever is less disruptive to that lane) in the app's Collector config
   pointing at `signoz-otel-collector:4317`. Confirm with `docker compose logs -f
   otel-collector` that spans/metrics/logs are being received and forwarded.
3. **Confirm all three signals land**: open the SigNoz UI (`localhost:8080`), hit the app's
   `/health` or a real endpoint a few times, and verify a trace appears, then click through from
   that trace to its correlated logs and to a service metric — this is the core "OTLP-native
   correlation" claim from §2.2 and is the single most important thing to falsify or confirm.
4. **Build one dashboard**: a panel for backend p50/p95/p99 latency and error rate by route,
   using the auto-generated APM dashboard as a starting point, to sanity-check query performance
   claims from §2.8.
5. **Create one alert rule**: e.g., error rate > 5% over 5 minutes on the backend service; wire
   it to a test Slack webhook or email channel and confirm delivery, to validate §2.4.
6. **Note actual resource usage**: `docker stats` the ClickHouse and Collector containers under
   light synthetic load and compare against the 16 GB/8 vCPU minimum-recommendation claim in §2.6
   and §3 — this is the biggest assumption in this desk spike worth empirically checking.
7. **Tear down**: `docker compose -f docker-compose.signoz-spike.yml down -v` (the `-v` matters —
   ClickHouse/ZooKeeper volumes should not linger on a shared sandbox host).

---

## 5. Open questions / risks

- **Undemonstrated end-to-end correlation.** The trace→log→metric correlation claim (§2.2, the
  single biggest reason to pick SigNoz) is well-documented but was not exercised against this
  app's actual instrumentation. This is the highest-priority thing for the follow-up sandbox
  session to confirm.
- **Real resource usage at this app's actual volume is unmeasured.** §3's cost estimate is built
  from SigNoz's *published* minimums, not from observing this app's telemetry volume hitting a
  live ClickHouse node. Actual usage could be comfortably under the minimum-recommended sizing
  (most self-hosters over-provision against vendor minimums) or could reveal the minimums are
  optimistic — only the sandbox run in §4 can settle this.
- **Community vs. Enterprise self-hosted feature gap.** SSO/SAML/OIDC appears scoped to SigNoz
  Cloud and *Enterprise* Self-Hosted, not the free community self-hosted edition (§2.7). This
  spike could not fully confirm which specific auth/RBAC features are actually gated in the OSS
  build versus just under-documented for community self-hosters — worth a direct check against
  a running community-edition instance.
- **Upgrade cadence risk is a projection, not a measurement.** §2.5/§2.6 cite a real Feb-2026
  breaking migration change and community-reported upgrade pain, but this spike did not perform
  an actual version-to-version upgrade to see how disruptive it is in practice for a solo
  maintainer's cadence (e.g., upgrading once a quarter vs. tracking releases closely).
- **SigNoz Cloud was not evaluated as an alternative**, even though it would remove most of the
  operational-burden and resource-footprint objections in §2.5/§2.6/§3. If #346 leans toward
  SigNoz on technical merits, SigNoz Cloud pricing should be gathered before ruling it out on
  cost/ops grounds alone.
- **No side-by-side data from #344.** This document was written in isolation per file-ownership
  rules; #346 will need to reconcile this scorecard against the Grafana LGTM spike's scorecard,
  including checking that both spikes interpreted the shared rubric criteria consistently.

### What was NOT validated in this desk spike

- Standing up SigNoz and observing it run (no Docker in this environment).
- Routing real OTLP traffic from this app's Collector and confirming ingestion.
- Building an actual dashboard or firing an actual alert rule.
- Measuring real CPU/RAM/disk usage against this app's actual telemetry volume.
- Performing a live version upgrade to observe migration behavior firsthand.
- Confirming exactly which RBAC/SSO features are present in the free community self-hosted
  build versus gated to Enterprise/Cloud.
- SigNoz Cloud pricing and feature parity as a non-self-host alternative.
