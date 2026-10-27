# Button tone to variant

Replace `<Button tone="primary" label="Save" />` with `<Button variant="primary" label="Save" />`. The quiet option also becomes `variant="quiet"`. This removes a public prop and requires a major component contract and shared package release. No independent Button package exists.

Compile the migrated consumer fixture against the packed candidate. Review rendered states, keyboard activation and visual intent before any actual release. Local type checks and SSR tests do not establish visual or accessibility acceptance.
