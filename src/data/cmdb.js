export const CMDB = {
  'i-0payfront': {
    criticality: 'vital',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-ISO-EC2',
    desc: 'Front paiement',
  },
  'bastion-prod': {
    criticality: 'sensible',
    env: 'prod',
    owner: 'platform',
    sop: 'SOP-BASTION',
    desc: 'Bastion admin',
  },
  'i-07batch': {
    criticality: 'standard',
    env: 'prod',
    owner: 'data',
    sop: 'SOP-ISO-EC2',
    desc: 'Worker batch',
  },
  's3://checkout-logs': {
    criticality: 'sensible',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-S3-IR',
    desc: 'Logs checkout',
  },
  'i-09scanlab': {
    criticality: 'secondaire',
    env: 'lab',
    owner: 'secops',
    sop: 'SOP-LAB',
    desc: 'Lab scan',
  },
  'nlb-payments': {
    criticality: 'vital',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-ELB',
    desc: 'NLB paiements',
  },
  'login-checkout': {
    criticality: 'vital',
    env: 'prod',
    owner: 'identity',
    sop: 'SOP-WAF-AUTH',
    desc: 'Login checkout',
  },
  'api-checkout': {
    criticality: 'vital',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-WAF-API',
    desc: 'API checkout',
  },
  'api-webhooks': {
    criticality: 'sensible',
    env: 'prod',
    owner: 'payments',
    sop: 'SOP-WAF-API',
    desc: 'Webhooks',
  },
  'cdn-edge': {
    criticality: 'standard',
    env: 'prod',
    owner: 'platform',
    sop: 'SOP-CDN',
    desc: 'CloudFront edge',
  },
  'role/checkout-admin': {
    criticality: 'vital',
    env: 'prod',
    owner: 'iam',
    sop: 'SOP-IAM-IR',
    desc: 'Role admin',
  },
  'user/cfo-finance': {
    criticality: 'sensible',
    env: 'prod',
    owner: 'finance',
    sop: 'SOP-IAM-USER',
    desc: 'Compte CFO',
  },
  'user/ops-oncall': {
    criticality: 'standard',
    env: 'prod',
    owner: 'ops',
    sop: 'SOP-IAM-USER',
    desc: 'Astreinte ops',
  },
}

export function lookupCmdb(asset) {
  return (
    CMDB[asset] || {
      criticality: 'standard',
      env: 'prod',
      owner: 'ops',
      sop: 'SOP-L1-TRIAGE',
      desc: 'Asset non recense',
    }
  )
}
