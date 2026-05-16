# Pluto EC2 Deployment Runbook

Last updated: 2026-05-17

## 1) Current Status (Latest Verified)

- Local changes are committed and pushed to GitHub branch `learning-modes`.
- Latest deployed commit: `7e943e9` (`Add EC2 deployment and AWS cost runbook`).
- Deployment script used: `scripts/deploy-frontend-ec2.sh`.
- Latest successful deployment time: 2026-05-17 (IST).
- Result: `SUCCESS`.
- Verification evidence:
  - Server commit SHA: `7e943e9`
  - Nginx status: `active`
  - Public URL: `https://pluto.akcero.ai` returned `HTTP/1.1 200 OK`

## 2) Deployment Topology (From Repo)

Confirmed from production host + deployment script:

- Host/IP: `65.1.22.81`
- SSH user: `ubuntu`
- App directory: `/var/www/pluto`
- Repo URL: `https://github.com/akcerosky/pluto.git`
- Default branch in script: `main` (override supported)
- Runtime: static frontend build + Nginx reload (`npm ci`, `npm run build`, `nginx -t`, `systemctl reload nginx`)
- Environment file copied to server: `.env.production` -> `/var/www/pluto/.env.production` -> copied as `.env`
- EC2 instance type: `t2.micro`
- EC2 instance ID: `i-044c8678bce81929d`
- Root disk: `8 GB` (`xvda`, root partition ~`7 GB`, mounted `/`)

## 3) Exact Deployment Procedure

Run from repo root.

### 3.1 Deploy latest pushed branch

```bash
BRANCH=learning-modes \
KEY_PATH=/c/Users/prave/Downloads/Pluto/.tmp/manish-pluto-copy.pem \
LOCAL_ENV_FILE=.env.production \
./scripts/deploy-frontend-ec2.sh
```

Notes:
- This script builds `dist` on EC2 itself.
- If deploying `main`, omit `BRANCH` override.
- If provided key is at `C:\Users\prave\manish-pluto.pem`, copy it into workspace first:

```powershell
Copy-Item -LiteralPath "C:\Users\prave\manish-pluto.pem" -Destination "C:\Users\prave\Downloads\Pluto\.tmp\manish-pluto-copy.pem" -Force
```

### 3.2 What the script does on EC2

1. Ensures `/var/www/pluto` exists.
2. Uploads `.env.production`.
3. Clones repo if missing.
4. `git fetch origin <branch>`
5. `git reset --hard origin/<branch>`
6. `cp .env.production .env`
7. `npm ci`
8. `npm run build`
9. `sudo nginx -t`
10. `sudo systemctl reload nginx`

## 4) Verification Checklist

After script success, run:

```bash
ssh -i <key.pem> ubuntu@65.1.22.81 "cd /var/www/pluto && git rev-parse --short HEAD"
ssh -i <key.pem> ubuntu@65.1.22.81 "cd /var/www/pluto && ls -la dist | head"
ssh -i <key.pem> ubuntu@65.1.22.81 "sudo systemctl status nginx --no-pager -l | head -n 40"
curl -I https://pluto.akcero.ai
```

Success criteria:
- Git SHA on server matches expected commit.
- `dist/` exists and is freshly built.
- Nginx is active and config test passes.
- Public endpoint returns `200` or `304`.

Latest successful verification snapshot:
- `git rev-parse --short HEAD` -> `7e943e9`
- `systemctl is-active nginx` -> `active`
- `curl -I https://pluto.akcero.ai` -> `HTTP/1.1 200 OK`

## 5) Rollback Procedure

If latest deploy fails:

```bash
ssh -i <key.pem> ubuntu@65.1.22.81
cd /var/www/pluto
git log --oneline -n 10
git reset --hard <previous_good_commit>
npm ci
npm run build
sudo nginx -t
sudo systemctl reload nginx
```

## 6) AWS Infra and Cost Documentation

## 6.1 Confirmed vs Unknown

Confirmed:
- EC2 host exists and is targeted by direct SSH.
- Nginx serves built frontend from EC2.
- EBS is implicitly used (all EC2 root volumes are EBS-backed unless explicitly instance-store AMI).
- Instance type confirmed: `t2.micro`.
- Instance public IPv4 confirmed: `65.1.22.81`.
- Root block device observed as `8 GB` (`xvda`).

Unknown in this session (requires successful SSH/AWS Console):
- EBS volume type (`gp3`, `gp2`, etc.) from AWS console/billing view.
- Whether Elastic IP is attached/billed.
- Whether Route 53, CloudFront, ALB/NLB, WAF, CloudWatch Logs/alarms are configured.

## 6.2 How to collect exact AWS facts (required once access works)

From EC2:

```bash
curl -s http://169.254.169.254/latest/meta-data/instance-type
curl -s http://169.254.169.254/latest/meta-data/instance-id
curl -s http://169.254.169.254/latest/meta-data/public-ipv4
lsblk
df -h
```

From AWS CLI (preferred for billing accuracy):

```bash
aws ec2 describe-instances --instance-ids <instance-id>
aws ec2 describe-volumes --filters Name=attachment.instance-id,Values=<instance-id>
aws ec2 describe-addresses
```

## 6.3 Cost model to estimate daily and monthly cost

Total monthly estimate:

```text
EC2 compute + EBS storage + EBS snapshots + Data transfer out + Elastic IP + Monitoring/Logs + Optional add-ons
```

Compute:

```text
Monthly EC2 = hourly_on_demand_rate * 24 * 30
Daily EC2   = hourly_on_demand_rate * 24
```

EBS:

```text
Monthly EBS volume = provisioned_GB * EBS_price_per_GB_month
Monthly snapshots  = snapshot_GB * snapshot_price_per_GB_month
```

Bandwidth:

```text
Data out to internet is billed per GB after applicable free tier.
Inter-AZ transfers and NAT paths can add additional per-GB charges.
```

Elastic IP:

```text
Public IPv4/Elastic IP may be billed even when attached, and is definitely billed when idle.
```

## 6.4 Hidden/optional AWS costs to check explicitly

- EBS snapshots retained over time.
- CloudWatch custom metrics, alarms, and log ingestion/retention.
- Data transfer out to internet and cross-AZ traffic.
- NAT Gateway charges if private subnet egress is used.
- Route 53 hosted zone + DNS query charges.
- ACM is free for public certs, but private CA is not.
- Load balancer hourly + LCU charges (if ALB/NLB exists).
- WAF per-web-ACL/rule/request charges.
- AWS Systems Manager advanced features (if enabled).

## 6.5 Other AWS services indirectly used by Pluto

From codebase/repo evidence:
- Amazon Bedrock runtime endpoints are used by Cloud Functions for Nova models (`bedrock-runtime.<region>.amazonaws.com`).
- Main app platform remains primarily Firebase/Google Cloud for auth, database, hosting/functions.

So yes, AWS is used both:
- directly for EC2-hosted frontend deployment path, and
- indirectly for AI inference via Bedrock/Nova integration.

## 7) Source References For Pricing Validation

- AWS EC2 pricing: https://aws.amazon.com/ec2/pricing/
- AWS EBS pricing: https://aws.amazon.com/ebs/pricing/
- AWS data transfer pricing: https://aws.amazon.com/ec2/pricing/on-demand/
- Elastic IP docs/pricing notes: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html
- AWS Price List API docs: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api-fetching-price-list-files-manually.html
