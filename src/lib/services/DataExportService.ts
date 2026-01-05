/**
 * Data Export Service
 * 
 * Handles exporting session data to CSV and Notion
 */

import type { SessionData, SetData, RepData, FatigueAlert } from './SnatchRepDetector';

export interface NotionConfig {
  apiKey: string;
  databaseId: string;
  parentPageId?: string;
}

export interface ExportOptions {
  includeReps?: boolean;
  includeSets?: boolean;
  includeAlerts?: boolean;
  includePhases?: boolean;
  dateFormat?: 'iso' | 'locale' | 'unix';
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeReps: true,
  includeSets: true,
  includeAlerts: true,
  includePhases: false,
  dateFormat: 'iso',
};

export class DataExportService {
  private notionConfig: NotionConfig | null = null;

  setNotionConfig(config: NotionConfig): void {
    this.notionConfig = config;
  }

  // ==================== CSV Export ====================

  exportSessionToCSV(session: SessionData, options: ExportOptions = {}): string {
    const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const lines: string[] = [];

    // Session summary header
    lines.push('=== SESSION SUMMARY ===');
    lines.push(this.generateSessionSummaryCSV(session, opts));
    lines.push('');

    // Sets data
    if (opts.includeSets && session.sets.length > 0) {
      lines.push('=== SETS ===');
      lines.push(this.generateSetsCSV(session.sets, opts));
      lines.push('');
    }

    // Reps data
    if (opts.includeReps && session.sets.length > 0) {
      lines.push('=== REPS ===');
      lines.push(this.generateRepsCSV(session.sets, opts));
      lines.push('');
    }

    // Fatigue alerts
    if (opts.includeAlerts && session.fatigueAlerts.length > 0) {
      lines.push('=== FATIGUE ALERTS ===');
      lines.push(this.generateAlertsCSV(session.fatigueAlerts, opts));
    }

    return lines.join('\n');
  }

  private generateSessionSummaryCSV(session: SessionData, opts: ExportOptions): string {
    const headers = [
      'Session ID',
      'Start Time',
      'End Time',
      'Duration (min)',
      'KB Weight (kg)',
      'Total Sets',
      'Total Reps',
      'Avg Velocity',
      'Peak Velocity',
      'Avg Power (W)',
      'Total Work (J)',
      'Fatigue Alerts',
    ];

    const formatTime = (ts: number) => this.formatTimestamp(ts, opts.dateFormat!);
    
    const values = [
      session.sessionId,
      formatTime(session.startTime),
      formatTime(session.endTime),
      (session.duration / 60000).toFixed(2),
      session.kettlebellWeight.toString(),
      session.totalSets.toString(),
      session.totalReps.toString(),
      session.averageVelocity.toFixed(3),
      session.peakVelocity.toFixed(3),
      session.averagePower.toFixed(1),
      session.totalWork.toFixed(1),
      session.fatigueAlerts.length.toString(),
    ];

    return `${headers.join(',')}\n${values.join(',')}`;
  }

  private generateSetsCSV(sets: SetData[], opts: ExportOptions): string {
    const headers = [
      'Set #',
      'Start Time',
      'End Time',
      'Duration (s)',
      'Hand',
      'Reps',
      'KB Weight (kg)',
      'Avg Velocity',
      'Peak Velocity',
      'Velocity Dropoff (%)',
      'Avg Power (W)',
      'Fatigue Factor',
    ];

    const formatTime = (ts: number) => this.formatTimestamp(ts, opts.dateFormat!);
    
    const rows = sets.map(set => [
      set.setNumber.toString(),
      formatTime(set.startTime),
      formatTime(set.endTime),
      (set.duration / 1000).toFixed(2),
      set.hand,
      set.totalReps.toString(),
      set.kettlebellWeight.toString(),
      set.averageVelocity.toFixed(3),
      set.peakVelocity.toFixed(3),
      set.velocityDropoff.toFixed(1),
      set.averagePower.toFixed(1),
      set.fatigueFactor.toFixed(3),
    ].join(','));

    return `${headers.join(',')}\n${rows.join('\n')}`;
  }

  private generateRepsCSV(sets: SetData[], opts: ExportOptions): string {
    const headers = [
      'Set #',
      'Rep #',
      'Start Time',
      'Duration (ms)',
      'Hand',
      'Peak Velocity',
      'Mean Velocity',
      'Peak Height',
      'Lockout Time (ms)',
      'Power (W)',
      'Max Shoulder Abduction',
      'Max Elbow Angle',
      'Min Hip Angle',
    ];

    const formatTime = (ts: number) => this.formatTimestamp(ts, opts.dateFormat!);
    
    const rows: string[] = [];
    
    for (const set of sets) {
      for (const rep of set.reps) {
        rows.push([
          set.setNumber.toString(),
          rep.repNumber.toString(),
          formatTime(rep.startTime),
          rep.duration.toFixed(0),
          rep.hand,
          rep.peakVelocity.toFixed(3),
          rep.meanVelocity.toFixed(3),
          rep.peakHeight.toFixed(3),
          rep.lockoutTime.toFixed(0),
          rep.power.toFixed(1),
          rep.jointAngles.maxShoulderAbduction.toFixed(1),
          rep.jointAngles.maxElbowAngle.toFixed(1),
          rep.jointAngles.minHipAngle.toFixed(1),
        ].join(','));
      }
    }

    return `${headers.join(',')}\n${rows.join('\n')}`;
  }

  private generateAlertsCSV(alerts: FatigueAlert[], opts: ExportOptions): string {
    const headers = [
      'Timestamp',
      'Set #',
      'Rep #',
      'Type',
      'Severity',
      'Message',
      'Velocity Drop (%)',
    ];

    const formatTime = (ts: number) => this.formatTimestamp(ts, opts.dateFormat!);
    
    const rows = alerts.map(alert => [
      formatTime(alert.timestamp),
      alert.setNumber.toString(),
      alert.repNumber.toString(),
      alert.type,
      alert.severity,
      `"${alert.message}"`,
      alert.velocityDropPercent?.toFixed(1) ?? '',
    ].join(','));

    return `${headers.join(',')}\n${rows.join('\n')}`;
  }

  downloadCSV(session: SessionData, filename?: string, options?: ExportOptions): void {
    const csv = this.exportSessionToCSV(session, options);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename ?? `snatch_session_${this.formatFilename(session.startTime)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  // ==================== Notion Export ====================

  async exportToNotion(session: SessionData): Promise<{ success: boolean; pageId?: string; error?: string }> {
    if (!this.notionConfig) {
      return { success: false, error: 'Notion configuration not set' };
    }

    try {
      // Create main session page
      const sessionPage = await this.createNotionSessionPage(session);
      
      if (!sessionPage.success) {
        return sessionPage;
      }

      // Add sets as child pages or database entries
      for (const set of session.sets) {
        await this.createNotionSetEntry(set, sessionPage.pageId!);
      }

      return { success: true, pageId: sessionPage.pageId };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async createNotionSessionPage(session: SessionData): Promise<{ success: boolean; pageId?: string; error?: string }> {
    const { apiKey, databaseId } = this.notionConfig!;

    const properties = {
      'Name': {
        title: [
          {
            text: {
              content: `Snatch Session - ${new Date(session.startTime).toLocaleDateString()}`,
            },
          },
        ],
      },
      'Date': {
        date: {
          start: new Date(session.startTime).toISOString(),
          end: new Date(session.endTime).toISOString(),
        },
      },
      'Duration (min)': {
        number: Math.round(session.duration / 60000 * 10) / 10,
      },
      'KB Weight (kg)': {
        number: session.kettlebellWeight,
      },
      'Total Sets': {
        number: session.totalSets,
      },
      'Total Reps': {
        number: session.totalReps,
      },
      'Avg Velocity': {
        number: Math.round(session.averageVelocity * 1000) / 1000,
      },
      'Peak Velocity': {
        number: Math.round(session.peakVelocity * 1000) / 1000,
      },
      'Avg Power (W)': {
        number: Math.round(session.averagePower),
      },
      'Total Work (J)': {
        number: Math.round(session.totalWork),
      },
      'Fatigue Alerts': {
        number: session.fatigueAlerts.length,
      },
    };

    try {
      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties,
          children: this.generateNotionSessionContent(session),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Failed to create Notion page' };
      }

      const data = await response.json();
      return { success: true, pageId: data.id };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  private generateNotionSessionContent(session: SessionData): any[] {
    const blocks: any[] = [];

    // Session overview heading
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📊 Session Overview' } }],
      },
    });

    // Summary stats
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [{
          type: 'text',
          text: {
            content: `Duration: ${(session.duration / 60000).toFixed(1)} min | ` +
                     `Sets: ${session.totalSets} | Reps: ${session.totalReps} | ` +
                     `KB: ${session.kettlebellWeight}kg`,
          },
        }],
        icon: { emoji: '🏋️' },
      },
    });

    // Velocity metrics
    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: '⚡ Velocity Metrics' } }],
      },
    });

    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: `Average Velocity: ${session.averageVelocity.toFixed(3)} units/frame` },
        }],
      },
    });

    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: `Peak Velocity: ${session.peakVelocity.toFixed(3)} units/frame` },
        }],
      },
    });

    // Power metrics
    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: '💪 Power Output' } }],
      },
    });

    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: `Average Power: ${session.averagePower.toFixed(0)} W` },
        }],
      },
    });

    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: `Total Work: ${session.totalWork.toFixed(0)} J` },
        }],
      },
    });

    // Fatigue alerts
    if (session.fatigueAlerts.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: '⚠️ Fatigue Alerts' } }],
        },
      });

      for (const alert of session.fatigueAlerts.slice(0, 10)) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{
              type: 'text',
              text: { content: `Set ${alert.setNumber}, Rep ${alert.repNumber}: ${alert.message}` },
            }],
          },
        });
      }
    }

    // Sets breakdown
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📋 Sets Breakdown' } }],
      },
    });

    for (const set of session.sets) {
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{
            type: 'text',
            text: { content: `Set ${set.setNumber} (${set.hand} hand) - ${set.totalReps} reps` },
          }],
          children: this.generateNotionSetContent(set),
        },
      });
    }

    return blocks;
  }

  private generateNotionSetContent(set: SetData): any[] {
    const blocks: any[] = [];

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: {
            content: `Duration: ${(set.duration / 1000).toFixed(1)}s | ` +
                     `Avg Velocity: ${set.averageVelocity.toFixed(3)} | ` +
                     `Peak Velocity: ${set.peakVelocity.toFixed(3)}`,
          },
        }],
      },
    });

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: {
            content: `Velocity Dropoff: ${set.velocityDropoff.toFixed(1)}% | ` +
                     `Avg Power: ${set.averagePower.toFixed(0)} W | ` +
                     `Fatigue Factor: ${(set.fatigueFactor * 100).toFixed(0)}%`,
          },
        }],
      },
    });

    // Rep details table (simplified as list)
    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: 'Rep Details' } }],
      },
    });

    for (const rep of set.reps) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: {
              content: `Rep ${rep.repNumber}: Peak ${rep.peakVelocity.toFixed(3)}, ` +
                       `Duration ${rep.duration.toFixed(0)}ms, ` +
                       `Power ${rep.power.toFixed(0)}W`,
            },
          }],
        },
      });
    }

    return blocks;
  }

  private async createNotionSetEntry(set: SetData, parentPageId: string): Promise<void> {
    // This could be extended to create separate database entries for each set
    // For now, sets are included as page content in the main session page
  }

  // ==================== Utility Methods ====================

  private formatTimestamp(timestamp: number, format: 'iso' | 'locale' | 'unix'): string {
    switch (format) {
      case 'iso':
        return new Date(timestamp).toISOString();
      case 'locale':
        return new Date(timestamp).toLocaleString();
      case 'unix':
        return timestamp.toString();
      default:
        return new Date(timestamp).toISOString();
    }
  }

  private formatFilename(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
  }

  // Generate a downloadable JSON file
  exportSessionToJSON(session: SessionData): string {
    return JSON.stringify(session, null, 2);
  }

  downloadJSON(session: SessionData, filename?: string): void {
    const json = this.exportSessionToJSON(session);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename ?? `snatch_session_${this.formatFilename(session.startTime)}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }
}
