# Spike: Grafana LGTM + Faro as the OTel Backend

**Issue:** [#344 \[Spike\] Evaluate Grafana LGTM + Faro as the OTel backend](https://github.com/ale-sanchez-g/open-prompt-manager/issues/344)
**Paired spike:** #345 (SigNoz, identical rubric) · **Decision:** #346 (ADR)
**Date:** 2026-07-05
**Author:** Lane L6 (Eval & Docs)
**Method:** Desk spike (research + docs review). **A hands-on sandbox run was
not performed in this environment because Docker is unavailable here.** See
[§4](#4-ready-to-run-sandbox-plan-for-the-follow-up) for the exact steps and
compose file needed to complete the validation, and [§5](#5-what-was-not-validated-in-this-desk-spike)
for the full list of unverified claims.

---

## 1. Executive summary + recommendation stance

Grafana's "LGTM" stack (**L**oki for logs, **G**rafana for visualization,
**T**empo for traces, **M**imir/Prometheus for metrics) plus the **Faro** Web
SDK for frontend RUM is a mature, OTLP-native, fully open-source observability
backend used at very large scale in production by many companies. For this
app's situation — a FastAPI + React app on ECS Fargate behind an OTel
Collector sidecar (#339), run by a solo maintainer — the stack's biggest
strength (native, unified cross-signal correlation with a huge ecosystem) is
matched by its biggest weakness (it is a **suite of independent stateful
services**, not a single binary). The commonly-referenced quick-start image,
[`grafana/docker-otel-lgtm`](https://github.com/grafana/docker-otel-lgtm), is
explicitly documented by Grafana Labs as being for **development, demo, and
testing only** — not production. Running this stack "for real" means
operating Loki + Tempo + Mimir + Grafana (+ Alloy or reusing the existing OTel
Collector) as four-plus independent components, each with its own storage
backend, retention/compaction settings, and upgrade cadence.

**Recommendation stance (pending the hands-on run in §4):** Grafana LGTM is a
**strong technical fit but a heavier operational fit** for a lean, one-person
team than its selling points suggest. It scores well on correlation quality,
Faro/RUM maturity, ecosystem longevity, and raw AWS compute cost, but loses
points on operational burden (multiple stateful services vs. a single
binary+datastore competitor) and on the fact that Grafana's own OSS on-call
tool (Grafana OnCall) was archived in March 2026 in favor of a paid Cloud
product. **Lean toward "viable second choice, not the default,"** unless
#345's SigNoz evaluation turns out to have comparable or worse operational
overhead — the final call belongs to #346 once both spikes and (ideally) a
real sandbox run are in hand.

---

## 2. Scorecard

Scale: 1 = poor / high risk, 5 = excellent / low risk. Total: **33 / 45**.

| # | Criterion | Score | Justification |
|---|-----------|:-:|---|
| 1 | Time-to-first-value / setup effort | **3/5** | The all-in-one [`grafana/docker-otel-lgtm`](https://github.com/grafana/docker-otel-lgtm) container gives a working Grafana+Tempo+Loki+Mimir/Prometheus+Collector stack in one `docker run` — genuinely fast for a demo. But that image is documented as dev/test/demo-only, not production ([Grafana docs](https://grafana.com/docs/opentelemetry/docker-lgtm/)); a real deployment means standing up Loki, Tempo, Mimir, and Grafana as separate services with their own config and object storage, which is a multi-hour-to-multi-day effort the first time, not a five-minute one. |
| 2 | OTLP-native traces+metrics+logs correlation | **5/5** | The stack is designed around OTLP end to end: Tempo, Loki (via OTLP log ingestion) and Mimir all accept OTLP natively, and Grafana Explore supports jumping from a trace span to correlated logs and from a metric spike to the traces behind it via exemplars ([oneuptime write-up](https://oneuptime.com/blog/post/2026-02-06-lgtm-stack-opentelemetry/view), [Grafana blog on Faro](https://grafana.com/oss/faro/)). This is the strongest, most first-party OTLP correlation story of any self-hostable OSS backend. |
| 3 | Frontend RUM quality (Faro) | **4/5** | [Faro Web SDK](https://github.com/grafana/faro-web-sdk) is a purpose-built, actively developed RUM agent (Faro v2 shipped in 2026, upgrading to Web Vitals v5) capturing performance metrics, JS errors, console logs, user events, and traces, exportable directly via OTLP/HTTP to any OTel Collector and correlated with backend traces/logs in the same Grafana instance ([Grafana Faro OSS](https://grafana.com/oss/faro/)). Docked one point because it still requires wiring a collector receiver/pipeline and building your own dashboards — it is not as "batteries-included" as a commercial RUM product out of the box. |
| 4 | Alerting & on-call ergonomics | **3/5** | Grafana's unified alerting (rule eval, state, routing, notification all inside Grafana) is genuinely more ergonomic than raw Alertmanager for a small team — e.g., mute timings vs. hand-managed silences, and folder/RBAC-scoped alert rules ([Alertmanager vs Grafana Alerting, 2026](https://alexandre-vazquez.com/alertmanager-vs-grafana-alerting/)). However, **Grafana OnCall (the OSS on-call/escalation tool) was archived as read-only on 2026-03-24**, with development continuing only in the paid Grafana Cloud IRM product. For a solo maintainer this means "alerting" is fine natively, but formal on-call scheduling/escalation requires either a third-party tool (PagerDuty/Opsgenie via webhook) or a paid Grafana Cloud add-on. |
| 5 | Operational burden (components, storage, upgrades) | **2/5** | This is the stack's weakest point for a lean team. Production-grade LGTM is Loki + Tempo + Mimir + Grafana (+ Alloy or the existing Collector) — 4-5 independently versioned, independently upgraded stateful services, each needing its own object-storage bucket, compactor, and retention config ([Mimir object storage docs](https://grafana.com/docs/mimir/latest/configure/configure-object-storage-backend/), [Tempo S3 docs](https://grafana.com/docs/tempo/latest/configuration/hosted-storage/s3/)). Official sizing guidance is written for distributed/clustered mode ([Loki sizing docs](https://grafana.com/docs/loki/latest/setup/size/)); "monolithic mode" for small scale is possible but comparatively under-documented and still means operating 4+ moving parts vs. a single-binary/single-datastore competitor. |
| 6 | Resource footprint / cost to self-host on AWS | **4/5** | Run in single-process "monolithic mode" per component, the raw compute footprint at this app's traffic scale is genuinely cheap (see §3 — roughly $75-120/month all-in on Fargate + S3). Tempo in particular needs only object storage to operate at low cost. Scored 4 rather than 5 because monolithic mode has no redundancy (each component is a single point of failure) and because the cited "$300k/yr in SRE labor" figures floating around vendor blogs are almost certainly overstated for a stack this small — flagged as unverified marketing framing, not a real data point for this app's scale. |
| 7 | Access control / multi-user / SOC2-friendliness | **3/5** | Grafana OSS ships basic RBAC (org roles: Admin/Editor/Viewer) and folder-based team permissions sufficient for a small team ([Grafana RBAC docs](https://grafana.com/docs/grafana/latest/administration/roles-and-permissions/access-control/)). But fine-grained folder-level RBAC and label-based multi-tenant access control (LBAC) are Enterprise/Cloud-only, and **SOC2/ISO27001/PCI certification applies to Grafana Cloud, not the self-hosted OSS build** ([Grafana Cloud compliance docs](https://grafana.com/docs/learning-hub/is-grafana-cloud-right-for-me/03-manage-cost-time-security/02-platform-management/)) — self-hosting means you own the compliance story yourself (network isolation, audit logging, access reviews), same as with any other self-hosted OSS tool. |
| 8 | Data retention & query performance | **4/5** | All three datastores support S3/S3-compatible object storage with configurable retention (Loki via compactor + `retention_period`, Tempo via `block_retention`, Mimir via per-tenant overrides), and TraceQL is genuinely fast when queries stick to `&&`-only, scoped-attribute predicates that push down into the Parquet layer ([Tempo TraceQL tuning docs](https://grafana.com/docs/tempo/latest/traceql/tune-traceql-queries/)). Scored 4 not 5 because getting good performance requires deliberate query hygiene and optional caching (Memcached/Redis) — there is a real tuning learning curve, and none of it has been measured against this app's actual data yet. |
| 9 | Community, docs, longevity, licensing (AGPL) | **5/5** | Grafana Labs is a large, well-funded company (~1,800 employees, reported $9B valuation) with a huge, active OSS community across Grafana/Loki/Tempo/Mimir/Alloy and extremely thorough docs. Longevity risk is low. **Licensing note:** Grafana, Loki, and Tempo relicensed from Apache-2.0 to **AGPLv3** in 2021 ([Grafana Labs blog](https://grafana.com/blog/grafana-loki-tempo-relicensing-to-agplv3/)). The AGPL's network-copyleft clause only triggers if you *modify* the code and *offer the modified version to third parties over a network* — running unmodified LGTM as this app's own internal telemetry backend does not trigger that obligation. It is still worth a one-time note to whoever owns SOC2/legal review, since AGPL is on some enterprises' "avoid" lists by policy, not just by law. |

---

## 3. Rough monthly AWS self-host cost estimate

**Sizing assumptions (small scale, matches this app's actual Terraform):**
- Backend: 2 Fargate tasks × 512 CPU units / 1024 MiB (`terraform/variables.tf`)
- Frontend: 2 Fargate tasks × 256 CPU units / 512 MiB
- RDS: single `db.t4g.micro`, single-AZ (dev/small-prod profile)
- Traffic: low — a solo-maintainer internal/small-user-base tool, order of a
  few requests/sec peak, not sustained high throughput
- Telemetry volume estimate at that traffic: low tens of thousands of spans/day,
  a few GB/day of logs, a few hundred active metric series
- Deployed as **monolithic-mode** single-process Loki + Tempo + Mimir +
  Grafana (not distributed/clustered mode — that would be significant
  over-provisioning for this scale), each as its own small ECS Fargate
  service, reusing the OTel Collector already planned in #339 as the
  ingestion front door (so its cost is out of scope here — it's shared with
  whichever backend wins #346)

| Component | Fargate size | vCPU-hr/mo | GB-hr/mo | Est. cost/mo* |
|---|---|---:|---:|---:|
| Grafana | 0.25 vCPU / 0.5 GB | 182.5 | 365 | ~$9 |
| Mimir (monolithic) | 0.5 vCPU / 1 GB | 365 | 730 | ~$18 |
| Loki (monolithic) | 0.5 vCPU / 1 GB | 365 | 730 | ~$18 |
| Tempo (monolithic) | 0.5 vCPU / 1 GB | 365 | 730 | ~$18 |
| **Fargate subtotal** | 1.75 vCPU / 3.5 GB | | | **~$63/mo** |
| S3 (3 buckets: loki/tempo/mimir blocks, ~20-30 GB retained at 30-day retention + request/API costs from compactors and queries) | | | | **~$10-15/mo** |
| Misc (CloudWatch log group for the new services, minor data transfer, sharing the existing ALB for the Grafana UI listener) | | | | **~$5-10/mo** |
| **Total** | | | | **≈ $80-90/month** (call it **$75-120/month** to allow for log-volume growth and S3 request costs, which scale with query/compaction frequency more than raw data size) |

\* Using approximate Fargate on-demand pricing (~$0.04048/vCPU-hr, ~$0.004445/GB-hr,
us-east-1-class pricing); not validated against an actual AWS Pricing
Calculator run or Cost Explorer data — treat as order-of-magnitude, not a
quote.

**Tempting shortcut, explicitly not recommended:** running
`grafana/docker-otel-lgtm` itself as a single Fargate task (~1 vCPU/2 GB ≈
$36/month) is cheaper and simpler, but Grafana Labs documents this image as
dev/demo/test tooling only — it lacks the separated, durable, per-component
storage configuration a production deployment needs, and bundles everything
behind one restart/failure domain. Do not use it as the production target
even though it is the fastest thing to try in the sandbox run.

**Alternative not costed in detail:** Amazon Managed Grafana handles only the
visualization layer (per-user pricing) and would still require self-hosting
or Amazon Managed Prometheus/OpenSearch for the metrics/logs/traces stores —
likely a wash or net-more-expensive option for a stack this small, and it
reintroduces vendor lock-in that the "self-host OTel backend" spike is meant
to avoid. Not pursued further here.

---

## 4. Ready-to-run sandbox plan for the follow-up

This section is the concrete, "just run it" plan for whoever picks up the
hands-on validation once Docker is available. It intentionally uses
monolithic-mode single-binary services (not distributed mode) to match the
small-scale target above, plus MinIO as an S3 stand-in so the sandbox
exercises real object-storage-backed retention rather than local ephemeral
disks.

### docker-compose.yaml (sandbox reference — not committed to the app repo)

```yaml
version: "3.8"

services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: lgtm
      MINIO_ROOT_PASSWORD: lgtm12345
    ports: ["9000:9000", "9001:9001"]
    volumes: ["minio-data:/data"]

  createbuckets:
    image: minio/mc:latest
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 lgtm lgtm12345; do sleep 1; done;
      mc mb -p local/loki-data local/tempo-data local/mimir-data;
      exit 0;"

  loki:
    image: grafana/loki:3.x
    command: ["-config.file=/etc/loki/loki-config.yaml"]
    volumes: ["./config/loki-config.yaml:/etc/loki/loki-config.yaml:ro"]
    depends_on: [createbuckets]
    ports: ["3100:3100"]

  tempo:
    image: grafana/tempo:latest
    command: ["-config.file=/etc/tempo/tempo-config.yaml"]
    volumes: ["./config/tempo-config.yaml:/etc/tempo/tempo-config.yaml:ro"]
    depends_on: [createbuckets]
    ports: ["3200:3200", "4317:4317", "4318:4318"]  # OTLP gRPC/HTTP in

  mimir:
    image: grafana/mimir:latest
    command: ["-config.file=/etc/mimir/mimir-config.yaml"]
    volumes: ["./config/mimir-config.yaml:/etc/mimir/mimir-config.yaml:ro"]
    depends_on: [createbuckets]
    ports: ["9009:9009"]

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes: ["./config/otel-collector-config.yaml:/etc/otelcol/config.yaml:ro"]
    ports:
      - "4319:4317"   # OTLP gRPC — point the app's existing #339 Collector here as a second exporter, or point the app directly here for the sandbox
      - "4320:4318"   # OTLP HTTP — also used by the Faro web SDK
    depends_on: [loki, tempo, mimir]

  grafana:
    image: grafana/grafana:latest
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: "Admin"
    volumes:
      - "./config/grafana-datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml:ro"
    ports: ["3000:3000"]
    depends_on: [loki, tempo, mimir]

volumes:
  minio-data:
```

`config/otel-collector-config.yaml` should route:
`otlp receiver -> traces -> tempo exporter (otlp, tempo:4317)`,
`otlp receiver -> metrics -> prometheusremotewrite exporter (mimir:9009/api/v1/push)`,
`otlp receiver -> logs -> loki exporter (or otlphttp to loki:3100/otlp)`.
`config/grafana-datasources.yaml` should provision Loki/Tempo/Mimir as
datasources with `derivedFields`/exemplar linking enabled so trace↔log↔metric
correlation is actually testable, not just present in theory.

### Validation steps for the follow-up session

1. `docker compose up -d` and confirm all six containers report healthy
   (`docker compose ps`); note actual `docker stats` CPU/memory against the
   §3 sizing assumptions.
2. Point the app's OTel Collector (from #339) — or the app's SDK directly for
   a quick smoke test — at `localhost:4319` (gRPC) / `:4320` (HTTP) instead of
   the Collector's current no-op/console exporter.
3. Generate traffic against the FastAPI backend (a handful of requests across
   a few endpoints, including at least one that errors) to produce a
   representative mix of traces, metrics, and logs.
4. Open Grafana at `localhost:3000`, confirm the Loki/Tempo/Mimir datasources
   are auto-provisioned and query each one directly (Explore) for the traffic
   just generated.
5. **Correlation check:** open a trace in Tempo Explore and confirm the
   "Logs for this span" / derived-field link jumps to the matching Loki log
   lines — this is the specific claim in scorecard row 2 that needs
   hands-on confirmation.
6. **One dashboard:** build a single Grafana dashboard panel (e.g., request
   rate or p95 latency from Mimir) using the generated traffic.
7. **One alert rule:** create one Grafana unified-alerting rule (e.g., error
   rate > threshold over 5m) with a contact point (webhook or email) and
   confirm it fires and resolves correctly.
8. **Faro smoke test:** add the `@grafana/faro-web-sdk` snippet to the React
   frontend's dev build, point it at `http://localhost:4320` (OTLP/HTTP), load
   a page, trigger a JS error, and confirm a Faro session with the error and a
   correlated trace appears in Grafana.
9. Record real resource usage (`docker stats`) and any config friction
   encountered, and fold corrections back into §2 and §3 of this document
   before #346 makes the final call.

---

## 5. Open questions / risks — what was NOT validated in this desk spike

This entire evaluation is desk research (official docs, project READMEs, and
third-party write-ups from 2026) — **no component of the LGTM/Faro stack was
actually run** in this environment. Specifically not validated:

- **Actual resource consumption.** §3's Fargate sizing is an estimate based on
  published Fargate pricing and generic "small deployment" guidance, not a
  measured `docker stats`/CloudWatch run against this app's real telemetry
  volume.
- **Trace↔log↔metric correlation in practice.** The OTLP-native correlation
  story (scorecard row 2) is well documented but was not clicked through —
  whether exemplar links and derived fields "just work" with this app's
  instrumentation (from #340) or need manual wiring is unknown.
- **Faro end-to-end.** Whether the Faro Web SDK cleanly correlates a frontend
  session/error with the corresponding backend trace for *this specific*
  React app (#341) has not been tried.
- **Integration with the real #339 Collector config.** The sandbox plan above
  assumes the app's OTel Collector can simply gain a second set of exporters;
  the actual `otel.tf`/collector config from #339 didn't exist yet in this
  environment to test against.
- **Alerting and on-call in practice.** Whether Grafana's unified alerting UX
  is actually preferable to the alternative (SigNoz's alerting, in #345) for
  a one-person on-call rotation is untested; the Grafana OnCall archival
  (2026-03-24) means any long-term on-call tooling decision needs its own
  follow-up regardless of which backend wins #346.
- **Upgrade/operational pain over time.** How disruptive upgrading 4+
  independently-versioned components turns out to be in practice (breaking
  config changes, schema migrations in Loki/Tempo/Mimir) was not tested — only
  read about.
- **AGPL exposure for this specific product.** The read here (no obligation
  triggered for pure internal use) is a reasonable good-faith reading of the
  license, not a legal opinion; if this app is ever offered as a hosted
  product to third parties in a way that bundles Grafana components, this
  should get an actual legal review before #346 finalizes.
- **Cost estimate accuracy.** §3 has not been run through the AWS Pricing
  Calculator or reconciled against Cost Explorer; treat the numbers as
  order-of-magnitude only.
- **Query performance at this app's real cardinality/volume.** TraceQL/LogQL/
  PromQL performance tuning advice was gathered from docs, not measured
  against this app's actual label cardinality or query patterns.

---

## Sources

- [grafana/docker-otel-lgtm (GitHub)](https://github.com/grafana/docker-otel-lgtm)
- [Docker OpenTelemetry LGTM — Grafana docs](https://grafana.com/docs/opentelemetry/docker-lgtm/)
- [An OpenTelemetry backend in a Docker image — Grafana Labs blog](https://grafana.com/blog/an-opentelemetry-backend-in-a-docker-image-introducing-grafana-otel-lgtm/)
- [Grafana Alloy | OpenTelemetry Collector distribution](https://grafana.com/oss/alloy-opentelemetry-collector/)
- [Grafana Faro OSS](https://grafana.com/oss/faro/)
- [grafana/faro-web-sdk (GitHub)](https://github.com/grafana/faro-web-sdk)
- [Grafana, Loki, and Tempo will be relicensed to AGPLv3 — Grafana Labs blog](https://grafana.com/blog/grafana-loki-tempo-relicensing-to-agplv3/)
- [Q&A with Grafana Labs CEO on relicensing](https://grafana.com/blog/qa-with-our-ceo-on-relicensing/)
- [Licensing — Grafana Labs](https://grafana.com/licensing/)
- [Prometheus Alertmanager vs Grafana Alerting (2026)](https://alexandre-vazquez.com/alertmanager-vs-grafana-alerting/)
- [Grafana Alerting docs](https://grafana.com/docs/grafana/latest/alerting/)
- [Grafana Role-based access control (RBAC) docs](https://grafana.com/docs/grafana/latest/administration/roles-and-permissions/access-control/)
- [Is Grafana Cloud right for me — compliance and security](https://grafana.com/docs/learning-hub/is-grafana-cloud-right-for-me/03-manage-cost-time-security/02-platform-management/)
- [Size the cluster — Grafana Loki docs](https://grafana.com/docs/loki/latest/setup/size/)
- [Configure Grafana Mimir object storage backend](https://grafana.com/docs/mimir/latest/configure/configure-object-storage-backend/)
- [Amazon S3 and S3-compatible storage — Grafana Tempo docs](https://grafana.com/docs/tempo/latest/configuration/hosted-storage/s3/)
- [Tune TraceQL query performance — Grafana Tempo docs](https://grafana.com/docs/tempo/latest/traceql/tune-traceql-queries/)
- [Working at Grafana Labs in 2026 (headcount/valuation)](https://jobsbyculture.com/blog/working-at-grafanalabs-2026)
- [AWS EC2 Pricing Guide (2026)](https://www.usage.ai/blogs/aws/ec2/pricing/)
