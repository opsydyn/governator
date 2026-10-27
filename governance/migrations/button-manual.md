# Manual migration plan

Inventory Button import sites, replace tone with variant, rebuild each known consumer and run its interaction/visual/accessibility checks. Preserve existing event handlers and disabled behavior. Confirm the new package version in the consumer's lockfile, prepare rollback to the prior package and obtain owner approval. No codemod or downstream deployment is claimed here.
