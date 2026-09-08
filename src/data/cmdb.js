export const CMDB = {
  'i-0payfront': {
    criticality: 'critique',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-ISO-EC2',
    desc: 'Front paiement',
  },
  'bastion-prod': {
    criticality: 'elevee',
    env: 'prod',
    owner: 'platform',
    sop: 'SOP-BASTION',
    desc: 'Bastion admin',
  },
  'i-07batch': {
    criticality: 'faible',
    env: 'prod',
    owner: 'data',
    sop: 'SOP-ISO-EC2',
    desc: 'Worker batch',
  },
  's3://checkout-logs': {
    criticality: 'elevee',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-S3-IR',
    desc: 'Logs checkout',
  },
  'i-09scanlab': {
    criticality: 'faible',
    env: 'lab',
    owner: 'secops',
    sop: 'SOP-LAB',
    desc: 'Lab scan',
  },
  'nlb-payments': {
    criticality: 'critique',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-ELB',
    desc: 'NLB paiements',
  },
  'login-checkout': {
    criticality: 'critique',
    env: 'prod',
    owner: 'identity',
    sop: 'SOP-WAF-AUTH',
    desc: 'Login checkout',
  },
  'api-checkout': {
    criticality: 'critique',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-WAF-API',
    desc: 'API checkout',
  },
  'api-webhooks': {
    criticality: 'elevee',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-WAF-API',
    desc: 'Webhooks',
  },
  'cdn-edge': {
    criticality: 'faible',
    env: 'prod',
    owner: 'platform',
    sop: 'SOP-CDN',
    desc: 'CloudFront edge',
  },
  'role/checkout-admin': {
    criticality: 'critique',
    env: 'prod',
    owner: 'iam',
    sop: 'SOP-IAM-IR',
    desc: 'Role admin',
  },
  'user/cfo-finance': {
    criticality: 'elevee',
    env: 'prod',
    owner: 'finance',
    sop: 'SOP-IAM-USER',
    desc: 'Compte CFO',
  },
  'user/ops-oncall': {
    criticality: 'faible',
    env: 'prod',
    owner: 'ops',
    sop: 'SOP-IAM-USER',
    desc: 'Astreinte ops',
  },
}

export function lookupCmdb(asset) {
  return (
    CMDB[asset] || {
      criticality: 'faible',
      env: 'prod',
      owner: 'ops',
      sop: 'SOP-L1-TRIAGE',
      desc: 'Asset non recense',
    }
  )
}
