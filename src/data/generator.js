const CATALOG = [
  { source: 'GuardDuty', prefix: 'GD', type: 'UnauthorizedAPICall', asset: 'i-0payfront', resourceType: 'EC2', criticalOk: true },
  { source: 'GuardDuty', prefix: 'GD', type: 'SSHBruteForce', asset: 'bastion-prod', resourceType: 'EC2', criticalOk: true },
  { source: 'GuardDuty', prefix: 'GD', type: 'CryptoCurrencyMining', asset: 'i-07batch', resourceType: 'EC2', criticalOk: false },
  { source: 'GuardDuty', prefix: 'GD', type: 'ExfiltrationS3', asset: 's3://checkout-logs', resourceType: 'S3', criticalOk: true },
  { source: 'GuardDuty', prefix: 'GD', type: 'PortProbe', asset: 'i-09scanlab', resourceType: 'EC2', criticalOk: false },
  { source: 'GuardDuty', prefix: 'GD', type: 'HealthCheckProbe', asset: 'nlb-payments', resourceType: 'ELB', criticalOk: false },
  { source: 'WAF', prefix: 'WAF', type: 'CredentialStuffing', asset: 'login-checkout', resourceType: 'API Gateway', criticalOk: true },
  { source: 'WAF', prefix: 'WAF', type: 'SqlInjectionAttempt', asset: 'api-checkout', resourceType: 'API Gateway', criticalOk: true },
  { source: 'WAF', prefix: 'WAF', type: 'RateLimitBurst', asset: 'api-webhooks', resourceType: 'API Gateway', criticalOk: false },
  { source: 'WAF', prefix: 'WAF', type: 'ScannerUserAgent', asset: 'cdn-edge', resourceType: 'CloudFront', criticalOk: false },
  { source: 'SIEM', prefix: 'SIEM', type: 'PrivilegeEscalation', asset: 'role/checkout-admin', resourceType: 'IAM', criticalOk: true },
  { source: 'SIEM', prefix: 'SIEM', type: 'ImpossibleTravel', asset: 'user/cfo-finance', resourceType: 'IAM', criticalOk: true },
  { source: 'SIEM', prefix: 'SIEM', type: 'FailedMfaBurst', asset: 'user/ops-oncall', resourceType: 'IAM', criticalOk: false },
  { source: 'SIEM', prefix: 'SIEM', type: 'OffHoursLogin', asset: 'user/ops-oncall', resourceType: 'IAM', criticalOk: false },
]

const seq = { GD: 9100, WAF: 9100, SIEM: 9100 }

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function rand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function rollSeverity(criticalOk) {
  const n = Math.random()
  if (criticalOk && n < 0.02) return 'CRITICAL'
  if (n < 0.12) return 'HIGH'
  if (n < 0.55) return 'MEDIUM'
  return 'LOW'
}

function scoreFor(severity) {
  if (severity === 'CRITICAL') return rand(88, 97)
  if (severity === 'HIGH') return rand(62, 84)
  if (severity === 'MEDIUM') return rand(30, 54)
  return rand(8, 24)
}

function randomIp() {
  return `${rand(32, 220)}.${rand(1, 254)}.${rand(1, 254)}.${rand(1, 254)}`
}

export function resetLiveSeq() {
  seq.GD = 9100
  seq.WAF = 9100
  seq.SIEM = 9100
}

export function generateAlert() {
  const template = pick(CATALOG)
  const severity = rollSeverity(template.criticalOk)
  const id = `${template.prefix}-${seq[template.prefix]++}`
  return {
    id,
    severity,
    source: template.source,
    type: template.type,
    asset: template.asset,
    resourceType: template.resourceType,
    region: 'eu-west-1',
    score: scoreFor(severity),
    ip: randomIp(),
    star: false,
  }
}
