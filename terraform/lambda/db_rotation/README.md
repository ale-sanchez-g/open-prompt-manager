# DATABASE_URL rotation Lambda

Secrets Manager rotation function for the `DATABASE_URL` secret
(`aws_secretsmanager_secret.db_url`). It rotates the RDS PostgreSQL master-user
password in place, keeping the value as a single libpq/SQLAlchemy connection
string so the application's `DATABASE_URL` contract is unchanged.

## Files

| File | Purpose |
|------|---------|
| `lambda_function.py` | Rotation handler (4-step single-user contract). |
| `requirements.txt`   | Runtime dependency (`pg8000`, pure-Python). |
| `build.sh`           | Vendors dependencies into this directory for packaging. |

## Packaging

Terraform packages this directory with `data.archive_file` (see
`terraform/rotation.tf`). The handler imports `pg8000`, which is **not** in the
Lambda runtime, so the dependency must be vendored before `terraform apply`:

```bash
terraform/lambda/db_rotation/build.sh
```

`deploy.sh` runs this automatically. The vendored packages are git-ignored.

## Rotation behaviour

Single-user strategy: the master user's password is changed in place during
rotation. Running ECS tasks keep their existing pooled connections (cached
`DATABASE_URL` from task start) until they are recycled, after which new tasks
pick up the rotated secret. For zero-downtime rotation, either run rotation
during a maintenance window with a forced ECS deployment, or migrate the
application to IAM database authentication (now enabled on the instance). See
`docs/adr-secrets-rotation-iam-auth.md`.
