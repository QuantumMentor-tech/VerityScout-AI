import 'server-only';
import { ResearchRunExportSnapshot, HistoryExportSnapshot } from './export.types';

/**
 * Escapes markdown-sensitive characters in table cells to maintain table alignment and prevent injection.
 */
export function escapeMarkdownTableCell(text: unknown): string {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/**
 * Escapes raw user text in headers and body text.
 */
export function escapeMarkdownText(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Serializes a detailed research run snapshot into an evidence-linked Markdown report.
 */
export function serializeRunToMarkdown(snapshot: ResearchRunExportSnapshot): string {
  const { run, task, schedule, candidates, evidence, sources, comparison, changes } = snapshot;

  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const lines: string[] = [];

  // 1. Report Title
  lines.push(`# Research Verification Report`);
  lines.push(`**Query:** ${escapeMarkdownText(task.original_query)}`);
  lines.push('');

  // 2. Metadata Block
  lines.push(`## Execution Metadata`);
  lines.push('');
  lines.push(`| Parameter | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| **Run ID** | \`${escapeMarkdownTableCell(run.id)}\` |`);
  lines.push(`| **Task ID** | \`${escapeMarkdownTableCell(task.id)}\` |`);
  lines.push(`| **Status** | **${escapeMarkdownTableCell(run.status)}** |`);
  lines.push(`| **Stage** | \`${escapeMarkdownTableCell(run.current_stage)}\` |`);
  lines.push(`| **Selected Model** | \`${escapeMarkdownTableCell(run.selected_model ?? 'Auto-Routed')}\` (\`${escapeMarkdownTableCell(run.selected_provider ?? 'N/A')}\`) |`);
  lines.push(`| **Started At** | ${escapeMarkdownTableCell(run.started_at)} |`);
  lines.push(`| **Completed At** | ${escapeMarkdownTableCell(run.completed_at ?? 'In-Progress / Interrupted')} |`);

  if (run.execution_duration_ms != null) {
    lines.push(`| **Duration** | ${(run.execution_duration_ms / 1000).toFixed(2)}s |`);
  }
  if (run.usage?.estimatedCostUsd) {
    lines.push(`| **Estimated Cost** | \$${escapeMarkdownTableCell(run.usage.estimatedCostUsd)} USD |`);
  }
  if (schedule) {
    lines.push(`| **Recurring Schedule** | ${escapeMarkdownTableCell(schedule.name ?? schedule.id)} (\`${escapeMarkdownTableCell(schedule.cron_expression)}\` ${escapeMarkdownTableCell(schedule.timezone)}) |`);
  }
  lines.push('');

  // 3. Synthesis Summary (from Step 40)
  if (run.synthesis) {
    lines.push(`## Research Synthesis`);
    lines.push('');
    const syn = run.synthesis as {
      summary?: string;
      findings?: readonly string[];
      limitations?: readonly string[];
      conflicts?: readonly string[];
    };

    if (syn.summary) {
      lines.push(`${escapeMarkdownText(syn.summary)}`);
      lines.push('');
    }

    if (syn.findings && syn.findings.length > 0) {
      lines.push(`### Key Findings`);
      for (const finding of syn.findings) {
        lines.push(`- ${escapeMarkdownText(finding)}`);
      }
      lines.push('');
    }

    if (syn.conflicts && syn.conflicts.length > 0) {
      lines.push(`### Disagreements and Conflicts`);
      for (const conflict of syn.conflicts) {
        lines.push(`> ⚠️ **Conflict:** ${escapeMarkdownText(conflict)}`);
      }
      lines.push('');
    }

    if (syn.limitations && syn.limitations.length > 0) {
      lines.push(`### Evidence Limitations`);
      for (const limit of syn.limitations) {
        lines.push(`- *${escapeMarkdownText(limit)}*`);
      }
      lines.push('');
    }
  }

  // 4. Candidate Results Section
  lines.push(`## Candidate Evaluation Results (${candidates.length})`);
  lines.push('');
  if (candidates.length === 0) {
    lines.push(`*No candidate results met extraction and hard constraint criteria.*`);
    lines.push('');
  } else {
    lines.push(`| Candidate | Price | Availability | Condition | Classification | Passed Constraints |`);
    lines.push(`|---|---|---|---|---|---|`);

    for (const c of candidates) {
      const priceStr = c.price_usd != null ? `${c.price_usd} ${c.currency}` : 'N/A';
      const passedCount = c.constraint_evaluation?.passedConstraints?.length ?? 0;
      const failedCount = c.constraint_evaluation?.failedConstraints?.length ?? 0;
      const constraintSummary = `${passedCount} passed${failedCount > 0 ? `, ${failedCount} failed` : ''}`;

      const titleLink = c.canonical_url
        ? `[${escapeMarkdownTableCell(c.title)}](${c.canonical_url})`
        : escapeMarkdownTableCell(c.title);

      lines.push(
        `| ${titleLink} | ${escapeMarkdownTableCell(priceStr)} | ${escapeMarkdownTableCell(c.availability)} | ${escapeMarkdownTableCell(c.condition)} | \`${escapeMarkdownTableCell(c.classification)}\` | ${escapeMarkdownTableCell(constraintSummary)} |`
      );
    }
    lines.push('');
  }

  // 5. Evidence & Provenance Section
  lines.push(`## Grounded Evidence Claims (${evidence.length})`);
  lines.push('');
  if (evidence.length === 0) {
    lines.push(`*No evidence records captured for this run.*`);
    lines.push('');
  } else {
    lines.push(`| Claim | Normalized Value | State | Verbatim Quote | Source Reference |`);
    lines.push(`|---|---|---|---|---|`);

    for (const e of evidence) {
      const src = sourceMap.get(e.source_id);
      const srcDisplay = src
        ? `[${escapeMarkdownTableCell(src.domain || 'Source')}](${src.canonical_url})`
        : `\`${escapeMarkdownTableCell(e.source_id.slice(0, 8))}\``;

      lines.push(
        `| **${escapeMarkdownTableCell(e.claim_key)}** | \`${escapeMarkdownTableCell(e.normalized_value)}\` | \`${escapeMarkdownTableCell(e.verification_state)}\` | &ldquo;${escapeMarkdownTableCell(e.verbatim_quote)}&rdquo; | ${srcDisplay} |`
      );
    }
    lines.push('');
  }

  // 6. Observation Changes Section (Step 48)
  if (comparison && changes && changes.length > 0) {
    lines.push(`## Observation Changes Detected vs Baseline`);
    lines.push(`**Baseline Run ID:** \`${escapeMarkdownTableCell(comparison.baseline_run_id)}\` &bull; **Status:** \`${escapeMarkdownTableCell(comparison.status)}\``);
    lines.push('');
    lines.push(`| Candidate | Field | Change Type | Delta | Before | After | Reason |`);
    lines.push(`|---|---|---|---|---|---|---|`);

    for (const ch of changes) {
      const deltaStr =
        ch.percentage_delta != null
          ? `${Number(ch.percentage_delta) > 0 ? '+' : ''}${Number(ch.percentage_delta).toFixed(1)}%`
          : '-';

      lines.push(
        `| ${escapeMarkdownTableCell(ch.candidate_title)} | \`${escapeMarkdownTableCell(ch.field_name)}\` | **${escapeMarkdownTableCell(ch.change_type)}** | ${escapeMarkdownTableCell(deltaStr)} | ${escapeMarkdownTableCell(ch.previous_value)} | ${escapeMarkdownTableCell(ch.new_value)} | \`${escapeMarkdownTableCell(ch.reason_code ?? '')}\` |`
      );
    }
    lines.push('');
  }

  // 7. Footer
  lines.push('---');
  lines.push(`*Export generated deterministically by VerityScout AI Export Engine v1.0 at ${new Date().toISOString()}.*`);

  return lines.join('\n') + '\n';
}

/**
 * Serializes a research history collection into a readable Markdown report.
 */
export function serializeHistoryToMarkdown(snapshot: HistoryExportSnapshot): string {
  const lines: string[] = [];

  lines.push(`# Research History Audit Export`);
  lines.push(`**Total Runs Exported:** ${snapshot.runs.length} of ${snapshot.totalCount}`);
  lines.push(`**Exported At:** ${new Date().toISOString()}`);
  lines.push('');

  if (snapshot.runs.length === 0) {
    lines.push(`*No research runs found matching the requested filters.*`);
  } else {
    lines.push(`| Run ID | Title / Query | Status | Model | Candidates | Started At | Duration |`);
    lines.push(`|---|---|---|---|---|---|---|`);

    for (const r of snapshot.runs) {
      const durationStr = r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '-';
      lines.push(
        `| \`${escapeMarkdownTableCell(r.runId.slice(0, 8))}\` | ${escapeMarkdownTableCell(r.taskTitle || r.query)} | \`${escapeMarkdownTableCell(r.status)}\` | \`${escapeMarkdownTableCell(r.selectedModel ?? 'N/A')}\` | ${r.candidateCount} | ${escapeMarkdownTableCell(r.startedAt)} | ${durationStr} |`
      );
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Generated by VerityScout AI Export Engine v1.0.*`);

  return lines.join('\n') + '\n';
}

