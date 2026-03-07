import type { PiCommandResult } from "@/features/workspace/types";

import { CommandOutputPanel } from "@/components/sidebar/settings/CommandOutputPanel";

export function CommandsSection({
  lastResult,
}: {
  lastResult: PiCommandResult | null;
}) {
  return (
    <section className="settings-card">
      <h3 className="settings-card-title">Pi CLI</h3>
      <CommandOutputPanel result={lastResult} />
    </section>
  );
}
